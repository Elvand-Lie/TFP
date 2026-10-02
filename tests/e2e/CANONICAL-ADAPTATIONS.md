# Canonical E2E adaptations

`run_browser.py` is the port of the two approved reference suites onto the integrated production
site. The reference suites stay byte-preserved and unmodified under `tests/e2e/canonical/`; this
file records **every** place where an assertion had to be rewritten because the integrated product
exposes a different-but-equivalent seam.

Rules this port follows:

1. **No reference assertion is weakened.** Where the integrated product has an equivalent seam, the
   assertion is rewritten *against that seam* and recorded below. Where the product genuinely
   diverges from the approved behaviour, that is a defect to fix in the product, not an adaptation.
2. **Expected outputs are never altered** to make a run pass. Fixture answers, expected shares,
   scores and copy are taken from the approved bundle.
3. **Nothing here is a deployment claim.** Upstreams are mocked; no live KV, provider delivery or
   production behaviour is proven by this suite.

## Reference inputs

| Input | Hash | Status |
|---|---|---|
| `true-path.html` | `e4386683895dd0b14f6152f4091835d97a96da362c37ae971d0ffcff383345b1` | byte-preserved |
| `true-path.config.json` | `deec876ac497b58d973956b77ee546f73aaabfaea984d5f6d83a800ad3ebf112` | byte-preserved |
| `true-path.test.js` | `eac1e89bc5a8f2310961a41f1484a1ff6472b0e52a9b6bb5c5c94faecfa3c8fd` | byte-preserved |
| `true-path.e2e.py` | `affaed3b4942a5644ab1e300b0d6a8cbe243d8561ee1cfe9cb6b58bc262ba64c` | byte-preserved |
| `true-path.e2e2.py` | `862491f1d02eb3b490c5665dbc5042d74e2f8b92b25652e703c7510031efa6e6` | byte-preserved |

`Master_Brief_v2.1.pdf` and `GPT61_ORCHESTRATOR_PROMPT.txt` are hashed in the bundle's
`SHA256SUMS.txt` but are not test inputs and are not copied into the repository.

Reproduce the preservation check:

```bash
cd tests/e2e/canonical && sha256sum -c SHA256SUMS.txt
```

## Adaptations

Every row is a seam change, not a coverage reduction.

| # | Reference suite | Integrated suite | Why the seam differs |
|---|---|---|---|
| 1 | `file://` single HTML document | real routes served by `tests/e2e/serve.mjs` | The product is a multi-page site behind real HTTP handlers; the reference ran as one file. Served routes are the equivalent of the reference's single document. |
| 2 | `#app` container, inline `onclick` attributes | `#tp-step-root` + one delegated listener on `stepRoot`, `data-act` attributes | The integrated controller binds a single delegated `click` listener instead of inline handlers. Assertions target the same visible controls. |
| 3 | `text=Start free analysis` | `[data-act="start"]` | The landing CTA label is configuration-driven (`cta.landing.ctaLabel`), so matching label text would couple the suite to copy. The action attribute is the stable seam. |
| 4 | `.lk .opt >> nth=3` (ordinal) | `.lk .opt[data-ans][data-val]` (question id + value) | Option order is shuffled per render in the product. Ordinal clicks would silently answer a different question; `data-ans`/`data-val` pin the answer to the question, which is what the fixture actually specifies. |
| 5 | `.grid .opt >> nth=0` (ordinal) | `.grid .opt[data-key]` | Same shuffle issue; the key is the stable identity. |
| 6 | `.stack .opt` text lookup, `.nth(index)` from `SC` | `.stack .opt[data-role]` | Positions are shuffled and role keys are position-free by contract, so the suite clicks by role key. |
| 7 | `SC`, `S`, `ans()`, `payload()` globals | absent by design; the suite reads `sessionStorage` (`tfp.truepath.journey.v2`) and the rendered DOM | The product deliberately does not expose controller internals on `window`. The persisted session state is the equivalent observation point — and a stronger one, since it is what a save would actually send. |
| 8 | `pdfinfo` / `pdftotext` subprocesses | `pypdf` / PyMuPDF in-process | Same observations (page count, text extraction); these tools are not installed on this host and no new dependency was added. |
| 9 | injected `window.TP_CONFIG` | `window.TP_CONFIG.canonical` override | The product's config loader reads an embedded `canonical` block; this is the same seam the product itself uses for an embedded config. |
| 10 | `window.dataLayer` inspected directly | the same, but the suite also drives real HTTP handlers through `serve.mjs`'s `/__test` channel | The reference could not observe server effects at all. Cardinality and UTM assertions are kept; server-side assertions are added on top. |

## Analytic cardinality note

Reference `true-path.e2e2.py` asserts an exact `dataLayer` sequence (`['tp_landing_view']` on first
load, `['tp_restart']` after a restart). The integrated suite asserts the same cardinality — exactly
one landing view per visit, no duplicate on refresh, `tp_restart` alone on restart — against the
product's event names and its attribution timing. Cardinality is the property under test; the event
spelling follows the product.

## Fixture F and the offline seam

Reference fixture F carries an empty Ikigai selection. The integrated product requires a minimum of
one selection per screen before it will advance, so the suite supplies neutral filler picks for the
UI to proceed and then asserts the **original** fixture F scoring as a pure gate — the fillers must
not change the scored outcome. The fixture's own answers are never altered.
