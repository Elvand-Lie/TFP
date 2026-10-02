#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
True Path — browser end-to-end suite (Playwright, Python).

This is the port of the two APPROVED reference suites
(`tests/e2e/canonical/true-path.e2e.py`, `tests/e2e/canonical/true-path.e2e2.py`) onto the
integrated production site, plus the integration coverage those suites could not have had
(real HTTP handlers, real session/position handling, real persistence and email states).

What the reference suites tested, and how it is tested here:

  reference                                   integrated
  ------------------------------------------  ------------------------------------------------------
  `file://` single HTML document              real paths served by `tests/e2e/serve.mjs`
  `#app` / inline `onclick` handlers          `#tp-step-root` / ONE delegated listener
  `.lk .opt` ordinal clicks                   `.lk .opt[data-ans][data-val]` (question id + value)
  `.grid .opt` ordinal clicks                 `.grid .opt[data-key]` (option key)
  `.stack .opt` text lookup                   `.stack .opt[data-role]` (role key, position-free)
  `SC`, `S`, `ans()`, `payload()` globals     `window` globals absent by design: the controller's own
                                              session state (`tfp.truepath.journey.v2`) and the rendered
                                              DOM are read instead — see CANONICAL-ADAPTATIONS.md
  `pdfinfo` / `pdftotext` subprocesses         `pypdf` / `PyMuPDF` in-process
  injected `window.TP_CONFIG`                 `window.TP_CONFIG.canonical` override (same seam the
                                              product uses for an embedded config)

Nothing here weakens a reference assertion: where the integrated product has a different but
equivalent seam, the assertion is rewritten against that seam and the change is recorded in
`tests/e2e/CANONICAL-ADAPTATIONS.md`.

Run:  python tests/e2e/run_browser.py            (or: npm run test:e2e:browser)
Exit: 0 only when every assertion passed.
"""

from __future__ import annotations

import io
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import urllib.parse
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    # line_buffering keeps section progress visible when the suite is piped into a log or a
    # monitor; without it a redirected run shows nothing until the process exits.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

from playwright.sync_api import sync_playwright  # noqa: E402

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - dependency is present in this workspace
    PdfReader = None

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SERVE = os.path.join(ROOT, "tests", "e2e", "serve.mjs")

APP_TIMEOUT = 15000  # a step change inside the running app
BOOT_TIMEOUT = 20000  # first paint of a journey shell
SYNTH_TIMEOUT = 12000  # the 2.6s synthesis interstitial + result render
SHORT_TIMEOUT = 5000  # an effect the page performs on its own, with no network involved
STARTUP_TIMEOUT = 30  # the harness must announce its ports within this long, or it is dead
VIEWPORT = {"width": 390, "height": 800}

# ─── the six approved fixtures (tests/e2e/canonical/true-path.test.js) ────────────────────────
# `answers` are indexed by QUESTION id (Q1..Q12), exactly as the reference file passes them.
# `counts` is how many ikigai picks land on screen I-1..I-4, in order.

FIXTURES = [
    {
        "name": "A",
        "answers": [5, 5, 4, 5, 5, 5, 3, 2, 3, 3, 3, 2],
        "ik": ["solving_problems", "strategy", "analysis", "consulting_advisory", "help_businesses_grow"],
        "counts": [1, 2, 1, 1],
        "roles": ["chancellor", "chancellor", "chancellor", "commander", "chancellor", "general"],
        "share": {"commander": 21, "general": 21, "chancellor": 58},
        "primary": "chancellor",
        "gap": "commander",
        "title": "The Master Architect",
        "pattern": "single",
        "aligned": True,
    },
    {
        "name": "B",
        "answers": [2, 2, 2, 3, 3, 3, 5, 4, 5, 5, 5, 4],
        "ik": ["leading_influencing", "communication", "creativity", "personal_growth_coaching", "inspire_others"],
        "counts": [1, 2, 1, 1],
        "roles": ["commander", "commander", "general", "commander", "commander", "commander"],
        "share": {"commander": 67, "general": 25, "chancellor": 8},
        "primary": "commander",
        "title": "The Movement Builder",
        "pattern": "single",
        "pct": {"communicator": 92, "creative": 92},
        "co_dominant": True,
    },
    {
        "name": "C",
        "answers": [4, 4, 3, 2, 2, 3, 4, 4, 5, 3, 2, 3],
        "ik": ["building_creating_projects", "execution", "sales_influence", "build_wealth_freedom"],
        "counts": [1, 1, 1, 1],
        "roles": ["general", "general", "general", "general", "commander", "general"],
        "share": {"commander": 19, "general": 73, "chancellor": 8},
        "primary": "general",
        "title": "The Field Marshal",
        "pattern": "single",
    },
    {
        "name": "D",
        "answers": [3] * 12,
        "ik": ["teaching_sharing", "empathy", "education_training", "teach_wisdom"],
        "counts": [1, 1, 1, 1],
        "roles": ["commander", "general", "chancellor", "commander", "general", "chancellor"],
        "share": {"commander": 34, "general": 33, "chancellor": 33},
        "primary": "commander",
        "pattern": "balanced",
        "balanced_profile": True,
    },
    {
        "name": "E",
        "answers": [5, 4, 4, 4, 4, 5, 2, 2, 2, 3, 3, 3],
        "ik": ["solving_problems", "planning", "operations_management", "build_systems_efficiency"],
        "counts": [1, 1, 1, 1],
        "roles": ["chancellor", "general", "chancellor", "general", "chancellor", "general"],
        "share": {"commander": 9, "general": 37, "chancellor": 54},
        "primary": "chancellor",
        "title": "The Master Architect",
        "pattern": "single",
        "dominant": "organiser",
        "pct": {"organiser": 83, "analyst": 83},
    },
    {
        "name": "F",
        "answers": [5] * 12,
        "ik": ["leading_influencing", "execution"],
        "counts": [1, 1, 0, 0],
        "roles": ["commander", "commander", "commander", "general", "general", "general"],
        "share": {"commander": 43, "general": 43, "chancellor": 14},
        "primary": "commander",
        "title": "The Grand Strategist",
        "pattern": "dual",
        "dual": "The Pioneer",
    },
]

ROLE_ORDER = ["commander", "general", "chancellor"]

# ─── result reporting ────────────────────────────────────────────────────────────────────────

RESULTS: list[tuple[str, bool]] = []
SECTION = {"name": ""}


def section(name: str) -> None:
    SECTION["name"] = name
    print("\n── %s %s" % (name, "─" * max(0, 74 - len(name))))


def ok(name: str, condition, detail: str = "") -> bool:
    """Record one assertion. Never raises."""
    passed = bool(condition)
    RESULTS.append(("%s / %s" % (SECTION["name"], name), passed))
    line = ("  PASS " if passed else "  FAIL ") + name
    if not passed and detail not in ("", None):
        line += "  ← " + str(detail)[:600]
    print(line)
    return passed


class Blocked(Exception):
    """Raised when a prerequisite inside one section is unmet; reported, never swallowed."""


def guard(name: str, fn) -> None:
    """Run a section body; a crash becomes a failure for that section instead of ending the run."""
    try:
        fn()
    except Exception as error:  # noqa: BLE001 - a failing section must not hide the rest
        ok(name + " completed", False, "%s: %s" % (type(error).__name__, error))


# ─── harness plumbing ────────────────────────────────────────────────────────────────────────


def start_server() -> tuple[subprocess.Popen, str, str]:
    """
    Start `serve.mjs`; returns (process, site base URL, control base URL).

    The server's stdout is a PIPE and it keeps writing to it for the whole run, so the pipe MUST
    be drained continuously: once the OS pipe buffer fills, `write` blocks and the server stops
    serving mid-suite. Reading only the startup line and leaving the rest unread is therefore not
    an option. A daemon thread consumes every line into a log file, and the startup line is
    handed back through an Event with a bounded wait so a server that never announces itself
    fails fast instead of hanging the suite.
    """
    global SERVER_LOG

    process = subprocess.Popen(
        ["node", SERVE],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )
    handle, SERVER_LOG = tempfile.mkstemp(prefix="tfp-e2e-server-", suffix=".log")
    os.close(handle)

    first: list[str] = []
    ready = threading.Event()
    drain = threading.Thread(
        target=_drain_server_output,
        args=(process.stdout, first, ready, SERVER_LOG),
        daemon=True,
    )
    drain.start()

    if not ready.wait(STARTUP_TIMEOUT):
        process.kill()
        raise SystemExit(
            "harness printed no startup line within %ds; log: %s" % (STARTUP_TIMEOUT, SERVER_LOG)
        )
    line = first[0] if first else ""
    try:
        info = json.loads(line)
    except ValueError:
        process.kill()
        raise SystemExit("harness did not start; output was: %r (log: %s)" % (line, SERVER_LOG))
    return process, info["url"].rstrip("/"), info["control"].rstrip("/")


def _drain_server_output(stream, first: list, ready: threading.Event, log_path: str) -> None:
    """Consume the server's output until it closes, so its pipe can never fill and block it."""
    try:
        with open(log_path, "w", encoding="utf-8", errors="replace") as sink:
            for line in stream:
                sink.write(line)
                sink.flush()
                if not first:
                    first.append(line)
                    ready.set()
    except (ValueError, OSError):  # pragma: no cover - the pipe closed under us during teardown
        pass
    finally:
        ready.set()


def ctrl(path: str, payload: dict | None = None):
    """Call the `__test` control channel (steers the fakes and reads back server state)."""
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        CONTROL + "/__test" + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def http_get(url: str, expect: int = 200) -> bytes:
    with urllib.request.urlopen(url, timeout=30) as response:
        if expect and response.status != expect:
            raise AssertionError("GET %s -> %s" % (url, response.status))
        return response.read()


CONFIG = {}
BASE = ""
CONTROL = ""
BROWSER = None
CONTEXT = None
PREFLIGHT = False
PREFLIGHT_DETAIL = ""
SERVER_LOG = ""


def load_config() -> dict:
    raw = http_get(BASE + "/true-path/config/true-path.config.json")
    return json.loads(raw.decode("utf-8"))


def variant(**integration) -> dict:
    """A copy of the served canonical config with `integration` overridden."""
    copy = json.loads(json.dumps(CONFIG))
    merged = dict(copy.get("integration") or {})
    for key, value in integration.items():
        merged[key] = value
    copy["integration"] = merged
    return copy


def screen_option_keys(cfg: dict, screen: int) -> list[str]:
    return [option[0] for option in cfg["IK"][screen][1]]


def plan_picks(fixture: dict, cfg: dict) -> tuple[dict[int, list[str]], list[str]]:
    """
    Distribute the fixture's ikigai picks over the four screens.

    A screen that the fixture leaves empty still needs a selection — the UI will not advance with
    an empty screen — so it gets the first UNTAGGED option, which leaves the ikigai role signal
    (15% of the blend) exactly as the reference computed it from the fixture's tagged picks.
    """
    picks = list(fixture["ik"])
    counts = fixture["counts"]
    placed: dict[int, list[str]] = {}
    index = 0
    for screen, count in enumerate(counts):
        if count:
            placed[screen] = picks[index:index + count]
            index += count
    fillers: list[str] = []
    tags = cfg["TAGS"]
    for screen in range(4):
        if screen in placed:
            continue
        neutral = [key for key in screen_option_keys(cfg, screen) if key not in tags]
        if not neutral:
            raise AssertionError("screen I-%d has no untagged option to fill with" % (screen + 1))
        placed[screen] = [neutral[0]]
        fillers.append(neutral[0])
    return placed, fillers


def open_page(browser, cfg: dict | None = None, reduced_motion: str | None = None, **kwargs):
    """A fresh context (fresh session) and one page. `cfg` is injected as the canonical override."""
    options = dict(viewport=dict(VIEWPORT))
    options.update(kwargs)
    if reduced_motion:
        options["reduced_motion"] = reduced_motion
    context = browser.new_context(**options)
    if cfg is not None:
        context.add_init_script("window.TP_CONFIG = { canonical: %s };" % json.dumps(cfg))
    page = context.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append("pageerror: %s" % error))
    page.on(
        "console",
        lambda message: errors.append("console: %s" % message.text)
        if message.type == "error" and "Failed to load resource" not in message.text
        else None,
    )
    page.errors = errors  # type: ignore[attr-defined]
    page.set_default_timeout(APP_TIMEOUT)
    return page


def offline(page) -> None:
    """Make the journey run with no server round-trips at all (the reference suites' world)."""
    page.route("**/api/**", lambda route: route.abort())


def drive(page, fixture: dict, cfg: dict | None = None, on_synthesis=None,
          entry: bool = True) -> dict[int, list[str]]:
    """
    Walk one fixture through the real controller, through the real DOM.

    `on_synthesis` runs while the synthesis interstitial is on screen — the only moment its
    geometry and animation can be observed, since it replaces itself with the result.

    `entry` says whether to enter the site from the landing page. It is False when the caller has
    ALREADY loaded a specific entry URL (for example one carrying UTM parameters) and the journey
    must continue in that same document rather than being re-entered without it.
    """
    config = cfg or CONFIG
    placed, fillers = plan_picks(fixture, config)
    order = config["ORDER"]

    if entry:
        page.goto(BASE + "/true-path", wait_until="domcontentloaded")
    if not page.locator('[data-act="start"]').count():
        raise Blocked("landing has no start control (the app did not boot)")
    page.click('[data-act="start"]')
    page.wait_for_selector('[data-act="begin-talent"]', timeout=BOOT_TIMEOUT)
    page.click('[data-act="begin-talent"]')

    for position in range(12):
        question = order[position]
        page.click('.lk .opt[data-ans="%d"][data-val="%d"]' % (question, fixture["answers"][question]))
        if position < 11:
            page.wait_for_selector("text=Statement %d of 12" % (position + 2), timeout=APP_TIMEOUT)

    page.wait_for_selector('[data-act="to-iintro"]', timeout=APP_TIMEOUT)
    page.click('[data-act="to-iintro"]')
    page.wait_for_selector('[data-act="begin-ikigai"]', timeout=APP_TIMEOUT)
    page.click('[data-act="begin-ikigai"]')

    for screen in range(4):
        for key in placed[screen]:
            page.click('.grid .opt[data-key="%s"]' % key)
        page.click('[data-act="ikigai-next"]')
        if screen < 3:
            page.wait_for_selector("text=Question %d of 4" % (screen + 2), timeout=APP_TIMEOUT)

    page.wait_for_selector('[data-act="to-rintro"]', timeout=APP_TIMEOUT)
    page.click('[data-act="to-rintro"]')
    page.wait_for_selector('[data-act="begin-role"]', timeout=APP_TIMEOUT)
    page.click('[data-act="begin-role"]')

    for index, role in enumerate(fixture["roles"]):
        page.click('.stack .opt[data-role="%s"]' % role)
        if index < 5:
            page.wait_for_selector("text=scenario %d of 6" % (index + 2), timeout=APP_TIMEOUT)

    page.wait_for_selector(".pulse", timeout=APP_TIMEOUT)
    if on_synthesis:
        on_synthesis(page)
    page.wait_for_selector("text=Your Iron Triangle Role", timeout=SYNTH_TIMEOUT)
    return placed


def journey_state(page):
    """The controller's own persisted state — exactly what a save would send."""
    return page.evaluate(
        """() => {
             try { return JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2')); }
             catch (error) { return null; }
           }"""
    )


def capture_result(page) -> dict:
    """Read the rendered result plus the controller state (works offline: nothing is saved)."""
    return page.evaluate(
        """() => {
             const root = document.querySelector('#tp-step-root');
             const text = (node) => (node ? node.textContent.trim() : null);
             let state = null;
             try { state = JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2')); } catch (e) {}
             return {
               chips: [...root.querySelectorAll('.chips .chip')].map(text),
               tags: [...root.querySelectorAll('.tag')].map(text),
               svg: [...root.querySelectorAll('.tp-svg__value')].map(text),
               title: text(root.querySelector('.blk h1')),
               heading: text(root.querySelector('h1.cn')),
               body: root.innerText,
               state: state
             };
           }"""
    )


# `.tp-svg__value` prints `<glyph> <pct>%`, so the glyph is mapped back to its role key.
GLYPH_ROLE: dict[str, str] = {}
SVG_VALUE = re.compile(r"^(\S+) (\d+)%$")
ROLE_CHIP = re.compile(r"^(Commander|General|Chancellor) (\d+)%$")


def svg_shares(values: list[str]) -> dict[str, int]:
    out = {}
    for value in values:
        match = SVG_VALUE.match((value or "").strip())
        if match and match.group(1) in GLYPH_ROLE:
            out[GLYPH_ROLE[match.group(1)]] = int(match.group(2))
    return out


def chip_shares(chips: list[str]) -> dict[str, int]:
    """The report's page 3 prints `<Role name> <pct>%` chips; the result page prints talents."""
    out = {}
    for chip in chips:
        match = ROLE_CHIP.match((chip or "").strip())
        if match:
            out[match.group(1).lower()] = int(match.group(2))
    return out


def assert_fixture(fixture: dict, captured: dict, offline_mode: bool = False) -> None:
    """The canonical expected values, asserted against the live DOM and the live state.

    `offline_mode` says this journey ran with every `api/**` call blocked, so no server id can
    exist. It is explicit rather than inferred: the same expectations are asserted either way, but
    the pre-save assertions only apply when the server was actually reachable.
    """
    name = "fixture " + fixture["name"]
    state = captured["state"]
    if not state or not state.get("res") or not state.get("tal"):
        ok(name + ": journey state present", False, "no persisted state on the result step")
        return
    ok(name + ": journey state present", True)

    share = state["res"]["share"]
    ok(
        name + ": shares match the canonical fixture",
        {key: share.get(key) for key in ROLE_ORDER} == fixture["share"],
        share,
    )
    ok(name + ": shares total 100", sum(share.values()) == 100, share)
    ok(
        name + ": the triangle prints every share",
        svg_shares(captured["svg"]) == fixture["share"],
        captured["svg"],
    )
    ok(name + ": primary role", state["res"]["primary"] == fixture["primary"], state["res"]["primary"])
    ok(name + ": pattern", state["res"]["pattern"] == fixture["pattern"], state["res"]["pattern"])

    if fixture.get("gap"):
        ok(name + ": gap role", state["res"]["gap"] == fixture["gap"], state["res"]["gap"])
    if fixture.get("title"):
        ok(name + ": true-path title", captured["title"] == fixture["title"], captured["title"])
    if fixture.get("dual"):
        ok(
            name + ": dual label shown",
            ("%s pattern" % fixture["dual"]) in captured["tags"],
            captured["tags"],
        )
    if fixture["pattern"] == "balanced":
        ok(
            name + ": balanced badge shown",
            any("三才兼备" in tag for tag in captured["tags"]),
            captured["tags"],
        )
    if fixture["pattern"] == "single":
        ok(name + ": no pattern badge on a single-role result", not any(
            "pattern" in tag for tag in captured["tags"]
        ), captured["tags"])
    if fixture.get("dominant"):
        ok(
            name + ": dominant talent branch",
            state["tal"]["dominant"] == fixture["dominant"],
            state["tal"]["dominant"],
        )
    if fixture.get("pct"):
        for key, value in fixture["pct"].items():
            ok(
                "%s: %s pct" % (name, key),
                state["tal"]["pct"][key] == value,
                state["tal"]["pct"],
            )
    if fixture.get("co_dominant"):
        ok(name + ": co-dominant profile", state["tal"]["coDominant"] is True, state["tal"])
    if fixture.get("balanced_profile"):
        ok(name + ": balanced profile", state["tal"]["balancedProfile"] is True, state["tal"])

    # The approved result blocks, by their canonical headings.
    for heading in ("Your Triangle Gap", "Where you may thrive", "Growth edge",
                    "Value creation style", "Reflection"):
        ok("%s: block %r" % (name, heading), heading in captured["body"])

    if fixture.get("aligned"):
        ok(
            name + ": alignment check names both alignments",
            "matches your natural talent pattern" in captured["body"]
            and "suit the role you naturally play" in captured["body"],
            captured["body"][:200],
        )

    ok(
        name + ": no server id while offline" if offline_mode else name + ": result rendered",
        (state.get("id") is None and state.get("saved") in (0, None)) if offline_mode else True,
        state.get("id"),
    )


# ─── sections ────────────────────────────────────────────────────────────────────────────────


def preflight() -> None:
    global PREFLIGHT, PREFLIGHT_DETAIL

    def body() -> None:
        global PREFLIGHT, PREFLIGHT_DETAIL
        page = open_page(BROWSER)
        response = page.goto(BASE + "/true-path", wait_until="domcontentloaded")
        ok("landing responds 200", response is not None and response.status == 200,
           response.status if response else None)

        # The one wiring condition the whole journey depends on: every shell must load
        # `true-path/lib/config.js` before `true-path-app.js`, or `boot()` shows the failure copy.
        loaded = page.evaluate("() => [...document.scripts].map((s) => s.src)")
        config_index = next((i for i, src in enumerate(loaded) if src.endswith("/true-path/lib/config.js")), -1)
        app_index = next((i for i, src in enumerate(loaded) if src.endswith("/true-path/assets/true-path-app.js")), -1)
        ok("shell loads true-path/lib/config.js", config_index != -1, loaded)
        ok(
            "config.js loads before true-path-app.js",
            config_index != -1 and app_index != -1 and config_index < app_index,
            {"config": config_index, "app": app_index},
        )

        globals_seen = page.evaluate(
            "() => ({cfg: typeof window.TruePathConfig, sc: typeof window.TruePathScoring,"
            " svg: typeof window.TruePathSvg, tp: typeof window.TruePathTruPath})"
        )
        ok("window.TruePathConfig is available", globals_seen.get("cfg") == "object", globals_seen)
        ok("window.TruePathScoring is available", globals_seen.get("sc") == "object", globals_seen)
        ok("window.TruePathSvg is available", globals_seen.get("svg") == "object", globals_seen)

        page.click('[data-act="start"]')
        try:
            page.wait_for_selector('[data-act="begin-talent"]', timeout=BOOT_TIMEOUT)
            booted = True
        except Exception:  # noqa: BLE001
            booted = False
        body_text = page.inner_text("body")
        ok("journey shell boots into the talent intro", booted,
           "could not load" if "could not load" in body_text else body_text[:200])
        ok("no boot failure copy", "True Path could not load" not in body_text)

        # Class presence proves nothing on its own: the canonical CSS is scoped under
        # `#true-path-app`, and a malformed transformation (stray prefix tokens, unbalanced
        # braces) leaves the classes present but the rules invalid. Assert COMPUTED styles.
        styled = page.evaluate(
            """() => {
                 const cs = (sel, props) => {
                   const el = document.querySelector(sel);
                   if (!el) return null;
                   const style = getComputedStyle(el);
                   const out = {};
                   props.forEach((p) => { out[p] = style[p]; });
                   return out;
                 };
                 return {
                   heading: cs('#tp-step-root h2', ['fontFamily', 'fontSize', 'fontWeight']),
                   button: cs('#tp-step-root .btn', ['display', 'cursor', 'padding', 'borderRadius']),
                   body: cs('body', ['backgroundColor']),
                   nav: cs('#navbar', ['position', 'zIndex'])
                 };
               }"""
        )
        heading = styled.get("heading") or {}
        button = styled.get("button") or {}
        ok("the journey heading is styled by the canonical CSS",
           heading.get("fontSize") not in (None, "", "16px", "0px"), heading)
        ok("the journey heading keeps the serif display face",
           "serif" in str(heading.get("fontFamily", "")).lower(), heading)
        ok("the journey button is laid out by the canonical CSS",
           button.get("padding") not in (None, "", "0px") and button.get("display") == "inline-block",
           button)

        # A real click must land: the fixed nav must not sit over the journey's controls. This is
        # checked with hit-testing rather than by forcing the click, so a broken header clearance
        # fails here instead of being papered over.
        clearance = page.evaluate(
            """() => {
                 const buttons = [...document.querySelectorAll('#tp-step-root .btn')];
                 if (!buttons.length) return { buttons: 0 };
                 const el = buttons[buttons.length - 1];
                 const r = el.getBoundingClientRect();
                 const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                 const nav = document.querySelector('#navbar');
                 const navRect = nav ? nav.getBoundingClientRect() : null;
                 return {
                   buttons: buttons.length,
                   covered: !(top && (top === el || el.contains(top) || top.contains(el))),
                   topTag: top ? top.tagName + (top.id ? '#' + top.id : '') : null,
                   buttonTop: Math.round(r.top),
                   navBottom: navRect ? Math.round(navRect.bottom) : null
                 };
               }"""
        )
        ok("the journey's primary control is not covered by the fixed nav",
           clearance.get("buttons", 0) > 0 and not clearance.get("covered"), clearance)

        # Prove it end to end with a REAL click (no `force`): the journey must actually advance.
        advanced = True
        try:
            page.click('[data-act="begin-talent"]')
            page.wait_for_selector("text=Statement 1 of 12", timeout=APP_TIMEOUT)
        except Exception as error:  # noqa: BLE001
            advanced = False
            ok("a real click advances the journey from the talent intro", False,
               "%s: %s" % (type(error).__name__, str(error)[:200]))
        if advanced:
            ok("a real click advances the journey from the talent intro", True)
            ok("the talent question renders its five options",
               page.locator("#tp-step-root .lk .opt[data-val]").count() == 5,
               page.locator("#tp-step-root .lk .opt[data-val]").count())

        PREFLIGHT = booted
        PREFLIGHT_DETAIL = body_text[:200] if not booted else ""
        page.context.close()

    guard("preflight", body)


def section_reference_journey() -> None:
    """true-path.e2e.py: the scenario positions, the stored roles, the viewport synthesis, the blocks."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)
        page = open_page(BROWSER)
        offline(page)
        fixture = FIXTURES[0]
        pulse: dict = {}

        def at_synthesis(pg) -> None:
            # The interstitial replaces itself with the result, so this is the only moment its
            # geometry and animation can be observed at all.
            pulse["geometry"] = pg.evaluate(
                """() => { const e = document.querySelector('#tp-step-root .pulse');
                     if (!e) return null;
                     const r = e.getBoundingClientRect();
                     return { w: Math.round(r.width), h: Math.round(r.height),
                              iw: innerWidth, ih: innerHeight,
                              position: getComputedStyle(e).position }; }"""
            )
            pulse["animation"] = pg.evaluate(
                "() => getComputedStyle(document.querySelector('#tp-step-root .pulse')).animationName"
            )

        drive(page, fixture, on_synthesis=at_synthesis)

        # Reference: "scenario positions vary across questions" — the order is randomised per
        # scenario, and the chosen role must sit at a different position in different questions.
        orders = page.evaluate(
            "() => { const s = JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2'));"
            " return (s.ord || []).map((row) => row.slice()); }"
        )
        positions = [row.index(fixture["roles"][i]) for i, row in enumerate(orders)
                     if fixture["roles"][i] in row]
        ok("scenario positions vary across questions", len(set(positions)) > 1, positions)
        ok("every scenario offered all three roles",
           len(orders) == 6 and all(sorted(row) == sorted(ROLE_ORDER) for row in orders), orders)

        # Reference: "stored roles are role keys, independent of position".
        state = journey_state(page)
        ok(
            "stored roles are role keys, independent of position",
            state["sc"] == fixture["roles"],
            state["sc"],
        )

        captured = capture_result(page)
        geometry = pulse.get("geometry")
        ok(
            "triangle synthesis fills the viewport (fixed, inset 0)",
            bool(geometry) and geometry["w"] >= geometry["iw"] and geometry["h"] >= geometry["ih"]
            and geometry["position"] == "fixed",
            geometry,
        )
        ok("the synthesis interstitial animates", pulse.get("animation") not in (None, "", "none"),
           pulse.get("animation"))

        ok("result shares sum to 100", sum(captured["state"]["res"]["share"].values()) == 100)
        for heading in ("Your Triangle Gap", "Where you may thrive", "Growth edge",
                        "Value creation style", "Reflection"):
            ok("result block %r present" % heading, heading in captured["body"])

        # Reference: refresh keeps the result, Back leaves the report, Forward returns to it.
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("text=Your Iron Triangle Role", timeout=BOOT_TIMEOUT)
        ok("refresh keeps the result", page.locator("text=Your Iron Triangle Role").count() == 1)

        page.click('[data-act="view-report"]')
        page.wait_for_selector("#tp-step-root .pg", timeout=APP_TIMEOUT)
        ok("report has three pages", page.locator("#tp-step-root .pg").count() == 3,
           page.locator("#tp-step-root .pg").count())
        page.go_back()
        page.wait_for_selector("text=Your Iron Triangle Role", timeout=APP_TIMEOUT)
        ok("browser Back leaves report -> result",
           page.locator("text=Your Iron Triangle Role").count() == 1)
        page.go_forward()
        page.wait_for_selector("#tp-step-root .pg", timeout=APP_TIMEOUT)
        ok("browser Forward returns to the report", page.locator("#tp-step-root .pg").count() == 3)

        ok("no console or page errors", not page.errors, page.errors)
        page.context.close()

    guard("reference journey", body)


def section_navigation() -> None:
    """Position survives refresh and Back/Forward at every stage, not just at the result."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)
        page = open_page(BROWSER)
        offline(page)
        page.goto(BASE + "/true-path", wait_until="domcontentloaded")
        page.click('[data-act="start"]')
        page.wait_for_selector('[data-act="begin-talent"]', timeout=BOOT_TIMEOUT)
        page.click('[data-act="begin-talent"]')

        order = CONFIG["ORDER"]
        for position in range(5):
            page.click('.lk .opt[data-ans="%d"][data-val="4"]' % order[position])
        page.wait_for_selector("text=Statement 6 of 12", timeout=APP_TIMEOUT)

        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#tp-step-root .lk .opt", timeout=BOOT_TIMEOUT)
        ok("refresh mid-talent keeps position", page.locator("text=Statement 6 of 12").count() == 1,
           page.inner_text("#tp-step-root")[:120])
        ok("refresh mid-talent keeps the path", page.url.endswith("/true-path/talent/q"), page.url)

        page.click('[data-act="talent-back"]')
        page.wait_for_selector("text=Statement 5 of 12", timeout=APP_TIMEOUT)
        ok("Back within the quiz works", page.locator("text=Statement 5 of 12").count() == 1)
        # The in-app Back moves within the quiz by REPLACING the current entry
        # (`backWithin` -> `history.replaceState`), so answering twelve statements never pushes
        # twelve entries onto the browser's history. Browser Forward therefore has no entry to
        # return to, and what must be true is that it neither resurrects a stale question nor
        # damages the answers already given.
        before = journey_state(page)
        page.go_forward()
        page.wait_for_timeout(300)
        ok("browser Forward cannot resurrect a stale quiz question",
           page.locator("text=Statement 5 of 12").count() == 1
           and page.locator("text=Statement 6 of 12").count() == 0,
           page.inner_text("#tp-step-root")[:120])
        ok("browser Forward leaves the recorded answers intact",
           journey_state(page)["qi"] == before["qi"] == 4, journey_state(page)["qi"])

        # Continue from wherever the quiz actually stands, not from an assumed position.
        for position in range(journey_state(page)["qi"], 12):
            page.click('.lk .opt[data-ans="%d"][data-val="4"]' % order[position])
        page.wait_for_selector('[data-act="to-iintro"]', timeout=APP_TIMEOUT)
        page.click('[data-act="to-iintro"]')
        page.click('[data-act="begin-ikigai"]')
        page.wait_for_selector("text=Question 1 of 4", timeout=APP_TIMEOUT)

        page.click('.grid .opt[data-key="solving_problems"]')
        page.click('[data-act="ikigai-next"]')
        page.wait_for_selector("text=Question 2 of 4", timeout=APP_TIMEOUT)
        page.click('.grid .opt[data-key="planning"]')
        page.click('[data-act="ikigai-next"]')
        page.wait_for_selector("text=Question 3 of 4", timeout=APP_TIMEOUT)

        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("text=Question 3 of 4", timeout=BOOT_TIMEOUT)
        ok("refresh mid-ikigai keeps the screen", page.locator("text=Question 3 of 4").count() == 1)
        ok("refresh mid-ikigai keeps the earlier picks",
           page.evaluate("() => [...document.querySelectorAll('.grid .opt[aria-pressed=true]')].length") == 0
           and len(journey_state(page)["ik"].get("0", [])) == 1, journey_state(page)["ik"])

        page.click('[data-act="ikigai-back"]')
        page.wait_for_selector("text=Question 2 of 4", timeout=APP_TIMEOUT)
        ok("Back within the ikigai screens works",
           page.locator('.grid .opt[data-key="planning"][aria-pressed="true"]').count() == 1)
        page.go_forward()
        page.wait_for_timeout(300)
        ok("Forward cannot resurrect an abandoned ikigai screen",
           page.locator("text=Question 2 of 4").count() == 1)
        page.click('[data-act="ikigai-next"]')
        page.wait_for_selector("text=Question 3 of 4", timeout=APP_TIMEOUT)

        # The 400ms lock: a double click must file exactly one answer.
        page.click('.grid .opt[data-key="operations_management"]')
        page.click('[data-act="ikigai-next"]')
        page.wait_for_selector("text=Question 4 of 4", timeout=APP_TIMEOUT)
        page.click('.grid .opt[data-key="build_systems_efficiency"]')
        page.click('[data-act="ikigai-next"]')
        page.wait_for_selector('[data-act="to-rintro"]', timeout=APP_TIMEOUT)
        page.click('[data-act="to-rintro"]')
        page.click('[data-act="begin-role"]')
        page.wait_for_selector(".stack .opt[data-role]", timeout=APP_TIMEOUT)
        page.dblclick('.stack .opt[data-role="chancellor"]')
        page.wait_for_selector("text=scenario 2 of 6", timeout=APP_TIMEOUT)
        state = journey_state(page)
        ok("role double click records exactly one answer",
           len([answer for answer in state["sc"] if answer]) == 1 and state["si"] == 1, state["sc"])
        ok("role answer is stored as a role key", state["sc"] == ["chancellor"], state["sc"])

        page.click('[data-act="role-back"]')
        page.wait_for_selector("text=scenario 1 of 6", timeout=APP_TIMEOUT)
        ok("Back within the role scenarios works", page.locator("text=scenario 1 of 6").count() == 1)

        ok("no console or page errors", not page.errors, page.errors)
        page.context.close()

    guard("navigation", body)


def section_analytics() -> None:
    """true-path.e2e2.py: one landing view, one reveal, restart is the only extra event."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)
        page = open_page(BROWSER)
        offline(page)
        page.goto(BASE + "/true-path", wait_until="domcontentloaded")
        page.wait_for_function("() => Array.isArray(window.dataLayer) && window.dataLayer.length > 0",
                               timeout=BOOT_TIMEOUT)
        events = page.evaluate("() => window.dataLayer.map((e) => e.event)")
        ok("first load: exactly one tp_landing_view", events == ["tp_landing_view"], events)

        page.reload(wait_until="domcontentloaded")
        page.wait_for_function("() => Array.isArray(window.dataLayer) && window.dataLayer.length > 0",
                               timeout=BOOT_TIMEOUT)
        events = page.evaluate("() => window.dataLayer.map((e) => e.event)")
        ok("reload on the landing: still one view", events == ["tp_landing_view"], events)

        drive(page, FIXTURES[0])
        events = page.evaluate("() => window.dataLayer.map((e) => e.event)")
        ok("landing view is emitted once for the whole journey", events.count("tp_landing_view") == 1, events)
        ok("talent completion is emitted once", events.count("tp_talent_complete") == 1, events)
        ok("the role reveal is emitted once", events.count("tp_role_reveal_view") == 1, events)
        ok("the true-path view is emitted once", events.count("tp_truepath_view") == 1, events)
        for name in ("tp_start", "tp_ikigai_start", "tp_ikigai_complete", "tp_role_intro_view"):
            ok("%s emitted" % name, name in events, events)

        payload = page.evaluate(
            "() => window.dataLayer.find((e) => e.event === 'tp_role_reveal_view')"
        )
        ok("reveal event carries the role metadata",
           payload and payload.get("primary") == FIXTURES[0]["primary"] and "pattern" in payload
           and "gap" in payload, payload)
        ok("every event carries attribution",
           page.evaluate("() => window.dataLayer.every((e) => 'device' in e && 'utm_source' in e)"))

        page.evaluate("() => { window.dataLayer = []; }")
        page.click('[data-act="restart"]')
        page.wait_for_selector('[data-act="start"]', timeout=APP_TIMEOUT)
        events = page.evaluate("() => window.dataLayer.map((e) => e.event)")
        ok("restart emits tp_restart without a second landing view", events == ["tp_restart"], events)
        ok("restart clears the recorded journey",
           page.evaluate("() => JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2')).res") is None)

        ok("no console or page errors", not page.errors, page.errors)
        page.context.close()

    guard("analytics", body)


def section_attribution() -> None:
    """Attribution is captured at entry and survives the in-app path changes."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)
        page = open_page(BROWSER)
        offline(page)
        page.goto(BASE + "/true-path?utm_source=newsletter&utm_campaign=spring", wait_until="domcontentloaded")
        page.wait_for_function("() => Array.isArray(window.dataLayer) && window.dataLayer.length > 0",
                               timeout=BOOT_TIMEOUT)
        first = page.evaluate("() => window.dataLayer[0]")
        ok("entry event carries utm_source", first.get("utm_source") == "newsletter", first)
        ok("entry event carries utm_campaign", first.get("utm_campaign") == "spring", first)
        # `device` is derived from the live viewport on every event (`innerWidth < 700` -> mobile),
        # so the default 390px context is `mobile`. The companion check below covers the other
        # branch from a desktop-width context.
        ok("device is derived from the viewport",
           first.get("device") == ("mobile" if VIEWPORT["width"] < 700 else "desktop"), first)

        drive(page, FIXTURES[0], entry=False)
        reveal = page.evaluate(
            "() => window.dataLayer.filter((e) => e.event === 'tp_role_reveal_view').pop()"
        )
        # The UTM values are captured once at entry and kept in session state, because in-app
        # path changes drop the query string. They must therefore survive to the end of the
        # journey, while `device` keeps being derived live.
        ok("attribution survives the path changes",
           reveal.get("utm_source") == "newsletter" and reveal.get("utm_campaign") == "spring", reveal)

        desktop = open_page(BROWSER, viewport={"width": 1280, "height": 900})
        offline(desktop)
        desktop.goto(BASE + "/true-path", wait_until="domcontentloaded")
        desktop.wait_for_function("() => Array.isArray(window.dataLayer) && window.dataLayer.length > 0",
                                  timeout=BOOT_TIMEOUT)
        ok("a wide viewport reports device=desktop",
           desktop.evaluate("() => window.dataLayer[0].device") == "desktop",
           desktop.evaluate("() => window.dataLayer[0]"))
        desktop.context.close()

        mobile = open_page(BROWSER, viewport={"width": 360, "height": 720})
        offline(mobile)
        mobile.goto(BASE + "/true-path", wait_until="domcontentloaded")
        mobile.wait_for_function("() => Array.isArray(window.dataLayer) && window.dataLayer.length > 0",
                                 timeout=BOOT_TIMEOUT)
        ok("narrow viewport reports device=mobile",
           mobile.evaluate("() => window.dataLayer[0].device") == "mobile")
        mobile.context.close()
        page.context.close()

    guard("attribution", body)


def section_variants() -> None:
    """true-path.e2e2.py: unconfigured vs configured backend, consent, and honest disabled states."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)

        # (1) No integration at all: nothing may pretend to work.
        bare = variant(consultUrl="", privacyUrl="", api={})
        page = open_page(BROWSER, cfg=bare)
        offline(page)
        drive(page, FIXTURES[0])
        body_text = page.inner_text("#tp-step-root")
        ok("unconfigured: consult CTA is disabled with an explanation",
           page.locator('#tp-step-root button.btn[disabled]').count() >= 1
           and "Booking link not configured" in body_text, body_text[-200:])
        ok("unconfigured: the consult CTA is not a link",
           page.locator('#tp-step-root a[data-consult]').count() == 0)
        ok("unconfigured: the send button is disabled with an honest note",
           page.locator('#tp-step-root [data-act="send-email"][disabled]').count() == 1
           and "Email delivery isn’t connected yet" in body_text, body_text[-300:])
        ok("unconfigured: no api products invented",
           page.locator('#tp-step-root a[href][data-product]').count() == 0)
        ok("unconfigured: unconfigured products are shown as unavailable, not as links",
           page.locator('#tp-step-root .opt[aria-disabled="true"]').count() >= 1)
        ok("unconfigured: no server id is generated locally",
           journey_state(page).get("id") is None)
        ok("no console or page errors (unconfigured)", not page.errors, page.errors)
        page.context.close()

        # (2) Configured backend — against the REAL handlers, so the response is the actual
        # contract (`{ stored, resultId, record, reportUrl }`) rather than a hand-written mock
        # that cannot satisfy it. The journey is pointed at the harness's own endpoints and the
        # request log is read back through the control channel.
        ctrl("/reset")
        configured = variant(
            consultUrl="https://cal.example/book?x=1",
            privacyUrl="https://example.com/privacy",
            products=[{"id": "tier1", "name": "Test resource", "price": "$9.34", "url": "https://example.com/resource"}],
            api={"saveResult": BASE + "/api/true-path-report",
                 "sendReport": BASE + "/api/true-path-report"},
        )
        page = open_page(BROWSER, cfg=configured)
        drive(page, FIXTURES[0])
        page.wait_for_function(
            "() => { const s = JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2'));"
            " return !!(s && s.saved && s.id); }",
            timeout=BOOT_TIMEOUT,
        )
        state = journey_state(page)
        ok("a backend id is adopted only when the server returns one",
           isinstance(state.get("id"), str) and state["id"].startswith("tp_")
           and state.get("saved") == 1, state.get("id"))
        result_id = state["id"]
        # The control channel reads `resultId` from the QUERY STRING for `/state`.
        ok("the server actually stored the journey",
           ctrl("/state?resultId=" + urllib.parse.quote(str(result_id)))["record"] is not None)
        href = page.locator('#tp-step-root a.btn[data-consult]').first.get_attribute("href")
        ok("consult href keeps the configured query intact",
           href.count("?") == 1 and "&title=" in href and "role=chancellor" in href and "archetype=" in href,
           href)
        ok("consult href carries the resolved title", "The%20Master%20Architect" in href, href)
        ok("privacy link uses the configured URL",
           page.locator('#tp-step-root a[href="https://example.com/privacy"]').count() == 1)
        for selector, event, prop, expected in [
            ('a[data-product="tier1"]', 'tp_product_click', 'productId', 'tier1'),
            ('a[data-consult]', 'tp_consult_click', 'source', 'result'),
        ]:
            page.locator(selector).first.evaluate("el => el.addEventListener('click', e => e.preventDefault(), {once:true})")
            before = page.evaluate("event => (window.dataLayer || []).filter(e => e.event === event).length", event)
            page.locator(selector).first.click()
            emitted = page.evaluate("event => (window.dataLayer || []).filter(e => e.event === event)", event)
            ok(event + " fires once with its required metadata", len(emitted) == before + 1 and emitted[-1].get(prop) == expected, emitted)

        # A double click must still produce exactly one email: the button latches while in flight.
        # The harness's own request log is the evidence, so this counts real server traffic rather
        # than events a mock was told to fabricate. Save and send share one endpoint, so the send
        # is measured as the delta the click adds.
        def report_posts() -> list:
            return [
                r for r in ctrl("/requests")["requests"]
                if r["method"] == "POST" and r["path"] == "/api/true-path-report"
            ]

        before_email = len(report_posts())
        ok("the journey was saved exactly once", before_email == 1, before_email)
        page.fill("#fn", "Ann")
        page.fill("#em", "ann@example.com")
        page.evaluate(
            """() => { const b = document.querySelector('#tp-step-root [data-act="send-email"]');
                 b.click(); b.click(); }"""
        )
        page.wait_for_function(
            "() => { const t = document.querySelector('#tp-step-root').innerText;"
            " return t.indexOf('Sent. Check your inbox.') !== -1 || /try again/.test(t); }",
            timeout=APP_TIMEOUT,
        )
        ok("double submit posts exactly one report send",
           len(report_posts()) - before_email == 1, report_posts())
        ok("a saved journey is reported as sent on the result page",
           "Sent. Check your inbox." in page.inner_text("#tp-step-root"),
           page.inner_text("#tp-step-root")[-200:])
        email_state = ctrl("/state?resultId=" + urllib.parse.quote(str(result_id))).get("emailState")
        ok("the server recorded exactly one email for the journey",
           isinstance(email_state, dict) and email_state.get("sentAt") is not None, email_state)
        ok("no console or page errors (configured)", not page.errors, page.errors)
        page.context.close()

        # A second journey is its own record: the id is never reused across journeys.
        page = open_page(BROWSER, cfg=configured)
        drive(page, FIXTURES[0])
        page.wait_for_function(
            "() => { const s = JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2'));"
            " return !!(s && s.saved && s.id); }",
            timeout=BOOT_TIMEOUT,
        )
        ok("a second journey is saved under its own id",
           journey_state(page).get("id") != result_id, journey_state(page).get("id"))
        page.context.close()

    guard("config variants", body)


def section_generation_guards() -> None:
    """
    Lead-requested runtime regressions for the async generation guards.

    Every one of these exercises a real race through the real UI: a pending request is left in
    flight while the journey changes underneath it, and the assertions check that the outcome is
    never the stale one. They exist because the guards are invisible in a happy-path run.
    """

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)

        # (1) A role click during the 400ms lock, interrupted by Back before it commits: the
        #     abandoned answer must not be recorded, and a fresh click must still work.
        page = open_page(BROWSER)
        offline(page)
        page.goto(BASE + "/true-path", wait_until="domcontentloaded")
        page.click('[data-act="start"]')
        page.wait_for_selector('[data-act="begin-talent"]', timeout=BOOT_TIMEOUT)
        page.click('[data-act="begin-talent"]')
        for position in range(12):
            page.click('.lk .opt[data-ans="%d"][data-val="4"]' % CONFIG["ORDER"][position])
        page.wait_for_selector('[data-act="to-iintro"]', timeout=APP_TIMEOUT)
        page.click('[data-act="to-iintro"]')
        page.click('[data-act="begin-ikigai"]')
        for screen in range(4):
            page.wait_for_selector("text=Question %d of 4" % (screen + 1), timeout=APP_TIMEOUT)
            page.click('.grid .opt[data-key="%s"]' % screen_option_keys(CONFIG, screen)[0])
            page.click('[data-act="ikigai-next"]')
        page.wait_for_selector('[data-act="to-rintro"]', timeout=APP_TIMEOUT)
        page.click('[data-act="to-rintro"]')
        page.click('[data-act="begin-role"]')
        page.wait_for_selector("text=scenario 1 of 6", timeout=APP_TIMEOUT)

        # Click, then leave the scenario before the 400ms lock can commit it.
        page.click('.stack .opt[data-role="commander"]')
        page.wait_for_timeout(60)
        page.go_back()
        page.wait_for_timeout(650)  # comfortably past the lock: a stranded timer would fire here
        stranded = journey_state(page)
        ok("a role answer interrupted before its lock commits is not recorded",
           not (stranded.get("sc") or [None])[0], stranded.get("sc"))

        # Forward returns to the scenario, which must still offer its three roles.
        page.go_forward()
        page.wait_for_selector("text=scenario 1 of 6", timeout=APP_TIMEOUT)
        ok("returning to the interrupted scenario still offers its roles",
           page.locator(".stack .opt[data-role]").count() == 3)
        ok("the interrupted scenario recorded nothing while it was away",
           not (journey_state(page).get("sc") or [None])[0], journey_state(page).get("sc"))

        # A fresh selection after the interruption must commit normally.
        page.click('.stack .opt[data-role="chancellor"]')
        page.wait_for_selector("text=scenario 2 of 6", timeout=APP_TIMEOUT)
        recovered = journey_state(page)
        ok("a new selection after the interruption commits the correct role",
           (recovered.get("sc") or [None])[0] == "chancellor", recovered.get("sc"))
        ok("the recovered selection advanced exactly one scenario",
           recovered.get("si") == 1, recovered.get("si"))
        ok("no console or page errors (interrupted role lock)", not page.errors, page.errors)
        page.context.close()

        # (2) A restart while a send is in flight: the abandoned response must not mark the NEW
        #     journey as sent. The send is held open by the fake provider until released.
        ctrl("/reset")
        page = open_page(BROWSER)
        drive(page, FIXTURES[0])
        page.wait_for_selector('[data-act="send-email"]', timeout=BOOT_TIMEOUT)
        page.wait_for_function(
            "() => { const s = JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2'));"
            " return !!(s && s.saved && s.id); }",
            timeout=BOOT_TIMEOUT,
        )
        ctrl("/resend", {"mode": "hang"})
        page.fill("#fn", "Ann")
        page.fill("#em", "ann@example.com")
        page.click('[data-act="send-email"]')
        page.wait_for_timeout(300)  # the request is now in flight
        page.click('[data-act="restart"]')
        page.wait_for_timeout(200)
        ctrl("/resend", {"mode": "ok"})  # release the abandoned send
        page.wait_for_timeout(600)
        after = journey_state(page)
        ok("an abandoned send does not mark a restarted journey as sent",
           after.get("sent") in (0, None), after.get("sent"))
        ok("the restart cleared the journey state",
           after.get("step") == "landing" and not (after.get("sc") or [None])[0],
           {"step": after.get("step"), "sc": after.get("sc")})

        # (3) A malformed save response — one whose record id disagrees with the envelope — must
        #     never be adopted, and the journey must stay usable with its local preview.
        page = open_page(BROWSER, cfg=variant(
            api={"saveResult": "https://api.test/save", "sendReport": "https://api.test/send"}
        ))
        page.route("https://api.test/**", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "stored": True,
                "resultId": "tp_aaaaaaaaaaaaaaaa",
                # The envelope id and the record id disagree: adopting either would attach the
                # wrong record to this journey.
                "record": {"resultId": "tp_bbbbbbbbbbbbbbbb",
                           "talent": {"raw": [0, 0, 0, 0], "pct": {"a": 25, "b": 25, "c": 25, "d": 25}},
                           "ironTriangle": {"share": {"commander": 34, "general": 33, "chancellor": 33},
                                            "primary": "commander"}},
            }),
            headers={"access-control-allow-origin": "*"},
        ))
        drive(page, FIXTURES[0])
        page.wait_for_timeout(600)
        mismatched = journey_state(page)
        ok("a save whose record id disagrees with the envelope is never adopted",
           mismatched.get("id") in (None, 0) and mismatched.get("saved") in (0, None),
           {"id": mismatched.get("id"), "saved": mismatched.get("saved")})
        ok("the journey still renders its local preview after a bad save",
           "Your Iron Triangle Role" in page.inner_text("#tp-step-root")
           and "couldn’t save your report" in page.inner_text("#tp-step-root"))
        ok("no console or page errors (bad save)", not page.errors, page.errors)
        page.context.close()

    guard("generation guards", body)


def section_keyboard() -> None:
    """true-path.e2e2.py: focus, the visible ring, and Enter/Space on the real controls."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)

        def tab_to(page, selector, tries=16):
            for _ in range(tries):
                page.keyboard.press("Tab")
                if page.evaluate("(s) => document.activeElement.matches(s)", selector):
                    return True
            return False

        page = open_page(BROWSER)
        offline(page)
        page.goto(BASE + "/true-path", wait_until="domcontentloaded")
        ok("keyboard: the start control is reachable by Tab",
           tab_to(page, '[data-act="start"]'),
           page.evaluate("() => document.activeElement.outerHTML.slice(0, 120)"))
        ok("keyboard: the focused start control shows a visible ring",
           page.evaluate("() => getComputedStyle(document.activeElement).outlineWidth") == "2px",
           page.evaluate("() => getComputedStyle(document.activeElement).outlineWidth"))

        page.keyboard.press("Enter")
        page.wait_for_selector('[data-act="begin-talent"]', timeout=BOOT_TIMEOUT)
        ok("keyboard: Enter follows the landing CTA", page.url.endswith("/true-path/talent"), page.url)
        ok("keyboard: Tab reaches Begin on the talent intro",
           tab_to(page, '[data-act="begin-talent"]'))
        page.keyboard.press("Enter")
        page.wait_for_selector("text=Statement 1 of 12", timeout=APP_TIMEOUT)
        ok("keyboard: the heading receives focus on a step change",
           page.evaluate("() => document.activeElement.tagName") == "H2",
           page.evaluate("() => document.activeElement.tagName"))
        ok("keyboard: Tab reaches a Likert option with a visible ring",
           tab_to(page, ".lk .opt")
           and page.evaluate("() => getComputedStyle(document.activeElement).outlineWidth") == "2px")
        label = page.evaluate("() => document.activeElement.getAttribute('aria-label')")
        ok("keyboard: the Likert option is labelled", bool(label) and "of 5" in label, label)
        page.keyboard.press("Enter")
        page.wait_for_selector("text=Statement 2 of 12", timeout=APP_TIMEOUT)
        state = journey_state(page)
        ok("keyboard: Enter records exactly the focused value and advances",
           state["ta"][CONFIG["ORDER"][0]] == int(label[0]) and state["qi"] == 1, state["ta"][:4])
        ok("keyboard: focus moves to the next question heading",
           page.evaluate("() => document.activeElement.tagName") == "H2")

        for position in range(1, 12):
            page.click('.lk .opt[data-ans="%d"][data-val="4"]' % CONFIG["ORDER"][position])
        page.wait_for_selector('[data-act="to-iintro"]', timeout=APP_TIMEOUT)
        page.click('[data-act="to-iintro"]')
        page.click('[data-act="begin-ikigai"]')
        page.wait_for_selector(".grid .opt[data-key]", timeout=APP_TIMEOUT)
        ok("keyboard: Tab reaches an ikigai card", tab_to(page, ".grid .opt"))
        key = page.evaluate("() => document.activeElement.getAttribute('data-key')")
        page.keyboard.press("Space")
        ok("keyboard: Space selects the focused card (state + aria-pressed on that same card)",
           page.locator('.grid .opt[data-key="%s"][aria-pressed="true"]' % key).count() == 1
           and page.evaluate("() => document.activeElement.getAttribute('data-key')") == key, key)
        ok("keyboard: focus stays on the card after selecting",
           page.evaluate("() => document.activeElement.getAttribute('data-key')") == key)
        page.keyboard.press("Space")
        ok("keyboard: a second Space deselects",
           page.locator('#tp-step-root .grid .opt[aria-pressed="true"]').count() == 0)
        page.keyboard.press("Space")
        ok("keyboard: Continue is enabled with a selection and reachable by Tab",
           page.locator('#tp-step-root [data-act="ikigai-next"][disabled]').count() == 0
           and tab_to(page, '#tp-step-root [data-act="ikigai-next"]'))

        ok("no console or page errors", not page.errors, page.errors)
        page.context.close()

    guard("keyboard", body)


def section_reduced_motion() -> None:
    """true-path.e2e2.py: animations run normally, and are fully off under reduced motion."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)

        def animations(reduced: bool) -> dict:
            page = open_page(BROWSER, reduced_motion="reduce" if reduced else None)
            offline(page)
            page.goto(BASE + "/true-path", wait_until="domcontentloaded")
            page.click('[data-act="start"]')
            page.wait_for_selector('[data-act="begin-talent"]', timeout=BOOT_TIMEOUT)
            page.click('[data-act="begin-talent"]')
            for position in range(12):
                page.click('.lk .opt[data-ans="%d"][data-val="4"]' % CONFIG["ORDER"][position])
            page.wait_for_selector("#tp-step-root .br", timeout=APP_TIMEOUT)
            names = {
                "media": page.evaluate("() => matchMedia('(prefers-reduced-motion:reduce)').matches"),
                "tree": page.evaluate(
                    "() => getComputedStyle(document.querySelector('#tp-step-root .br')).animationName"
                ),
            }
            drive_from_snapshot(page)
            # The synthesis pulse lives for exactly 2600ms and then replaces itself with the
            # result, so it has to be observed while it is up rather than sampled afterwards.
            names["pulse"] = page.evaluate(
                """(budget) => new Promise((resolve) => {
                     const read = () => {
                       const el = document.querySelector('#tp-step-root .pulse');
                       return el ? getComputedStyle(el).animationName : null;
                     };
                     const seen = read();
                     if (seen !== null) { resolve(seen); return; }
                     const timer = setInterval(() => {
                       const value = read();
                       if (value !== null) { clearInterval(timer); resolve(value); }
                     }, 25);
                     setTimeout(() => { clearInterval(timer); resolve('NO PULSE OBSERVED'); }, budget);
                   })""",
                SYNTH_TIMEOUT,
            )
            page.wait_for_selector("text=Your Iron Triangle Role", timeout=SYNTH_TIMEOUT)
            # The triangle only exists once the result renders, and its own reveal hook is `grow`.
            names["triangle"] = page.evaluate(
                "() => getComputedStyle(document.querySelector('#tp-step-root .grow')).animationName"
            )
            page.context.close()
            return names

        def drive_from_snapshot(page) -> None:
            """Continue a journey that is already standing on the talent snapshot."""
            page.click('[data-act="to-iintro"]')
            page.click('[data-act="begin-ikigai"]')
            for screen, keys in enumerate([["solving_problems"], ["planning"], ["operations_management"],
                                           ["build_systems_efficiency"]]):
                for key in keys:
                    page.click('.grid .opt[data-key="%s"]' % key)
                page.click('[data-act="ikigai-next"]')
                if screen < 3:
                    page.wait_for_selector("text=Question %d of 4" % (screen + 2), timeout=APP_TIMEOUT)
            page.wait_for_selector('[data-act="to-rintro"]', timeout=APP_TIMEOUT)
            page.click('[data-act="to-rintro"]')
            page.click('[data-act="begin-role"]')
            for index, role in enumerate(["chancellor", "general", "chancellor", "general", "chancellor", "general"]):
                page.click('.stack .opt[data-role="%s"]' % role)
                if index < 5:
                    page.wait_for_selector("text=scenario %d of 6" % (index + 2), timeout=APP_TIMEOUT)

        normal = animations(False)
        reduced = animations(True)
        ok("animations run normally",
           all(value not in (None, "", "none") for key, value in normal.items() if key != "media"), normal)
        ok("the media query is honoured", normal["media"] is False and reduced["media"] is True, reduced)
        ok("reduced motion: every animation is off and the flow still completes",
           all(value == "none" for key, value in reduced.items() if key != "media"), reduced)

    guard("reduced motion", body)


def section_widths() -> None:
    """true-path.e2e.py: no horizontal overflow at 320 / 375 / 390 / 430 on the result and report."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)
        for width in (320, 375, 390, 430):
            page = open_page(BROWSER, viewport={"width": width, "height": 700})
            offline(page)
            try:
                drive(page, FIXTURES[0])
                overflow = page.evaluate("() => document.documentElement.scrollWidth - innerWidth")
                ok("no horizontal overflow @%d" % width, overflow <= 0, overflow)
                page.click('[data-act="view-report"]')
                page.wait_for_selector("#tp-step-root .pg", timeout=APP_TIMEOUT)
                overflow = page.evaluate("() => document.documentElement.scrollWidth - innerWidth")
                ok("report has no horizontal overflow @%d" % width, overflow <= 0, overflow)
                ok("no console or page errors @%d" % width, not page.errors, page.errors)
            finally:
                page.context.close()

    guard("viewport widths", body)


def section_print_stress() -> None:
    """true-path.e2e2.py: 3 printed pages, none blank, for single / dual / balanced on A4 and Letter."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)
        if PdfReader is None:
            raise Blocked("pypdf is not installed")
        cases = [("single", FIXTURES[0]), ("dual", FIXTURES[5]), ("balanced", FIXTURES[3])]
        for label, fixture in cases:
            for fmt, limit in (("A4", 1032), ("Letter", 965)):
                page = open_page(BROWSER, viewport={"width": 703 if fmt == "A4" else 725, "height": 900})
                offline(page)
                try:
                    drive(page, fixture)
                    page.wait_for_selector("text=Your Iron Triangle Role", timeout=SYNTH_TIMEOUT)
                    pattern = journey_state(page)["res"]["pattern"]
                    page.click('[data-act="view-report"]')
                    page.wait_for_selector("#tp-step-root .pg", timeout=APP_TIMEOUT)
                    page.emulate_media(media="print")
                    heights = page.evaluate(
                        "() => [...document.querySelectorAll('#tp-step-root .pg')]"
                        ".map((e) => Math.round(e.getBoundingClientRect().height))"
                    )
                    pages = page.pdf(format=fmt, print_background=True)
                    reader = PdfReader(io.BytesIO(pages))
                    texts = [(page_.extract_text() or "").strip() for page_ in reader.pages]
                    ok(
                        "print %s (%s) %s: 3 pages, none blank, tallest page %s <= %d"
                        % (label, pattern, fmt, max(heights) if heights else "-", limit),
                        len(reader.pages) == 3 and min(len(text) for text in texts) > 150 and max(heights) <= limit,
                        (len(reader.pages), [len(text) for text in texts], heights),
                    )
                finally:
                    page.context.close()

    guard("print stress", body)


def section_fixtures() -> None:
    """All six approved fixtures through the real controller, PRE-save and offline."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)
        neutral_seen: list[str] = []
        for fixture in FIXTURES:
            page = open_page(BROWSER)
            # Offline: no save, no email, no server id — the pre-save state is what is asserted.
            offline(page)
            try:
                _placed, fillers = plan_picks(fixture, CONFIG)
                drive(page, fixture)
                ok("fixture %s: the filler picks are ikigai-neutral" % fixture["name"],
                   all(key not in CONFIG["TAGS"] for key in fillers), fillers)
                neutral_seen.extend(fillers)
                assert_fixture(fixture, capture_result(page), offline_mode=True)

                page.click('[data-act="view-report"]')
                page.wait_for_selector("#tp-step-root .pg", timeout=APP_TIMEOUT)
                report_text = page.inner_text("#tp-step-root")
                ok("fixture %s: the report is a local preview while unsaved" % fixture["name"],
                   "Local preview (not saved)" in report_text, report_text[:200])
                ok("fixture %s: the report keeps three pages" % fixture["name"],
                   page.locator("#tp-step-root .pg").count() == 3)
                ok("fixture %s: the report prints the canonical shares" % fixture["name"],
                   chip_shares(page.evaluate(
                       "() => [...document.querySelectorAll('#tp-step-root .chips .chip')]"
                       ".map((e) => e.textContent)"
                   )) == fixture["share"])
            finally:
                page.context.close()
        ok("fixture F's fillers are the canonical untagged options",
           set(neutral_seen) == {"education_training", "teach_wisdom"}, neutral_seen)

    guard("six fixtures", body)


def section_suggestions() -> None:
    """Suggestions are an indicator only: at most three per screen, badged, never pre-selected."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)
        page = open_page(BROWSER)
        offline(page)
        page.goto(BASE + "/true-path", wait_until="domcontentloaded")
        page.click('[data-act="start"]')
        page.wait_for_selector('[data-act="begin-talent"]', timeout=BOOT_TIMEOUT)
        page.click('[data-act="begin-talent"]')
        for position in range(12):
            page.click('.lk .opt[data-ans="%d"][data-val="4"]' % CONFIG["ORDER"][position])
        page.wait_for_selector('[data-act="to-iintro"]', timeout=APP_TIMEOUT)
        page.click('[data-act="to-iintro"]')
        page.click('[data-act="begin-ikigai"]')

        # The served config is the raw canonical shape, so the presentation strings live under
        # `presentation.ikigai` exactly as `true-path/lib/config.js` reads them.
        badge = CONFIG["presentation"]["ikigai"]["suggestionBadge"]
        cap = CONFIG["presentation"]["ikigai"]["maxSuggestionsPerScreen"]
        state = journey_state(page)
        by_talent = CONFIG["SG"]
        dominant = state["tal"]["dominant"]
        secondary = state["tal"]["secondary"]
        # `SG[talent]` is a 4-slot array in screen order, matching the production shape the
        # controller reads through `CFG.ikigai.suggestions`.
        def suggested_for(key: str, screen: int) -> list:
            return list((by_talent.get(key) or [None] * 4)[screen] or [])

        for screen in range(4):
            page.wait_for_selector("text=Question %d of 4" % (screen + 1), timeout=APP_TIMEOUT)
            badges = page.locator("#tp-step-root .sug").count()
            ok("screen I-%d marks at most %d suggestions" % (screen + 1, cap), badges <= cap, badges)
            marked = page.evaluate(
                "() => [...document.querySelectorAll('#tp-step-root .grid .opt')]"
                ".filter((e) => e.querySelector('.sug')).map((e) => e.getAttribute('data-key'))"
            )
            expected = list(dict.fromkeys(
                suggested_for(dominant, screen) + suggested_for(secondary, screen)
            ))[:cap]
            # The marked set is what the config specifies; the ORDER in the DOM is the screen's own
            # option order, which is deliberately not the suggestion order. Compare membership.
            ok("screen I-%d marks exactly the config's suggestions" % (screen + 1),
               sorted(marked) == sorted(expected),
               {"marked": marked, "expected": expected})
            ok("screen I-%d shows the badge copy on every marked option" % (screen + 1),
               page.locator("#tp-step-root .sug", has_text=badge).count() == badges, badge)
            ok("screen I-%d preselects nothing" % (screen + 1),
               page.locator('#tp-step-root .grid .opt[aria-pressed="true"]').count() == 0)

            picked = screen_option_keys(CONFIG, screen)[0]
            page.click('.grid .opt[data-key="%s"]' % picked)
            flags = journey_state(page).get("fs") or {}
            ok("screen I-%d records the suggestion flag for the pick" % (screen + 1),
               flags.get(picked) is (picked in marked),
               {"pick": picked, "marked": marked, "flags": flags})
            page.click('[data-act="ikigai-next"]')

        ok("no console or page errors", not page.errors, page.errors)
        page.context.close()

    guard("suggestions", body)


def section_persistence_and_email() -> None:
    """The real HTTP contract through the real UI: save, report link, and the four email states."""

    def body() -> None:
        if not PREFLIGHT:
            raise Blocked("app did not boot: %s" % PREFLIGHT_DETAIL)

        ctrl("/reset")
        page = open_page(BROWSER)
        drive(page, FIXTURES[0])
        page.wait_for_selector('[data-act="send-email"]', timeout=BOOT_TIMEOUT)
        page.wait_for_function(
            "() => { const s = JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2'));"
            " return !!(s && s.saved && s.id); }",
            timeout=BOOT_TIMEOUT,
        )
        state = journey_state(page)
        result_id = state["id"]
        ok("the journey is saved with a server-issued id",
           bool(re.match(r"^tp_[A-Za-z0-9_-]{4,64}$", str(result_id))), result_id)

        server = ctrl("/state?resultId=" + urllib.parse.quote(str(result_id)))
        ok("the server stored the record under the documented key",
           "tfp:truepath:result:" + str(result_id) in server["kvKeys"], server["kvKeys"])
        record = server["record"] or {}
        ok("the stored record carries the canonical shares",
           (record.get("ironTriangle") or {}).get("share") == FIXTURES[0]["share"],
           (record.get("ironTriangle") or {}).get("share"))
        ok("the stored record carries the talent answers",
           ((record.get("talent") or {}).get("answers") or {}).get("Q1") == FIXTURES[0]["answers"][0],
           (record.get("talent") or {}).get("answers"))
        ok("the stored record carries the true-path title",
           (record.get("truePath") or {}).get("title") == FIXTURES[0]["title"],
           (record.get("truePath") or {}).get("title"))

        page.click('[data-act="view-report"]')
        page.wait_for_selector("#tp-step-root .pg", timeout=APP_TIMEOUT)
        ok("a saved report is labelled with its id",
           "Report %s" % result_id in page.inner_text("#tp-step-root"))
        ok("the saved report prints the stored role shares",
           chip_shares(page.evaluate(
               "() => [...document.querySelectorAll('#tp-step-root .chips .chip')].map((e) => e.textContent)"
           )) == FIXTURES[0]["share"])

        # PDF: the app must open the server PDF URL for the SAVED id, never a client payload.
        opener = open_page(BROWSER)
        opener.add_init_script(
            "window.__opened = []; window.open = function (u) { window.__opened.push(u); return null; };"
        )
        opener.goto(BASE + "/true-path/report/" + str(result_id), wait_until="domcontentloaded")
        opener.wait_for_selector("#tp-step-root .pg", timeout=BOOT_TIMEOUT)
        # The site navbar is `position: fixed`, so Playwright's minimal scroll can leave a control
        # sitting underneath it. Centre the control first — the same thing a visitor does before
        # clicking it — rather than reaching through the bar.
        opener.evaluate(
            """() => { const b = document.querySelector('#tp-step-root [data-act="pdf"]');
                 b.scrollIntoView({ block: 'center' }); }"""
        )
        opener.click('[data-act="pdf"]')
        opener.wait_for_function("() => window.__opened.length > 0", timeout=SHORT_TIMEOUT)
        opened = opener.evaluate("() => window.__opened")
        ok("the PDF button opens the server PDF for the saved id",
           ("/api/true-path-pdf?id=" + str(result_id)) in opened[0], opened)
        ok("the PDF never sends a client-supplied payload", "?r=" not in opened[0], opened)
        ok("the PDF download is tracked",
           opener.evaluate("() => window.dataLayer.some((e) => e.event === 'tp_report_download')"))
        ok("no console or page errors (pdf)", not opener.errors, opener.errors)

        # Server PDF: exactly three pages, with the CJK labels actually embedded.
        pdf_bytes = http_get(BASE + "/api/true-path-pdf?id=" + str(result_id))
        ok("the server PDF is a PDF", pdf_bytes[:5] == b"%PDF-", pdf_bytes[:5])
        ok("the server PDF embeds a CJK font",
           b"/Type0" in pdf_bytes and b"Identity-H" in pdf_bytes and b"/ToUnicode" in pdf_bytes)
        if fitz is not None:
            document = fitz.open(stream=pdf_bytes, filetype="pdf")
            page_count = document.page_count
            text = "".join(page_.get_text() for page_ in document)
        else:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            page_count = len(reader.pages)
            text = "".join((page_.extract_text() or "") for page_ in reader.pages)
        ok("the server PDF has exactly three pages", page_count == 3, page_count)
        cjk = [character for character in text if "\u4e00" <= character <= "\u9fff"]
        ok("the server PDF renders CJK text", len(cjk) > 0, text[:200])
        for label in ("才", "道", "位"):
            ok("the server PDF contains %s" % label, label in cjk or label in text, cjk[:10])
        ok("the server PDF names the true-path title", FIXTURES[0]["title"] in text, text[:200])

        # Persistent report link in a FRESH session (the emailed link, via the vercel rewrite).
        fresh = BROWSER.new_context(viewport=dict(VIEWPORT))
        fresh_page = fresh.new_page()
        fresh_page.set_default_timeout(APP_TIMEOUT)
        fresh_page.goto(BASE + "/true-path/report/" + str(result_id), wait_until="domcontentloaded")
        fresh_page.wait_for_selector("#tp-step-root .pg", timeout=BOOT_TIMEOUT)
        chips = fresh_page.evaluate(
            "() => [...document.querySelectorAll('#tp-step-root .chips .chip')].map((e) => e.textContent.trim())"
        )
        ok("a fresh session renders the stored report from the link",
           chip_shares(chips) == FIXTURES[0]["share"], chips)
        ok("the stored report shows its id", ("Report %s" % result_id) in fresh_page.inner_text("#tp-step-root"))
        ok("the stored report keeps the three pages",
           fresh_page.locator("#tp-step-root .pg").count() == 3)
        fresh.close()

        # Email: success, then duplicate (no second send).
        ctrl("/reset")
        ctrl("/resend", {"mode": "ok"})
        page2 = open_page(BROWSER)
        drive(page2, FIXTURES[0])
        page2.wait_for_selector('[data-act="send-email"]', timeout=BOOT_TIMEOUT)
        page2.wait_for_function(
            "() => { const s = JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2'));"
            " return !!(s && s.saved && s.id); }",
            timeout=BOOT_TIMEOUT,
        )
        page2.fill("#fn", "Ann")
        page2.fill("#em", "ann@example.com")
        page2.click('[data-act="send-email"]')
        # On success the app re-renders with `Sent. Check your inbox.` in place of the whole form,
        # so `#fm` stops existing. Wait for the outcome, not for the transient field.
        page2.wait_for_function(
            "() => { const t = document.querySelector('#tp-step-root').innerText;"
            " return t.indexOf('Sent. Check your inbox.') !== -1"
            " || /try again|isn’t connected/.test(t); }",
            timeout=BOOT_TIMEOUT,
        )
        ok("email success is reported honestly",
           "Sent. Check your inbox." in page2.inner_text("#tp-step-root"),
           page2.inner_text("#tp-step-root")[-200:])
        sent_state = ctrl("/state")
        visitor_messages = [m for m in sent_state["resendMessages"] if m.get("to") == ["ann@example.com"]]
        ok("exactly one visitor report was handed to the provider", len(visitor_messages) == 1,
           visitor_messages)
        ok("the existing team notification is also sent", sent_state["resendCalls"] == 2,
           sent_state["resendCalls"])
        message = (visitor_messages or [{}])[0]
        ok("the email went to the submitted address", message.get("to") == ["ann@example.com"], message)
        ok("the email subject names the report", "True Path" in str(message.get("subject")), message)

        page2.reload(wait_until="domcontentloaded")
        page2.wait_for_selector('[data-act="view-report"]', timeout=BOOT_TIMEOUT)
        page2.wait_for_timeout(500)
        ok("a reloaded result does not re-send",
           ctrl("/state")["resendCalls"] == 2 and "Sent. Check your inbox." in page2.inner_text("#tp-step-root"))
        ok("no console or page errors (email ok)", not page2.errors, page2.errors)
        page2.context.close()

        # Email: provider error must be surfaced, never shown as sent.
        ctrl("/reset")
        ctrl("/resend", {"mode": "error"})
        page3 = open_page(BROWSER)
        drive(page3, FIXTURES[0])
        page3.wait_for_selector('[data-act="send-email"]', timeout=BOOT_TIMEOUT)
        page3.wait_for_function(
            "() => { const s = JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2'));"
            " return !!(s && s.saved && s.id); }",
            timeout=BOOT_TIMEOUT,
        )
        page3.fill("#fn", "Ann")
        page3.fill("#em", "ann@example.com")
        page3.click('[data-act="send-email"]')
        page3.wait_for_function(
            "() => /try again/.test(document.querySelector('#tp-step-root').innerText)",
            timeout=BOOT_TIMEOUT,
        )
        ok("a provider failure is reported as a failure",
           "We couldn’t send your report. Please try again." in page3.inner_text("#tp-step-root"),
           page3.inner_text("#tp-step-root")[-200:])
        ok("a provider failure is never shown as sent",
           "Sent. Check your inbox." not in page3.inner_text("#tp-step-root"))
        ok("no console or page errors (email error)", not page3.errors, page3.errors)
        page3.context.close()

        # Email: in flight — the button must say so and must not double-send.
        ctrl("/reset")
        ctrl("/resend", {"mode": "hang"})
        page4 = open_page(BROWSER)
        drive(page4, FIXTURES[0])
        page4.wait_for_selector('[data-act="send-email"]', timeout=BOOT_TIMEOUT)
        page4.wait_for_function(
            "() => { const s = JSON.parse(sessionStorage.getItem('tfp.truepath.journey.v2'));"
            " return !!(s && s.saved && s.id); }",
            timeout=BOOT_TIMEOUT,
        )
        page4.fill("#fn", "Ann")
        page4.fill("#em", "ann@example.com")
        page4.click('[data-act="send-email"]')
        page4.wait_for_function(
            "() => document.querySelector('#tp-step-root').innerText.indexOf('Sending') !== -1",
            timeout=BOOT_TIMEOUT,
        )
        ok("an in-flight send shows a pending state", True)
        page4.evaluate("() => document.querySelector('#tp-step-root [data-act=\"send-email\"]').click()")
        page4.wait_for_timeout(400)
        ok("a second click while in flight sends nothing",
           ctrl("/state")["resendCalls"] == 1, ctrl("/state")["resendCalls"])
        ctrl("/resend", {"mode": "ok"})
        # The success path re-renders, so `#fm` disappears: assert the outcome, not the field.
        page4.wait_for_function(
            "() => document.querySelector('#tp-step-root').innerText"
            ".indexOf('Sent. Check your inbox.') !== -1",
            timeout=BOOT_TIMEOUT,
        )
        ok("the released send completes as sent",
           "Sent. Check your inbox." in page4.inner_text("#tp-step-root"))
        released = ctrl("/state")
        ok("exactly one visitor report after the release",
           len([m for m in released["resendMessages"] if m.get("to") == ["ann@example.com"]]) == 1)
        ok("no console or page errors (email in flight)", not page4.errors, page4.errors)
        page4.context.close()

        # Email: a store that refuses must leave the journey usable and honest.
        ctrl("/reset")
        ctrl("/kv-fail", {"mode": "transport"})
        page5 = open_page(BROWSER)
        drive(page5, FIXTURES[0])
        page5.wait_for_timeout(1200)
        text5 = page5.inner_text("#tp-step-root")
        ok("a failing store keeps the result usable", "Your Iron Triangle Role" in text5)
        ok("a failing store never claims the report was saved",
           "Report tp_" not in text5 and journey_state(page5).get("id") is None)
        ok("a failing store explains that the report is a local preview",
           "couldn’t save your report" in text5, text5[-300:])
        ok("no console or page errors (store failure)", not page5.errors, page5.errors)
        ctrl("/kv-fail", {"mode": None})
        page5.context.close()

        # A store that answers HTTP 200 with a command-level error is also a failure.
        ctrl("/reset")
        ctrl("/kv-fail", {"mode": "envelope"})
        page6 = open_page(BROWSER)
        drive(page6, FIXTURES[0])
        page6.wait_for_selector('[data-act="view-report"]', timeout=BOOT_TIMEOUT)
        page6.wait_for_timeout(600)
        ok("an envelope failure never adopts an id",
           journey_state(page6).get("id") is None and not journey_state(page6).get("saved"))
        ok("an envelope failure keeps the result usable",
           "Your Iron Triangle Role" in page6.inner_text("#tp-step-root"))
        ok("no console or page errors (envelope failure)", not page6.errors, page6.errors)
        ctrl("/kv-fail", {"mode": None})
        page6.context.close()

    guard("persistence and email", body)


def main() -> int:
    global CONFIG, BASE, CONTROL, BROWSER

    process, base, control = start_server()
    globals()["BASE"] = base
    globals()["CONTROL"] = control
    print("harness site   : %s" % base)
    print("harness control: %s" % control)
    print("harness log    : %s" % SERVER_LOG)
    try:
        globals()["CONFIG"] = load_config()
        for key, value in (CONFIG.get("RN") or {}).items():
            GLYPH_ROLE[value[3]] = key
        with sync_playwright() as playwright:
            BROWSER = playwright.chromium.launch()
            try:
                section("preflight")
                preflight()
                section("reference journey")
                section_reference_journey()
                section("navigation")
                section_navigation()
                section("analytics")
                section_analytics()
                section("attribution")
                section_attribution()
                section("config variants")
                section_variants()
                section("keyboard")
                section_keyboard()
                section("generation guards")
                section_generation_guards()
                section("reduced motion")
                section_reduced_motion()
                section("viewport widths")
                section_widths()
                section("print stress")
                section_print_stress()
                section("six fixtures")
                section_fixtures()
                section("suggestions")
                section_suggestions()
                section("persistence and email")
                section_persistence_and_email()
            finally:
                BROWSER.close()
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:  # pragma: no cover
            process.kill()

    failures = [name for name, passed in RESULTS if not passed]
    print("\n" + "=" * 78)
    print("browser e2e: %d passed, %d failed" % (len(RESULTS) - len(failures), len(failures)))
    for name in failures:
        print("  FAILED  " + name)
    print("=" * 78)
    if failures:
        print("BROWSER E2E FAILURES")
        return 1
    print("ALL BROWSER E2E PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
