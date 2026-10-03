// @ts-check
/**
 * True Path — journey controller.
 *
 * A port of the APPROVED standalone frontend (`true-path.html`, the behavioural reference) into
 * the production site. The approved step machine, view markup, focus behaviour, analytics and
 * copy are preserved; only the integration seams differ:
 *
 *  - config comes from the ONE approved `true-path/config/true-path.config.json`, fetched once and
 *    adapted by `window.TruePathConfig.build(...)` (Brief 15). Nothing user-facing is hard-coded.
 *  - scoring is delegated to the shared `window.TruePathScoring` (Brief 17: the UI computes no
 *    percentage of its own). Tree/triangle geometry is delegated to `window.TruePathSvg`.
 *  - steps have REAL paths, so refresh and Back restore position (Brief 17). In-app transitions use
 *    history.pushState with that same path, so no reload is needed; `syn` replaces its entry so
 *    Back skips the interstitial.
 *  - the save/email/PDF contracts are the production API's: `{record, idempotencyKey}` in,
 *    `{stored, resultId}` out, and a send is only ever shown as sent when the server says `sent`.
 *  - markup is built as strings and bound through ONE delegated listener, so no stored or
 *    config-supplied value is ever placed inside an event attribute.
 */

(function () {
  'use strict';

  var root = /** @type {any} */ (window);

  // The shell ships real journey markup for SEO, but its controls are dead until the config
  // fetch finishes and bind() runs. Mark the host synchronously so CSS can keep those controls
  // honestly inert (and say "loading") instead of silently swallowing clicks.
  (function () {
    try {
      var host = document.getElementById('true-path-app');
      if (host) host.setAttribute('data-tp-booting', '');
    } catch (error) { /* ignore */ }
  })();

  var CONFIG_URL = '/true-path/config/true-path.config.json';
  var RESULT_ID_PATTERN = /^tp_[A-Za-z0-9_-]{4,64}$/;
  var STATE_KEY = 'tfp.truepath.journey.v2';
  var LEGACY_KEYS = ['tfp.truepath.journey.v1', 'tp'];

  // Filled in by prepare().
  var C, CFG, CATEGORIES, ROLES, SCORING, ROUTES, PRODUCTS, API, PRIVACY, CONSULT_URL, TN, RN, OPT;

  var stepRoot = null;
  var landingSeen = 0;
  var lock = 0;
  var roleTimer = null;
  // Set when a persistent report link names a record that cannot be loaded. Handled at render time
  // so the canonical 12-step vocabulary stays exactly as approved.
  var reportMissing = 0;
  // A report link whose record could not be REACHED (offline, 5xx): the link is fine, so the
  // visitor gets a retry rather than being sent back to the start.
  var reportUnavailable = 0;
  var reportRetry = 0;
  var mail = 0;
  var synTimer = null;
  var bound = 0;

  var savedKey = '';
  var savePromise = null;
  var saveFailed = 0;
  // Bumped whenever the answers change: a save response that arrives after this must not be
  // adopted, because it describes a journey that no longer exists.
  var gen = 0;

  var T = ['organiser', 'analyst', 'communicator', 'creative'];
  var R = ['commander', 'general', 'chancellor'];

  // ─── config ───────────────────────────────────────────────────────────────

  function loadConfig() {
    var override = (root.TP_CONFIG || {}).canonical;
    if (override) return Promise.resolve(override);
    // A hung fetch would otherwise leave the static shell on screen with no bound controls —
    // a page that looks fine but ignores every click. Time it out and try once more.
    function attempt() {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 8000);
      return fetch(CONFIG_URL, { credentials: 'same-origin', signal: controller.signal })
        .then(function (response) {
          if (!response.ok) throw new Error('True Path config unavailable (' + response.status + ')');
          return response.json();
        })
        .finally(function () { clearTimeout(timer); });
    }
    return attempt().catch(function () { return attempt(); });
  }

  function prepare(canonical) {
    C = canonical;
    CFG = root.TruePathConfig.build(canonical);
    CATEGORIES = CFG.talent.categories;
    ROLES = CFG.ironTriangle.roles;
    SCORING = CFG.scoring;
    PRODUCTS = CFG.cta.result.products || [];
    API = canonical.integration.api || {};
    PRIVACY = canonical.integration.privacyUrl || '';
    CONSULT_URL = canonical.integration.consultUrl || '';
    TN = C.TN;
    RN = C.RN;
    OPT = {};
    C.IK.forEach(function (screen) {
      screen[1].forEach(function (option) { OPT[option[0]] = option; });
    });

    // Step -> real path. Every step keeps a shell of its own so refresh lands correctly.
    ROUTES = {
      landing: '/true-path',
      start: '/true-path/start',
      tintro: '/true-path/talent',
      tq: '/true-path/talent/q',
      tsnap: '/true-path/talent/result',
      iintro: '/true-path/direction',
      iq: '/true-path/direction/q',
      dsnap: '/true-path/direction/result',
      rintro: '/true-path/role',
      rq: '/true-path/role/q',
      syn: '/true-path/role/result',
      result: '/true-path/result',
      report: '/true-path/report'
    };
  }

  function cUrl(title, role, archetype) {
    if (!CONSULT_URL) return '';
    var join = CONSULT_URL.indexOf('?') === -1 ? '?' : '&';
    return CONSULT_URL + join +
      'title=' + encodeURIComponent(title) +
      '&role=' + encodeURIComponent(role) +
      '&archetype=' + encodeURIComponent(archetype);
  }

  // ─── escaping ─────────────────────────────────────────────────────────────
  // Config copy is trusted, but it is still DATA, and stored-record values are not trusted at all.
  // Everything interpolated into markup goes through here.

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ─── state (Brief 17: survives refresh and Back) ───────────────────────────

  /** v2.2 C1: the visitor's first name, validated with the brief's rule. */
  var NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} '.’-]{0,29}$/u;

  function cleanName(value) {
    var raw = String(value === undefined || value === null ? '' : value).trim().replace(/\s+/g, ' ');
    if (!raw || raw.length > 30 || !NAME_PATTERN.test(raw)) return '';
    if (raw === raw.toLowerCase()) raw = raw.charAt(0).toUpperCase() + raw.slice(1);
    return raw;
  }

  function freshState() {
    return {
      step: 'landing', name: '', ta: Array(12).fill(0), qi: 0, ik: {}, ii: 0,
      sc: [], si: 0, ord: [], tal: null, res: null, fs: {},
      id: null, saved: 0, sent: 0, skip: 0, rv: 0, saveKey: null,
      attr: { utm_source: null, utm_campaign: null }
    };
  }

  var S = freshState();

  function backend() {
    try {
      return window.sessionStorage;
    } catch (error) {
      return null;
    }
  }

  /**
   * Migration from the legacy journey store (`tfp.truepath.journey.v1`), whose shape is
   * { talentAnswers: {Qn: 1..5}, ikigaiPicks: [{screenId,key,fromSuggestion}], scenarioAnswers: {Sn: role},
   *   scenarioOrder: {Sn: [role,…]} }. Without this the old answers would be silently ignored.
   */
  function migrateLegacyState(parsed) {
    var next = freshState();

    // talentAnswers -> ta[], indexed by QUESTION ID, not presentation order.
    if (parsed.talentAnswers && typeof parsed.talentAnswers === 'object') {
      Object.keys(parsed.talentAnswers).forEach(function (questionId) {
        var match = /^Q(\d+)$/.exec(questionId);
        if (!match) return;
        var index = parseInt(match[1], 10) - 1;
        var value = Math.round(Number(parsed.talentAnswers[questionId]));
        if (index >= 0 && index < 12 && value >= 1 && value <= 5) next.ta[index] = value;
      });
      next.qi = next.ta.filter(function (v) { return v > 0; }).length;
    }

    // ikigaiPicks -> ik{ screenIndex: [key,…] } plus fs{} suggestion flags.
    if (Array.isArray(parsed.ikigaiPicks)) {
      parsed.ikigaiPicks.forEach(function (pick) {
        if (!pick || typeof pick !== 'object') return;
        var screen = /^I-(\d+)$/.exec(String(pick.screenId || ''));
        var key = String(pick.key || '');
        if (!screen || !key || !/^[a-z_]+$/.test(key)) return;
        var index = parseInt(screen[1], 10) - 1;
        if (index < 0 || index > 3) return;
        var list = next.ik[index] || (next.ik[index] = []);
        if (list.indexOf(key) === -1 && list.length < 3) list.push(key);
        if (pick.fromSuggestion) (next.fs = next.fs || {})[key] = true;
      });
    }

    // scenarioAnswers/scenarioOrder -> sc[] and ord[], keyed by scenario order.
    if (parsed.scenarioOrder && parsed.scenarioAnswers) {
      var order = [];
      var answers = [];
      for (var i = 1; i <= 6; i += 1) {
        var sid = 'S' + i;
        var roles = parsed.scenarioOrder[sid];
        if (Array.isArray(roles) && roles.filter(isRole).length === 3) {
          order[i - 1] = roles.filter(isRole);
        }
        var answer = parsed.scenarioAnswers[sid];
        if (isRole(answer)) answers[i - 1] = answer;
      }
      if (order.filter(Boolean).length === 6) next.ord = order;
      if (answers.filter(Boolean).length === 6) {
        next.sc = answers;
        next.si = 6;
      } else {
        next.sc = [];
        next.si = 0;
      }
    }

    // The legacy store kept the saved id separately; only trust it when this session's answers
    // were actually persisted, which the legacy shape cannot prove. Start clean instead.
    next.step = 'landing';
    return next;
  }

  function isRole(value) {
    return value === 'commander' || value === 'general' || value === 'chancellor';
  }

  function normalizeState(parsed) {
    var next = Object.assign(freshState(), parsed);
    if (!Array.isArray(next.ta) || next.ta.length !== 12) next.ta = Array(12).fill(0);
    next.ta = next.ta.map(function (v) {
      var n = Math.round(Number(v));
      return n >= 1 && n <= 5 ? n : 0;
    });
    if (!next.ik || typeof next.ik !== 'object') next.ik = {};
    if (!Array.isArray(next.sc)) next.sc = [];
    if (!Array.isArray(next.ord)) next.ord = [];
    if (typeof next.qi !== 'number' || next.qi < 0) next.qi = 0;
    if (typeof next.ii !== 'number' || next.ii < 0 || next.ii > 3) next.ii = 0;
    if (typeof next.si !== 'number' || next.si < 0) next.si = 0;
    if (typeof next.name !== 'string') next.name = '';
    next.name = cleanName(next.name);
    if (next.id !== null && !RESULT_ID_PATTERN.test(String(next.id))) next.id = null;
    // An id only means anything when this session's answers were actually saved.
    if (!next.saved) next.id = null;
    // Keep the request key in the SESSION so a refresh retries the same UUID instead of minting a
    // second result for the same journey.
    if (next.saveKey !== null && typeof next.saveKey !== 'string') next.saveKey = null;
    return next;
  }

  function restore() {
    var store = backend();
    var raw = null, legacyRaw = null;
    if (store) {
      try {
        raw = store.getItem(STATE_KEY);
        for (var i = 0; i < LEGACY_KEYS.length && !raw; i += 1) {
          raw = store.getItem(LEGACY_KEYS[i]);
          if (raw) legacyRaw = LEGACY_KEYS[i];
        }
      } catch (error) {
        raw = null;
      }
    }
    if (!raw) return;
    var parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return; /* a corrupt entry is not worth failing the journey over */
    }
    if (!parsed || typeof parsed !== 'object') return;

    if (legacyRaw) {
      // Map the older production shape explicitly rather than pretending the keys line up.
      S = migrateLegacyState(parsed);
      savedKey = '';
      return;
    }
    S = normalizeState(parsed);
    savedKey = typeof S.saveKey === 'string' ? S.saveKey : '';
  }

  function save() {
    var store = backend();
    if (!store) return;
    // Keep the in-flight request key in the session so a refresh retries the SAME UUID.
    S.saveKey = savedKey || null;
    try {
      store.setItem(STATE_KEY, JSON.stringify(S));
    } catch (error) {
      /* private mode or quota — the journey still works in memory */
    }
  }

  /**
   * After any answer changes, a previously saved record no longer describes this journey, so the
   * id, the sent flag and the request key must all be dropped (Brief 12).
   */
  function invalidateSave() {
    // Any answer change makes an in-flight response describe a journey that no longer exists.
    gen += 1;
    mail = 0;
    if (!S.saved && !savedKey) return;
    S.saved = 0;
    S.id = null;
    S.sent = 0;
    S.saveKey = null;
    savedKey = '';
    savePromise = null;
    saveFailed = 0;
  }

  // ─── analytics (Brief 16) — once per transition, never on re-render ────────

  function qs(key) {
    try {
      return new URLSearchParams(window.location.search).get(key);
    } catch (error) {
      return null;
    }
  }

  /**
   * Attribution is captured ONCE at entry and kept in session state. In-app transitions change the
   * URL to the step's real path, which drops `?utm_source`/`?utm_campaign`, so reading
   * `location.search` later would lose the visitor's origin. The canonical reference never changed
   * its URL, so it retained them implicitly; this keeps the same data without the URL.
   */
  function captureAttribution() {
    var found = { utm_source: qs('utm_source'), utm_campaign: qs('utm_campaign') };
    if (!S.attr) S.attr = { utm_source: null, utm_campaign: null };
    // First non-null wins, so a later navigation without the parameters cannot erase them.
    if (found.utm_source && !S.attr.utm_source) S.attr.utm_source = found.utm_source;
    if (found.utm_campaign && !S.attr.utm_campaign) S.attr.utm_campaign = found.utm_campaign;
    return S.attr;
  }

  function attribution() {
    var saved = S.attr || captureAttribution();
    return {
      utm_source: saved.utm_source || null,
      utm_campaign: saved.utm_campaign || null,
      device: window.innerWidth < 700 ? 'mobile' : 'desktop'
    };
  }

  function track(name, props) {
    if (!name) return;
    var payload = Object.assign({ event: name }, attribution(), props || {});
    try {
      root.dataLayer = root.dataLayer || [];
      root.dataLayer.push(payload);
      window.dispatchEvent(new CustomEvent('tp', { detail: payload }));
    } catch (error) {
      /* analytics must never break the journey */
    }
  }

  function evFor(step) {
    if (step === 'landing') {
      if (landingSeen) return [];
      landingSeen = 1;
      return [['tp_landing_view']];
    }
    if (step === 'tsnap') return [['tp_talent_result_view', { archetypeKey: akey(S.tal) }]];
    if (step === 'dsnap') {
      return [['tp_direction_snapshot_view', {
        counts: [0, 1, 2, 3].map(function (i) { return (S.ik[i] || []).length; })
      }]];
    }
    if (step === 'rintro') return [['tp_role_intro_view']];
    if (step === 'result') {
      if (S.rv) return [];
      S.rv = 1;
      return [
        ['tp_role_reveal_view', { primary: S.res.primary, pattern: S.res.pattern, gap: S.res.gap }],
        ['tp_truepath_view', { titleKey: tkey() }]
      ];
    }
    return [];
  }

  // ─── shared helpers (canonical) ───────────────────────────────────────────

  function $(selector) { return document.querySelector(selector); }

  function flat() { return Object.values(S.ik).flat(); }

  /**
   * The pick objects the shared engine expects. `Scoring.ikigaiRoleSignal` reads `pick.key`, so
   * passing bare key strings would leave every pick untagged and silently neutralise the ikigai
   * weight (15% of the blend). Screen ids are 1-based to match the config's `I-<n>` convention.
   */
  function picks() {
    var out = [];
    Object.keys(S.ik).forEach(function (screen) {
      var index = parseInt(screen, 10);
      if (!(index >= 0)) return;
      (S.ik[screen] || []).forEach(function (key) {
        out.push({
          screenId: 'I-' + (index + 1),
          key: key,
          fromSuggestion: !!(S.fs || {})[key]
        });
      });
    });
    return out;
  }

  function sh(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  function akey(t) {
    return [t.dominant, t.secondary].sort(function (a, b) {
      return T.indexOf(a) - T.indexOf(b);
    }).join('_');
  }
  function archOf(t) { return C.ARCH[akey(t).replace('_', '+')]; }
  function arch(t) { return archOf(t); }
  function tkey() { return akey(S.tal) + '__' + S.res.primary; }
  function titleOf() { return C.TI[arch(S.tal)[0]][R.indexOf(S.res.primary)]; }
  function dualOf(r) {
    if (r.pattern !== 'dual') return null;
    var key = [r.primary, r.supporting].sort(function (x, y) { return R.indexOf(x) - R.indexOf(y); }).join('+');
    return C.DL[key] || null;
  }

  /** Suggestions are an approved INDICATOR only — never auto-selected (Brief 5). */
  function sugg(i) {
    var slot = 'I-' + (i + 1);
    var byTalent = CFG.ikigai.suggestions || {};
    var dominant = (byTalent[S.tal.dominant] || {})[slot] || [];
    var secondary = (byTalent[S.tal.secondary] || {})[slot] || [];
    return Array.from(new Set([].concat(dominant, secondary))).slice(0, CFG.ikigai.maxSuggestionsPerScreen || 3);
  }

  function ikScreen(i) { return CFG.ikigai.screens[i]; }
  function jn(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || 'none'); }
  function lbl(k) { return OPT[k] ? OPT[k][1] : ''; }
  function low(s) { return s ? s[0].toLowerCase() + s.slice(1) : ''; }
  function list(a) { return jn(a.map(lbl).map(low)); }
  function imp(a) { return jn(a.map(function (x) { return OPT[x] ? OPT[x][2] : ''; })); }

  function prog(n) {
    return '<div class="prog">' + ['才 Talent', '道 Direction', '位 Role'].map(function (x, i) {
      return '<div class="' + (i <= n ? 'on' : '') + '"' + (i === n ? ' aria-current="step"' : '') + '>' + x + '</div>';
    }).join('') + '</div>';
  }
  function chips(a) {
    return '<div class="chips">' + a.map(function (x) { return '<span class="chip">' + x + '</span>'; }).join('') + '</div>';
  }
  function blk(h, b) { return '<div class="blk"><h3>' + h + '</h3>' + b + '</div>'; }

  // ─── visuals — geometry is owned by the shared SVG module ──────────────────

  function tree(t) {
    // `raw`/`dominant` are required for the canonical tie-aware highlight, and `balancedProfile`
    // suppresses it entirely (a balanced profile shows no glowing branch).
    return root.TruePathSvg.talentTreeSvg(t.pct, CATEGORIES, {
      raw: t.raw,
      dominant: t.dominant,
      secondary: t.secondary,
      coDominant: t.coDominant,
      balancedProfile: t.balancedProfile,
      info: 'Talent Tree scores are independent strengths: you can be strong on every branch, so they do not total 100%.'
    });
  }
  function tri(share) {
    return root.TruePathSvg.ironTriangleSvg(share, ROLES, {
      info: 'Iron Triangle shares show how your natural contribution is spread across three roles, so they always total 100%.'
    });
  }

  // ─── scoring — delegated to the shared engine ──────────────────────────────

  function computeTalent() {
    var answers = {};
    for (var i = 0; i < 12; i += 1) answers['Q' + (i + 1)] = S.ta[i];
    var out = root.TruePathScoring.scoreTalent(answers, CFG.talent);
    // The engine names the leading branch `primary`; the approved views call it `dominant`.
    if (out.dominant === undefined) out.dominant = out.primary;
    return out;
  }

  function computeRole() {
    var scenarioRoles = [0, 1, 2, 3, 4, 5].map(function (i) { return S.sc[i]; });
    // `picks()` (objects with `key`), NOT `flat()` (bare key strings): the engine reads `pick.key`,
    // so strings would leave every pick untagged and neutralise the ikigai weight entirely.
    var out = root.TruePathScoring.computeRoleResult(scenarioRoles, S.tal.pct, picks(), SCORING);
    // Approved view names.
    if (out.share === undefined) out.share = out.shares;
    if (out.points === undefined) out.points = out.scenarioPoints;
    if (out.ikigaiHits === undefined) out.ikigaiHits = (out.ikigai || {}).hits || {};
    return out;
  }

  function leadLine(t) {
    var tied = T.filter(function (k) { return t.raw[k] === t.raw[t.dominant]; });
    var gap = t.raw[t.dominant] - t.raw[t.secondary];
    if (t.balancedProfile) {
      return 'Your four branches are close in strength, so no single Talent leads. Your title draws on ' +
        TN[t.dominant] + ' and ' + TN[t.secondary] + '.';
    }
    if (tied.length > 1) {
      return 'Your ' + jn(tied.map(function (k) { return TN[k]; })) + ' branches are equally strong.' +
        (tied.length > 2 ? ' Your title draws on ' + TN[t.dominant] + ' and ' + TN[t.secondary] + '.' : '');
    }
    return TN[t.dominant] + ' leads' +
      (gap <= 2 ? ', with ' + TN[t.secondary] + ' close behind' : ', followed by ' + TN[t.secondary]) + '.';
  }

  function obs(t) {
    // v2.2 C11: the lowest-branch line depends on the score itself.
    var lowest = T.reduce(function (lo, k) { return t.pct[k] < t.pct[lo] ? k : lo; }, T[0]);
    var lp = t.pct[lowest];
    var lowestLine;
    if (t.balancedProfile) {
      lowestLine = 'No branch is notably quieter than the rest, which gives you range.';
    } else if (lp >= 70) {
      lowestLine = 'Even your least dominant branch, ' + TN[lowest] + ', is a genuine strength at ' + lp + '%.';
    } else if (lp >= 40) {
      lowestLine = TN[lowest] + ' is your least dominant branch at ' + lp +
        '%. This may be an area where you lean on others.';
    } else {
      lowestLine = TN[lowest] + ' is your quietest branch (' + lp +
        '%). That is a reading, not a flaw. It often shows where a partner can complement you.';
    }
    var lines = [
      t.balancedProfile
        ? 'Your four branches are within a point of each other, so no single style dominates yet.'
        : t.coDominant ? leadLine(t)
          : 'Your strongest branch is ' + TN[t.dominant] + ' (' + t.pct[t.dominant] + '%).',
      lowestLine,
      'Scores are independent: you can be strong on every branch.'
    ];
    if (T.every(function (k) { return t.pct[k] >= 75; })) {
      lines.push('You show strong scores across all four branches, which suggests a versatile profile.');
    }
    return lines;
  }

  /** v2.2 C10: one natural-strengths sentence instead of raw lists. */
  function strengthsSentence(t) {
    var P = (CFG.truthPath && CFG.truthPath.strengthPhrases) || {};
    var a = arch(t);
    if (!P[t.dominant] || !P[t.secondary] || !a) return '';
    return 'As a ' + a[0] + ', you combine ' + P[t.dominant] + ' with ' + P[t.secondary] + '.';
  }

  function align(t, r, ik) {
    var cap = [].concat(C.CAP[t.dominant], C.CAP[t.secondary]);
    // v2.2 C5: only TAGGED I-3 picks count, and the gap warning fires only when at least two
    // tagged picks exist AND every one of them points at the gap role.
    var tags = (ik[2] || []).map(function (x) { return C.TAGS[x] || null; }).filter(Boolean);
    var out = [];
    out.push((ik[1] || []).some(function (x) { return cap.indexOf(x) !== -1; })
      ? 'talent_capability_aligned' : 'talent_capability_explore');
    if (tags.indexOf(r.primary) !== -1) out.push('economic_role_aligned');
    else if (tags.length >= 2 && tags.every(function (role) { return role === r.gap; })) {
      out.push('economic_role_explore');
    }
    return out;
  }

  // ─── actions (canonical semantics) ────────────────────────────────────────

  function ans(id, v) {
    invalidateSave();
    S.ta[id] = v;
    track('tp_talent_answer', { questionId: 'Q' + (id + 1), value: v });
    if (++S.qi === 12) {
      S.tal = computeTalent();
      track('tp_talent_complete', { archetypeKey: akey(S.tal) });
      go('tsnap');
    } else {
      save();
      syncHistory();
      render();
      fh();
    }
  }

  function pick(k) {
    invalidateSave();
    var a = S.ik[S.ii] || (S.ik[S.ii] = []);
    var i = a.indexOf(k);
    if (i >= 0) a.splice(i, 1);
    else if (a.length < (CFG.ikigai.maxSelections || 3)) {
      a.push(k);
      S.fs = S.fs || {};
      S.fs[k] = sugg(S.ii).indexOf(k) !== -1;
    }
    save();
    render();
    var el = Array.prototype.slice.call(stepRoot.querySelectorAll('.grid .opt')).find(function (e) {
      return e.getAttribute('data-key') === k;
    });
    if (el) el.focus();
  }

  function nextIk() {
    invalidateSave();
    var sel = S.ik[S.ii] || [];
    track('tp_ikigai_step', {
      step: S.ii + 1, selections: sel,
      fromSuggestion: sel.map(function (k) { return !!(S.fs || {})[k]; })
    });
    if (S.ii < 3) {
      S.ii += 1;
      save();
      syncHistory();
      render();
      window.scrollTo(0, 0);
      fh();
    } else {
      track('tp_ikigai_complete', {
        selections: flat(),
        fromSuggestion: flat().map(function (k) { return !!(S.fs || {})[k]; })
      });
      go('dsnap');
    }
  }

  function startRole() {
    invalidateSave();
    S.ord = [0, 1, 2, 3, 4, 5].map(function () { return sh(R); });
    S.sc = [];
    S.si = 0;
    go('rq');
  }

  /** 400ms selection lock: a second click during the transition is ignored (Brief 11). */
  function chooseRole(role, button) {
    if (lock) return;
    lock = 1;
    // Capture everything the timer needs NOW. Reading S.si at fire time would file the answer
    // against whatever scenario is current then, so Back, restart or popstate during the lock
    // would record the role under the wrong question.
    var at = S.si;
    var atGen = gen;
    var atStep = S.step;
    var position = S.ord[at].indexOf(role);
    var sid = 'S' + (at + 1);
    button.classList.add('on');
    button.insertAdjacentHTML('afterbegin', '<span class="glyph cn">' + esc(RN[role][3]) + '</span>');
    track('tp_role_answer', { scenarioId: sid, role: role, position: position });

    roleTimer = setTimeout(function () {
      roleTimer = null;
      // The journey moved on while the feedback was playing: drop the answer rather than misfile it.
      if (atGen !== gen || atStep !== S.step || at !== S.si) return;
      lock = 0;
      S.sc[at] = role;
      if (at + 1 === 6) {
        S.res = computeRole();
        S.rv = 0;
        track('tp_role_complete', {
          scenarioId: sid, role: role, position: position, primary: S.res.primary
        });
        save();
        syncHistory();
        persist();
        go('syn');
      } else {
        S.si = at + 1;
        save();
        // Keep the history entry in step with the visible question (Back/Forward restore it).
        syncHistory();
        render();
        fh();
      }
    }, 400);
  }

  /** Cancel a pending role selection (leaving the step, going Back, or restarting). */
  function cancelRoleLock() {
    if (roleTimer) { clearTimeout(roleTimer); roleTimer = null; }
    lock = 0;
  }

  /**
   * Step back one question inside the current stage. A pending role selection is cancelled first:
   * going Back while the 400ms feedback is playing must not then commit that answer.
   */
  function backWithin(field) {
    cancelRoleLock();
    if (!(S[field] > 0)) return;
    invalidateSave();
    S[field] -= 1;
    save();
    syncHistory();
    render();
    fh();
  }

  function restart() {
    track('tp_restart');
    // A restart abandons the journey: bump the generation so any in-flight save response is
    // rejected, and drop every trace of the previous attempt.
    gen += 1;
    S = freshState();
    mail = 0;
    savedKey = '';
    savePromise = null;
    saveFailed = 0;
    cancelRoleLock();
    save();
    go('landing');
  }

  // ─── payload + persistence contracts ──────────────────────────────────────

  function payload(lead) {
    var t = S.tal, r = S.res, ik = S.ik, aq = {}, as = {};
    S.ta.forEach(function (v, i) { aq['Q' + (i + 1)] = v; });
    S.sc.forEach(function (v, i) { if (v) as['S' + (i + 1)] = v; });
    var suggested = Array.from(new Set([0, 1, 2, 3].flatMap(function (i) { return sugg(i); })));
    var dl = dualOf(r);
    return {
      schemaVersion: '2.2',
      resultId: S.saved ? S.id : null,
      createdAt: new Date().toISOString(),
      locale: 'en',
      profile: { firstName: S.name || null },
      talent: {
        answers: aq, raw: t.raw, pct: t.pct, dominant: t.dominant, secondary: t.secondary,
        coDominant: t.coDominant, balancedProfile: t.balancedProfile,
        archetypeKey: akey(t), archetypeName: arch(t)[0]
      },
      ikigai: {
        energises: ik[0] || [], goodAt: ik[1] || [],
        economicValue: ik[2] || [], impact: ik[3] || [],
        suggested: suggested,
        selectedFromSuggestions: flat().filter(function (x) { return (S.fs || {})[x]; }).length
      },
      ironTriangle: {
        answers: as, points: r.points, ikigaiHits: r.ikigaiHits, share: r.share,
        primary: r.primary, supporting: r.supporting, gap: r.gap, pattern: r.pattern,
        dualLabel: dl ? dl[0] : null,
        weights: {
          scenario: SCORING.weights.scenario, talent: SCORING.weights.talent,
          ikigai: SCORING.weights.ikigai,
          affinityMatrixVersion: SCORING.affinityMatrixVersion || '1.0',
          ikigaiTagVersion: SCORING.ikigaiTagVersion || '1.0'
        }
      },
      truePath: { titleKey: tkey(), title: titleOf()[0], alignment: align(t, r, ik) },
      lead: lead && (lead.firstName || lead.email) ? {
        firstName: lead.firstName || null, email: lead.email || null,
        reportConsent: !!lead.reportConsent, marketingConsent: !!lead.marketingConsent
      } : null,
      attribution: attribution(),
      ancientWisdom: null
    };
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
  }

  function requestKey() {
    if (!savedKey) {
      savedKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
          });
    }
    return savedKey;
  }

  /**
   * Save the journey. Single-flight: concurrent callers share one request, and callers that NEED
   * the id (email, PDF, the report link) await it. A response counts only when the server confirms
   * `stored: true` AND returns a well-formed server id for THIS generation of the answers —
   * anything else is a failure, and the journey stays fully usable with its local preview.
   */
  function persist() {
    if (!API.saveResult) return Promise.resolve(null);
    if (S.saved && S.id) return Promise.resolve(S.id);
    if (savePromise) return savePromise;

    var atGen = gen;
    var key = requestKey();
    S.saveKey = key;
    save();

    savePromise = post(API.saveResult, { record: payload(null), idempotencyKey: key })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok || !data || data.stored !== true) throw new Error('not stored');
          if (!RESULT_ID_PATTERN.test(String(data.resultId))) throw new Error('bad id');
          // The answers changed while this was in flight: the id belongs to an older journey, so
          // adopting it would attach a stale record to the new one.
          if (atGen !== gen) return null;
          // The server recomputes and OWNS the stored record. Require it, and require it to agree
          // with the id, then adopt its copy so what is shown matches what was persisted.
          if (!data.record || typeof data.record !== 'object') throw new Error('no record');
          if (data.record.resultId !== data.resultId) throw new Error('id mismatch');
          if (!adoptRecord(data.record)) throw new Error('unusable record');
          S.id = data.resultId;
          S.saved = 1;
          S.saveKey = key;
          saveFailed = 0;
          save();
          return S.id;
        });
      })
      .catch(function () {
        if (atGen !== gen) return null;
        saveFailed = 1;
        // A failed save must be retryable with the SAME key: the retry may duplicate a request that
        // actually landed, and the server deduplicates on the key.
        if (atGen === gen) savePromise = null;
        return null;
      });

    return savePromise;
  }

  function pdf() {
    track('tp_report_download', { resultId: S.id });
    if (API.pdf && S.saved && S.id) {
      window.open(API.pdf.replace('{id}', encodeURIComponent(S.id)), '_blank', 'noopener');
      return;
    }
    // No server id yet: save first, then fetch the PDF; otherwise fall back to the browser's own
    // print so the visitor can still keep a copy.
    persist().then(function (id) {
      if (id && API.pdf) window.open(API.pdf.replace('{id}', encodeURIComponent(id)), '_blank', 'noopener');
      else try { window.print(); } catch (error) { /* nothing else available */ }
    });
  }

  function sendEmail() {
    if (S.sent || mail) return;
    var fn = /** @type {any} */ ($('#fn')), em = /** @type {any} */ ($('#em'));
    var mk = /** @type {any} */ ($('#mk')), msg = $('#fm');
    if (!fn || !em || !msg) return;
    var email = em.value.trim();
    // v2.2 C1: the name field is pre-filled from the journey; an edited name is honoured.
    if (!fn.value.trim() && S.name) fn.value = S.name;
    if (!fn.value.trim()) { msg.textContent = 'Please add your first name.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = 'Enter a valid email address.'; return; }
    if (!API.sendReport) {
      msg.textContent = 'Email delivery isn’t connected yet. Use “View your report” to read and save it.';
      return;
    }

    mail = 1;
    var atGen = gen;
    msg.textContent = 'Sending…';

    // The report has to exist server-side before it can be emailed, so this awaits the save.
    persist().then(function (id) {
      if (atGen !== gen) throw new Error('journey changed');
      if (!id) throw new Error('not saved');
      return post(API.sendReport, {
        resultId: id, firstName: fn.value.trim(), email: email,
        reportConsent: true, marketingConsent: !!(mk && mk.checked)
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          // Only an explicit `sent: true` is a success. A 409 "already being sent" is NOT one.
          if (!response.ok || !data || data.sent !== true) {
            throw new Error((data && data.reason) || 'send_failed');
          }
          if (atGen !== gen) return;
          S.sent = 1;
          track('tp_email_optin', { marketingConsent: !!(mk && mk.checked) });
          save();
        });
      });
    }).catch(function () {
      msg.textContent = 'We couldn’t send your report. Please try again.';
    }).then(function () {
      if (atGen !== gen) return;
      mail = 0;
      if (S.sent) render();
    });
  }

  function emailBlk() {
    var RPT = CFG.cta.report;
    var canSend = !!(PRIVACY && API.sendReport);
    var note = API.sendReport
      ? (saveFailed ? 'We couldn’t save your report yet. You can still read it and save it as a PDF.' : '')
      : 'Email delivery isn’t connected yet. Use “View your report” to read it or save it as a PDF.';
    return '<div class="blk nop"><h3>' + esc(RPT.headline) + '</h3>' +
      '<p>Read it online, save it as a PDF, or send it to your inbox.</p>' +
      '<button class="btn" data-act="view-report">View your report</button>' +
      (S.sent ? '<p class="mut">Sent. Check your inbox.</p>' : S.skip ? '' :
        '<p class="mut">Or send it to me:</p>' +
        '<input class="inp" id="fn" type="text" placeholder="' + esc(RPT.emailFieldName) +
        '" aria-label="' + esc(RPT.emailFieldName) + '" autocomplete="given-name" value="' + esc(S.name || '') + '">' +
        '<input class="inp" id="em" type="email" placeholder="' + esc(RPT.emailFieldEmail) +
        '" aria-label="' + esc(RPT.emailFieldEmail) + '" required autocomplete="email">' +
        '<label class="mut"><input type="checkbox" id="mk"> ' + esc(RPT.marketingConsentLabel) + '</label>' +
        '<p class="mut">Report delivery and marketing are separate consents. ' +
        (PRIVACY
          ? 'See our <a href="' + esc(PRIVACY) + '">privacy policy</a>.'
          : 'The privacy policy link is not configured.') + '</p>' +
        '<button class="btn" data-act="send-email"' + (canSend ? '' : ' disabled') + '>' +
        esc(RPT.emailSendLabel) + '</button> ' +
        '<button class="ghost" data-act="skip-email">' + esc(RPT.emailSkipLabel) + '</button>' +
        '<p id="fm" class="mut" role="status" aria-live="polite">' + note + '</p>') +
      '</div>';
  }

  function explore() {
    return '<div class="blk nop"><h3>' + esc(CFG.cta.result.consultHeadline) + '</h3>' +
      '<p class="mut">When you’re ready to go deeper. These never interrupt your free results.</p><div class="stack">' +
      PRODUCTS.map(function (q) {
        if (q.url) {
          return '<a class="opt" style="display:block;color:inherit;text-decoration:none" href="' + esc(q.url) +
            '" rel="noopener" data-product="' + esc(q.id) + '"><b>' + esc(q.name || 'Resource') +
            '</b><br><span class="mut">' + esc(q.price) + '</span></a>';
        }
        // No destination configured yet: say so plainly rather than inventing an offer.
        return '<div class="opt" style="opacity:.6" aria-disabled="true"><b>' +
          esc(q.name || 'Details coming soon') + '</b><br><span class="mut">' + esc(q.price) +
          ' · not available yet</span></div>';
      }).join('') + '</div></div>';
  }

  // ─── views (canonical) ────────────────────────────────────────────────────

  var VW = {
    landing: function () {
      var L = CFG.cta.landing;
      return '<p class="mut cn">' + esc(L.eyebrow) + '</p><h1>' + esc(L.headline) + ' ' +
        esc(L.headlineSub) + '</h1><p>' + esc(L.promise) + '</p><p class="mut">' + esc(L.subcopy) + '</p>' +
        '<button class="btn" data-act="start">' + esc(L.ctaLabel) + '</button>' +
        '<p class="mut">A reflective self-discovery tool, not a psychological or career assessment.</p>';
    },

    // v2.2 C1: the name screen, right after Start and before the Talent Tree.
    start: function () {
      var N = CFG.cta.start || {};
      return '<p class="mut cn">True Path Method™ · 轨道</p>' +
        '<h2>' + esc(N.headline || 'Before we begin, what should we call you?') + '</h2>' +
        '<label class="mut" for="tp-name">' + esc(N.fieldLabel || 'First name') + '</label>' +
        '<input class="inp" id="tp-name" type="text" maxlength="30" autocomplete="given-name" value="' +
        esc(S.name) + '" placeholder="' + esc(N.placeholder || 'e.g. Jose') + '">' +
        '<p class="mut">' + esc(N.helper || '') + '</p>' +
        '<p id="nm-err" class="mut" role="status" aria-live="polite" style="color:#e53939"></p>' +
        '<button class="btn" data-act="begin-name">' + esc(N.ctaLabel || 'Begin My True Path') + '</button>';
    },

    tintro: function () {
      return prog(0) + '<h2>Four branches, one Talent Tree 才</h2>' +
        '<p>Twelve short statements. Rate each from 1 to 5 by how naturally it fits you. Your answers grow four branches:</p><ul>' +
        T.map(function (k) { return '<li><b>' + TN[k] + '</b>: ' + esc(C.TS[k]) + '</li>'; }).join('') + '</ul>' +
        '<button class="btn" data-act="begin-talent">Begin: 12 statements</button>';
    },

    iintro: function () {
      return prog(1) + '<h2>Where could your strengths matter most? 道</h2>' +
        '<svg viewBox="0 0 300 170" style="max-width:240px" role="img" aria-label="Four overlapping circles">' +
        '<g fill="rgba(122,31,46,.28)" stroke="#a8823f" stroke-width="1.5">' +
        '<circle cx="125" cy="68" r="46" /><circle cx="175" cy="68" r="46" />' +
        '<circle cx="125" cy="106" r="46" /><circle cx="175" cy="106" r="46" /></g></svg>' +
        '<p>' + esc(CFG.ikigai.intro.line) + '</p>' +
        '<button class="btn" data-act="begin-ikigai">Choose my direction</button>';
    },

    tq: function () {
      var id = C.ORDER[S.qi];
      return prog(0) + '<p class="mut">Statement ' + (S.qi + 1) + ' of 12</p><h2>' + esc(C.Q[id][0]) + '</h2>' +
        '<div class="lk" role="group" aria-label="1 is strongly disagree, 5 is strongly agree">' +
        [1, 2, 3, 4, 5].map(function (v) {
          return '<button class="opt' + (S.ta[id] === v ? ' on' : '') + '" aria-pressed="' +
            (S.ta[id] === v) + '" aria-label="' + v + ' of 5" data-ans="' + id + '" data-val="' + v + '">' +
            v + '</button>';
        }).join('') + '</div>' +
        '<div class="lkl"><span>Strongly disagree</span><span>Strongly agree</span></div>' +
        // v2.2 C1: Back on Q1 returns to the name screen, name still filled in.
        (S.qi > 0
          ? '<button class="ghost" data-act="talent-back">← Back</button>'
          : '<button class="ghost" data-act="name-back">← Back</button>');
    },

    tsnap: function () {
      var t = S.tal, a = arch(t);
      return prog(0) + '<h2>Your Talent Tree 才</h2>' + tree(t) +
        (t.balancedProfile
          ? '<h2>Balanced / Emerging Tree</h2><p>' + leadLine(t) + '</p>'
          : '<h2>' + esc(a[0]) + '</h2><p>' + leadLine(t) + ' ' + esc(a[1]) + '</p>') +
        chips(T.map(function (k) { return TN[k] + ' ' + t.pct[k] + '%'; })) +
        '<ul class="mut">' + obs(t).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
        '<p class="mut">Your strengths show how you naturally operate. Now let’s explore where those strengths could have the greatest meaning and value.</p>' +
        '<button class="btn" data-act="to-iintro">Refine your direction →</button>';
    },

    iq: function () {
      var i = S.ii, sel = S.ik[i] || [], sg = sugg(i), screen = ikScreen(i);
      return prog(1) + '<p class="mut">Question ' + (i + 1) + ' of 4 · choose 1–3</p><h2>' +
        esc(screen.question) + '</h2>' +
        (screen.helper ? '<p class="mut">' + esc(screen.helper) + '</p>' : '') +
        '<div class="grid">' +
        screen.options.map(function (o) {
          var selected = sel.indexOf(o.key) !== -1;
          return '<button class="opt' + (selected ? ' on' : '') + '" aria-pressed="' + selected +
            '" data-key="' + esc(o.key) + '">' +
            (sg.indexOf(o.key) !== -1 ? '<span class="sug">' + esc(CFG.ikigai.suggestionBadge) + '</span>' : '') +
            esc(o.label) + '</button>';
        }).join('') + '</div>' +
        '<button class="btn" data-act="ikigai-next"' + (sel.length ? '' : ' disabled') + '>Continue</button><br>' +
        (i > 0 ? '<button class="ghost" data-act="ikigai-back">← Back</button>' : '');
    },

    dsnap: function () {
      var g = function (i) { return S.ik[i] || []; };
      return prog(1) + '<h2>Your Direction 道</h2>' +
        ['Energises', 'Good at', 'Value', 'Impact'].map(function (n, i) {
          return '<p class="mut">' + n + '</p>' + chips(g(i).map(lbl));
        }).join('') +
        '<p>You are drawn to ' + list(g(0)) + ', with strengths in ' + list(g(1)) +
        '. You could create value through ' + list(g(2)) + ', aiming to make an impact by ' + imp(g(3)) + '.</p>' +
        '<p class="mut">You know how you think and where you want to go. One last step: the role you naturally play to get there.</p>' +
        '<button class="btn" data-act="to-rintro">Discover the role you’ll play →</button>';
    },

    rintro: function () {
      return prog(2) + '<p class="mut">Stage 3 of 3 · Final step · about 60 seconds left</p>' +
        '<h2>Last step: the role you’ll play to get there</h2>' +
        '<svg viewBox="0 0 300 200" style="max-width:240px"><polygon points="150,14 30,186 270,186" fill="none" stroke="#a8823f" stroke-width="2" />' +
        '<text x="150" y="42" fill="#a8823f" font-size="26" text-anchor="middle" class="cn">帅</text>' +
        '<text x="52" y="182" fill="#a8823f" font-size="26" text-anchor="middle" class="cn">将</text>' +
        '<text x="248" y="182" fill="#a8823f" font-size="26" text-anchor="middle" class="cn">相</text></svg>' +
        '<p>Every great team runs on three kinds of talent: the Commander 帅才 who sets direction, the General 将才 who delivers results, and the Chancellor 相才 who builds what lasts. Six quick scenarios. Choose what feels most like you.</p>' +
        '<details data-story><summary>Read the 2,000-year-old story</summary>' +
        '<p>Over 2,000 years ago, the founder of the Han dynasty explained his victory simply: he could not out-plan his strategist, out-govern his chancellor or out-fight his general, but he knew how to bring all three together. 吾能用之，此吾所以取天下也。 Today, every company, project and career still runs on the same Iron Triangle 铁三角.</p></details>' +
        '<button class="btn" data-act="begin-role">Begin: 6 scenarios</button>';
    },

    rq: function () {
      var i = S.si, s = C.SC[i];
      return prog(2) + '<p class="mut">Final step · scenario ' + (i + 1) + ' of 6 · about ' +
        Math.max(10, (6 - i) * 10) + ' seconds left</p><h2>' + esc(s[0]) + '</h2><div class="stack">' +
        S.ord[i].map(function (r) {
          return '<button class="opt" data-role="' + esc(r) + '">' + esc(s[1 + R.indexOf(r)]) + '</button>';
        }).join('') + '</div>' +
        (i > 0 ? '<button class="ghost" data-act="role-back">← Back</button>' : '');
    },

    syn: function () {
      return '<div class="pulse" role="status">Aligning your path…</div>';
    },

    result: function () {
      var t = S.tal, r = S.res, p = r.primary, g = r.gap, a = arch(t);
      var ti = C.TI[a[0]][R.indexOf(p)], c = C.RC[p], n = RN[p];
      var k = function (i) { return S.ik[i] || []; };
      var dl = dualOf(r);
      var cap = [].concat(C.CAP[t.dominant], C.CAP[t.secondary]);
      var capOk = k(1).some(function (x) { return cap.indexOf(x) !== -1; });
      // v2.2 C5: only tagged picks count; gap needs 2+ tagged picks, all pointing at the gap.
      var tg = (k(2) || []).map(function (x) { return C.TAGS[x] || null; }).filter(Boolean);
      var ecoOk = tg.indexOf(p) !== -1;
      var ecoGap = tg.length >= 2 && tg.every(function (role) { return role === g; });
      var url = cUrl(ti[0], p, a[0]);
      var RC = CFG.cta.result;
      // v2.2 C1/C3: personalised hero.
      var heroIntro = S.name ? esc(S.name) + ', your True Path is' : 'Your True Path is';
      // v2.2 C8: skip an impact phrase that repeats the role phrase's main word.
      var impactPick = (function () {
        var picksList = k(3);
        var roleWords = String(C.RV[p]).toLowerCase().split(/[^a-z]+/).filter(function (w) { return w.length > 2; });
        var clashes = function (key) {
          var phrase = OPT[key] ? OPT[key][2] : '';
          return String(phrase).toLowerCase().split(/[^a-z]+/).some(function (w) {
            return w.length > 2 && roleWords.indexOf(w) !== -1;
          });
        };
        for (var i = 0; i < picksList.length; i += 1) {
          if (!clashes(picksList[i])) return picksList[i];
        }
        return picksList[0] || null;
      })();

      return (S.name ? '<p class="mut">Prepared for ' + esc(S.name) + '</p>' : '') +
        '<h2>Your Iron Triangle Role</h2>' +
        '<h1 class="cn" style="font-size:2.2rem">' + esc(n[0]) + ' <span style="white-space:nowrap">' +
        esc(n[1]) + '</span> · The ' + esc(n[2]) + '</h1>' + tri(r.share) +
        '<p class="mut">Shares of your natural contribution across the three roles, always totalling 100%. Unlike Talent Tree scores, they show balance, not strength.</p>' +
        (r.pattern === 'balanced' ? '<span class="tag">三才兼备 · The Complete Triangle</span>'
          : dl ? '<span class="tag">' + esc(dl[0]) + ' pattern</span>' : '') +
        '<div class="box"><p><b>' + esc(c.core) + '</b></p>' +
        '<p class="mut">How you contribute: ' + esc(c.contrib) + '</p>' +
        '<p class="mut">Natural strengths: ' + esc(c.str) + '</p>' +
        '<p class="mut">Watch-out: ' + esc(c.watch) + '</p>' +
        '<p class="mut">Natural allies: ' + esc(c.ally) + '</p></div>' +
        (dl ? '<p>' + esc(dl[1]) + '</p>' : '') +
        (r.pattern === 'balanced'
          ? '<p>You flex across all three roles. Watch-out: you may be pulled in every direction, so choose a primary lane for this season.</p>'
          : '') +
        '<div class="box"><b>Your Triangle Gap: ' + esc(RN[g][0]) + ' ' + esc(RN[g][1]) + '</b><p>' +
        esc(C.GAP[g]) + '</p>' +
        (r.pattern === 'balanced'
          ? '<p class="mut">Your three roles are closely balanced, so treat this as a light lean rather than a gap.</p>'
          : '') + '</div>' +
        '<p><b>Where you may thrive:</b> ' + esc(c.thrive) + '</p>' +
        '<p><b>Growth edge:</b> ' + esc(c.edge) + '</p>' +
        '<div class="blk"><p class="mut cn">你的轨道 · Your True Path</p>' +
        '<p class="mut">' + heroIntro + '</p><h1>' + esc(ti[0]) + '</h1>' +
        '<p>' + esc(ti[1]) + '</p>' +
        '<p class="mut">' + esc(a[0]) + ' · ' + esc(n[0]) + ' ' + esc(n[1]) + '</p>' +
        '<span class="tag">才 ' + esc(a[0]) + '</span>' +
        '<span class="tag">道 ' + esc(lbl(k(0)[0] || 'solving_problems')) + '</span>' +
        '<span class="tag">位 ' + esc(n[0]) + '</span>' +
        '<p class="mut">One result, three layers of the True Path Method™.</p></div>' +
        blk('才 Talent pattern', '<div style="max-width:300px">' + tree(t) + '</div><p>' + leadLine(t) + ' ' +
          (t.balancedProfile ? '' : esc(a[1])) + '</p>' +
          chips(T.map(function (x) { return TN[x] + ' ' + t.pct[x] + '%'; }))) +
        blk('道 Purpose direction',
          '<p>' + (S.name ? esc(S.name) + ', y' : 'Y') + 'ou come alive when you are ' + list(k(0)) + '.</p>' +
          '<p>You see your strengths in ' + list(k(1)) + '.</p>' +
          '<p>You could earn a living through ' + list(k(2)) + '.</p>' +
          '<p>The difference you want to make: ' + imp(k(3)) + '.</p>') +
        blk('Possible areas to explore',
          '<p>' + list(k(2)) + '.</p>' +
          '<p class="mut">' + esc(capOk ? C.AMSG.talent_capability_aligned : C.AMSG.talent_capability_explore) + '</p>' +
          (ecoOk ? '<p class="mut">' + esc(C.AMSG.economic_role_aligned) + '</p>'
            : ecoGap ? '<p class="mut">' + esc(C.AMSG.economic_role_explore) + '</p>' : '')) +
        blk('Value creation style', '<p>You may create value most naturally by ' + esc(C.TV[t.dominant]) +
          ', ' + esc(C.RV[p]) + (impactPick ? ', and ' + esc(OPT[impactPick][2]) : '') + '.</p>') +
        blk('Reflection', '<ul>' + C.REFL.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>') +
        emailBlk() +
        '<div class="blk"><p>' + esc(RC.ancientWisdomBridge) + '</p>' +
        (url
          ? '<a class="btn" href="' + esc(url) + '" rel="noopener" data-consult="1">' +
            esc(RC.consultCtaLabel) + '</a>'
          : '<button class="btn" disabled>' + esc(RC.consultCtaLabel) + '</button>' +
            '<p class="mut">Booking link not configured.</p>') +
        '<p class="mut">' + esc(RC.consultSubcopy) + '</p></div>' + explore() +
        '<div class="blk"><button class="ghost" data-act="restart">' + esc(RC.restartLabel) +
        '</button><p class="mut">' + esc(CFG.cta.footer.brand) +
        '<br>A reflective self-discovery tool, not a psychological or career assessment.</p></div>';
    }
  };

  VW.report = function () {
    var t = S.tal, r = S.res, p = r.primary, g = r.gap, a = arch(t), ti = titleOf();
    var c = C.RC[p], n = RN[p], k = function (i) { return S.ik[i] || []; };
    var al = align(t, r, S.ik), url = cUrl(ti[0], p, a[0]);
    var PF = 'The Full Picture · Ancient Wisdom. Modern Strategy. · thefullpicture.asia';
    var heroIntro = S.name ? esc(S.name) + ', your True Path is' : 'Your True Path is';
    var dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    var roleWords = String(C.RV[p]).toLowerCase().split(/[^a-z]+/).filter(function (w) { return w.length > 2; });
    var clashes = function (key) {
      var phrase = OPT[key] ? OPT[key][2] : '';
      return String(phrase).toLowerCase().split(/[^a-z]+/).some(function (w) {
        return w.length > 2 && roleWords.indexOf(w) !== -1;
      });
    };
    var impactPick = k(3).filter(function (key) { return !clashes(key); })[0] || k(3)[0] || null;
    var ecoLine = al.indexOf('economic_role_aligned') !== -1
      ? esc(C.AMSG.economic_role_aligned)
      : al.indexOf('economic_role_explore') !== -1 ? esc(C.AMSG.economic_role_explore) : '';

    return '<div class="nop" style="display:flex;flex-wrap:wrap;gap:14px;align-items:center"><button class="ghost" style="margin:0" data-act="report-back">← Back to result</button> ' +
      '<button class="btn" style="margin:0" data-act="pdf">Save as PDF</button></div>' +
      '<p class="mut">' + (S.saved && S.id ? 'Report ' : 'Local preview (not saved) · ') +
      (S.saved && S.id ? '· The Full Picture' : 'The Full Picture') + '</p>' +
      '<div class="pg"><div class="box" style="text-align:center">' +
      (S.name ? '<p class="mut">Prepared for ' + esc(S.name) + ' · ' + esc(dateStr) + '</p>' : '') +
      '<p>' + heroIntro + '</p><h1 style="font-size:1.9rem">' + esc(ti[0]) + '</h1>' +
      '<p>' + esc(ti[1]) + '</p>' +
      '<p class="mut">' + esc(a[0]) + ' · ' + esc(n[0]) + ' ' + esc(n[1]) + '</p></div>' +
      '<h2>Your Talent Tree 才</h2>' + tree(t) +
      chips(T.map(function (x) { return TN[x] + ' ' + t.pct[x] + '%'; })) +
      '<h3>' + esc(t.balancedProfile ? 'Balanced / Emerging Tree' : a[0]) + '</h3>' +
      '<p>' + leadLine(t) + '</p>' +
      '<p>' + strengthsSentence(t) + '</p>' +
      '<ul>' + obs(t).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
      '<p class="mut pf">' + esc(PF) + '</p></div>' +
      '<div class="pg"><h2>Your Direction 道</h2>' +
      '<p>' + (S.name ? esc(S.name) + ', y' : 'Y') + 'ou come alive when you are ' + list(k(0)) + '.</p>' +
      '<p>You see your strengths in ' + list(k(1)) + '.</p>' +
      '<p>You could earn a living through ' + list(k(2)) + '.</p>' +
      '<p>The difference you want to make: ' + imp(k(3)) + '.</p>' +
      '<p><b>Possible areas to explore:</b> ' + list(k(2)) + '.</p>' +
      '<p>You may create value most naturally by ' + esc(C.TV[t.dominant]) + ', ' + esc(C.RV[p]) +
      (impactPick ? ', and ' + esc(OPT[impactPick][2]) : '') + '.</p>' +
      '<div class="box"><b>Alignment Check</b><br>' +
      esc(C.AMSG[al[0]] || '') + (ecoLine ? '<br>' + ecoLine : '') + '</div>' +
      '<p class="mut pf">' + esc(PF) + '</p></div>' +
      '<div class="pg"><h2>Your Role & True Path 位 轨道</h2>' + tri(r.share) +
      chips(R.map(function (x) { return RN[x][0] + ' ' + r.share[x] + '%'; })) +
      '<h3>' + esc(n[0]) + ' ' + esc(n[1]) + '</h3><p>' + esc(c.core) + '</p>' +
      '<p class="mut">' + esc(c.contrib) + '<br>Natural strengths: ' + esc(c.str) +
      '<br>Watch-out: ' + esc(c.watch) + '</p>' +
      '<p><b>Your gap ally (' + esc(RN[g][0]) + ' ' + esc(RN[g][1]) + '):</b> ' + esc(C.GAP[g]) +
      (r.pattern === 'balanced' ? ' Your roles are closely balanced, so treat this as a light lean.' : '') +
      '</p><p><b>Where you may thrive:</b> ' + esc(c.thrive) + '</p>' +
      '<p><b>Growth edge:</b> ' + esc(c.edge) + '</p>' +
      '<div class="box"><b>Your True Path</b><p>' + heroIntro + ' <b>' + esc(ti[0]) + '</b> — ' +
      esc(ti[1]) + '</p><p class="mut">' + esc(a[0]) + ' · ' + esc(n[0]) + ' ' + esc(n[1]) + '</p></div>' +
      (url ? '<p><a class="btn" href="' + esc(url) + '" rel="noopener" data-consult="1">' +
        esc(CFG.cta.result.consultCtaLabel) + '</a></p>' : '') +
      '<p class="mut pf">' + esc(PF) + '</p></div>' +
      '<div class="nop"><button class="ghost" data-act="restart">' +
      esc(CFG.cta.result.restartLabel) + '</button></div>';
  };

  // ─── render (guards mirror the approved reference) ────────────────────────

  var GATED = ['tintro', 'tsnap', 'iintro', 'iq', 'dsnap', 'rintro', 'rq', 'syn', 'result', 'report'];

  function guarded(step) {
    if (!VW[step]) return 'landing';
    // A report link that could not be DELIVERED is handled before the step machine runs; the
    // visitor might hold nothing but a link, so the canonical 12 steps are not the way back to it.
    if (step === 'report' && reportMissing) return 'landing';
    if (step === 'report' && reportUnavailable) return 'landing';
    // v2.2 C1: no name, no journey. Landing on any later step without one sends the visitor to
    // the name screen while every answer already saved stays exactly where it is.
    if (GATED.indexOf(step) !== -1 && !S.name) return 'start';
    if (step !== 'tintro' && GATED.indexOf(step) !== -1 && !S.tal) {
      return S.ta.some(function (v) { return !!v; }) ? 'tq' : 'landing';
    }
    // The scenario stage needs its randomised order to exist before it can be shown.
    if (step === 'rq' && S.ord.length !== 6) return 'rintro';
    if (['syn', 'report', 'result'].indexOf(step) !== -1 && !S.res) return 'landing';
    return step;
  }

  /** The static landing block is real markup in the shell; it is toggled, never rebuilt. */
  function staticLanding() {
    return /** @type {any} */ (document.querySelector('[data-tp-view="landing"]'));
  }

  function render() {
    if (!stepRoot) return;
    cancelRoleLock();
    if (synTimer) { clearTimeout(synTimer); synTimer = null; }

    var landing = staticLanding();
    if (S.step === 'landing' && landing) {
      // The landing copy ships as real markup for SEO and no-JS; leave it alone.
      landing.hidden = false;
      stepRoot.hidden = true;
      stepRoot.innerHTML = '';
      return;
    }
    if (landing) landing.hidden = true;
    stepRoot.hidden = false;
    stepRoot.innerHTML = VW[S.step] ? VW[S.step]() : VW.landing();

    if (S.step === 'syn') synTimer = setTimeout(function () { go('result'); }, 2600);
  }

  function fh() {
    var h = /** @type {any} */ ($('#tp-step-root h1, #tp-step-root h2'));
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }

  // ─── routing — real paths, history for Back, session for position ──────────

  function pathFor(step) { return ROUTES[step] || ROUTES.landing; }

  function snapshot(step) {
    return { s: step, qi: S.qi, ii: S.ii, si: S.si };
  }

  /**
   * Keep the CURRENT history entry's snapshot in step with the visible position. `go()` only
   * snapshots on stage transitions, so without this, advancing or going Back within a stage leaves
   * the entry describing an older question and Back→Forward would restore the wrong one.
   */
  function syncHistory() {
    try {
      history.replaceState(snapshot(S.step), '', pathFor(S.step));
    } catch (error) {
      /* a shell opened from the filesystem has no history to manage */
    }
  }

  function go(step, replace) {
    var from = S.step;
    S.step = guarded(step);
    save();
    // `syn` is an interstitial: replace its entry so Back skips straight past it.
    var useReplace = replace || from === 'syn';
    try {
      if (useReplace) history.replaceState(snapshot(S.step), '', pathFor(S.step));
      else history.pushState(snapshot(S.step), '', pathFor(S.step));
    } catch (error) {
      /* a shell opened from the filesystem has no history to manage */
    }
    evFor(S.step).forEach(function (pair) { track(pair[0], pair[1]); });
    render();
    window.scrollTo(0, 0);
    fh();
  }

  function stepFromPath() {
    var path = window.location.pathname.replace(/\/+$/, '') || '/true-path';
    if (path === '/true-path/index.html') path = '/true-path';
    for (var step in ROUTES) if (ROUTES[step] === path) return step;
    // Persistent report links: /true-path/report/{id}
    if (/^\/true-path\/report\/[^/]+$/.test(path) || /^\/true-path\/result\/[^/]+$/.test(path)) return 'report';
    return null;
  }

  /** Retry a report load that failed transiently, from inside the journey. */
  function retryReport() {
    if (reportRetry) return;
    reportRetry = 1;
    var id = reportIdFromLocation();
    if (!id) { reportUnavailable = 0; go('landing', true); reportRetry = 0; return; }
    loadReport(id).then(function (outcome) {
      reportRetry = 0;
      reportUnavailable = outcome === 'unavailable' ? 1 : 0;
      reportMissing = outcome === 'missing' ? 1 : 0;
      if (outcome === 'ok') { S.step = 'report'; go('report', true); }
      else afterBoot('report');
    });
  }

  function reportIdFromLocation() {
    var byQuery = qs('id');
    if (byQuery && RESULT_ID_PATTERN.test(byQuery)) return byQuery;
    var match = /^\/true-path\/(?:report|result)\/([^/]+)$/.exec(
      window.location.pathname.replace(/\/+$/, '')
    );
    if (match && RESULT_ID_PATTERN.test(match[1])) return match[1];
    return null;
  }

  /** Rebuild the canonical state from a stored record so a shared link renders the same report. */
  function adoptRecord(record) {
    if (!record || !record.talent || !record.ironTriangle) return false;
    var t = record.talent, it = record.ironTriangle, ik = record.ikigai || {};
    if (!t.pct || !t.raw) return false;
    S.tal = {
      raw: t.raw, pct: t.pct, dominant: t.dominant || t.primary,
      secondary: t.secondary, coDominant: !!t.coDominant, balancedProfile: !!t.balancedProfile
    };
    S.res = {
      share: it.share || it.shares, points: it.points, ikigaiHits: it.ikigaiHits,
      primary: it.primary, supporting: it.supporting, gap: it.gap, pattern: it.pattern
    };
    if (!S.res.share || !S.res.primary) return false;
    S.ik = { 0: ik.energises || [], 1: ik.goodAt || [], 2: ik.economicValue || [], 3: ik.impact || [] };
    // v2.2 C1: a stored record restores the name it was saved with.
    if (record.profile && typeof record.profile.firstName === 'string') S.name = cleanName(record.profile.firstName);
    S.id = typeof record.resultId === 'string' ? record.resultId : S.id;
    S.saved = S.id ? 1 : 0;
    save();
    return true;
  }

  /**
   * A visitor's OWN persisted answers describe the same journey, so adopting that record is
   * correct. It only counts when it is the very record the URL asked for: a session left over
   * from a different journey must never stand in for the link the visitor actually opened.
   */
  function loadOwnSavedReport(id) {
    if (!(S.saved && S.res && S.id) || S.id !== id) return false;
    S.step = 'report';
    S.rv = 0;
    return true;
  }

  /**
   * Load a report named by the URL. Both link forms are accepted, because links already in the
   * wild use both: the path form `/true-path/report/{id}` and the query form
   * `/true-path/report?id={id}` (see `reportIdFromLocation`).
   *
   * The three outcomes are distinguished, because they need different words on screen:
   *   'ok'        — the record was found and adopted;
   *   'missing'   — the server answered, and says no such report (404); start again really is the
   *                 only thing left to do, so the canonical 12-step journey restarts;
   *   'unavailable' — the request never got an answer (offline, 5xx, network). Nothing is wrong
   *                 with the link, so the visitor is offered a retry instead of a restart.
   *
   * @returns {Promise<'ok'|'missing'|'unavailable'>}
   */
  function loadReport(id) {
    var url = API.saveResult || '/api/true-path-report';
    return fetch(url + '?id=' + encodeURIComponent(id), { credentials: 'same-origin' })
      .then(function (response) {
        if (response.status === 404) return 'missing';
        if (!response.ok) return 'unavailable';
        return response.json().catch(function () { return null; }).then(function (data) {
          if (!data || !data.record) return 'missing';
          return adoptRecord(data.record) ? 'ok' : 'missing';
        });
      })
      .catch(function () { return 'unavailable'; });
  }

  // ─── binding — ONE delegated listener, no inline handlers ────────────────
  // No stored or config-supplied value is ever placed inside an event attribute, so a malicious
  // record can never execute as script.

  function onClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest('button, a');
    if (!button || !stepRoot.contains(button)) return;

    var product = button.getAttribute('data-product');
    if (product) track('tp_product_click', { productId: product });

    if (button.getAttribute('data-consult')) {
      track('tp_consult_click', {
        titleKey: tkey(), source: S.step === 'report' ? 'report' : 'result'
      });
      return; // a real link: let the browser follow it
    }

    var answerId = button.getAttribute('data-ans');
    if (answerId !== null) {
      ans(parseInt(answerId, 10), parseInt(button.getAttribute('data-val'), 10));
      return;
    }

    var key = button.getAttribute('data-key');
    if (key) { event.preventDefault(); pick(key); return; }

    var role = button.getAttribute('data-role');
    if (role) { chooseRole(role, button); return; }

    var act = button.getAttribute('data-act');
    if (!act) return;

    if (act === 'start') {
      track('tp_start');
      // A fresh start from a broken report link leaves the report URL behind, so the visitor is
      // not sent back to the same dead link on refresh.
      reportMissing = 0;
      reportUnavailable = 0;
      // v2.2 C1: Start leads to the name screen, not straight into the Talent Tree.
      go('start');
    } else if (act === 'begin-name') {
      // v2.2 C1: required, validated; the name never travels to analytics.
      var nameInput = /** @type {any} */ ($('#tp-name'));
      var errEl = $('#nm-err');
      var value = nameInput ? nameInput.value : '';
      var cleaned = cleanName(value);
      if (!value.trim()) {
        if (errEl) errEl.textContent = 'Please enter your first name to personalise your report.';
        return;
      }
      if (!cleaned) {
        if (errEl) errEl.textContent = 'Please use letters only (up to 30 characters).';
        return;
      }
      S.name = cleaned;
      save();
      track('tp_name_submitted');
      go('tintro');
    } else if (act === 'name-back') { go('start'); }
    else if (act === 'begin-talent') { go('tq'); }
    else if (act === 'talent-back') { backWithin('qi'); }
    else if (act === 'to-iintro') { go('iintro'); }
    else if (act === 'begin-ikigai') { S.ii = 0; track('tp_ikigai_start'); save(); go('iq'); }
    else if (act === 'ikigai-next') { nextIk(); }
    else if (act === 'ikigai-back') { backWithin('ii'); }
    else if (act === 'to-rintro') { go('rintro'); }
    else if (act === 'begin-role') { startRole(); }
    else if (act === 'role-back') { backWithin('si'); }
    else if (act === 'restart') { restart(); }
    else if (act === 'view-report') { track('tp_report_view', { resultId: S.id }); go('report'); }
    else if (act === 'report-retry') { retryReport(); }
    else if (act === 'report-back') { go('result'); }
    else if (act === 'pdf') { pdf(); }
    else if (act === 'send-email') { sendEmail(); }
    else if (act === 'skip-email') {
      S.skip = 1;
      track('tp_email_skip', { marketingConsent: false });
      save(); render();
    }
  }

  function bind() {
    if (bound) return;
    bound = 1;
    // Controls become live only now; lift the booting state the moment the listener exists.
    var host0 = $('#true-path-app');
    if (host0) host0.removeAttribute('data-tp-booting');
    stepRoot.addEventListener('click', onClick);
    // `toggle` does not bubble, so the story disclosure is caught during capture.
    document.addEventListener('toggle', function (event) {
      var node = /** @type {any} */ (event.target);
      if (node && node.hasAttribute && node.hasAttribute('data-story')) {
        track('tp_role_story_expand', { expanded: node.open });
      }
    }, true);
  }

  // ─── boot ─────────────────────────────────────────────────────────────────

  function showFailure() {
    var host = $('#true-path-app');
    if (!host) return;
    host.removeAttribute('data-tp-booting');
    host.innerHTML = '<section class="tp-section"><div class="tp-wrap tp-center">' +
      '<h1 class="tp-h1">True Path could not load</h1>' +
      '<p class="tp-lead">Please refresh the page. If it keeps happening, contact us and we will help.</p>' +
      '<a class="tp-btn" href="/contact">Contact Us</a></div></section>';
  }

  function afterBoot(requested) {
    // Capture the visitor's origin before any in-app transition can change the URL.
    captureAttribution();

    // A link whose report could not be REACHED: this is the only thing on screen, and the words
    // have to say so, because the visitor may hold nothing but the link.
    if (reportUnavailable || reportMissing) {
      bind();
      stepRoot.hidden = false;
      stepRoot.innerHTML = reportUnavailable
        ? '<h2>We couldn\u2019t load that report</h2>' +
          '<p class="mut">The link looks right, but we couldn\u2019t reach your report just now. ' +
          'This is usually temporary.</p>' +
          '<button class="btn" data-act="report-retry">Try again</button> ' +
          '<button class="ghost" data-act="start">Start again</button>'
        : '<h2>We couldn\u2019t find that report</h2>' +
          '<p class="mut">That link doesn\u2019t match a report we have. It may have expired, or ' +
          'the address may have been copied incompletely.</p>' +
          '<button class="btn" data-act="start">Start the free analysis</button> ' +
          '<a class="ghost" href="/contact">Contact us</a>';
      window.scrollTo(0, 0);
      fh();
      return;
    }

    var landing = staticLanding();
    if (landing) {
      landing.hidden = S.step !== 'landing';
      if (S.step === 'landing') {
        // The static CTA carries the real href already; add the event without replacing it.
        var startLink = document.querySelector('[data-tp-action="start"]');
        if (startLink) {
          startLink.addEventListener('click', function () { track('tp_start'); });
        }
      }
    }

    bind();
    window.addEventListener('popstate', function (event) {
      var state = event.state || null;
      if (state && typeof state.qi === 'number') {
        S.qi = state.qi;
        S.ii = state.ii;
        S.si = state.si;
      }
      S.step = guarded((state && state.s) || stepFromPath() || 'landing');
      save();
      render();
      window.scrollTo(0, 0);
      fh();
    });

    render();
    // The landing view is now rendered by the app rather than shipped as static markup, so its
    // view event fires here -- once per visit, exactly as the approved reference fired it.
    evFor(S.step).forEach(function (pair) { track(pair[0], pair[1]); });
    // Arriving out of order (a direct link to a gated step) means the URL and the visible step
    // disagree; put the URL back in step with what is actually shown.
    if (requested && S.step !== requested) {
      try { history.replaceState(snapshot(S.step), '', pathFor(S.step)); } catch (error) { /* ignore */ }
    }
  }

  function boot() {
    if (!root.TruePathConfig || !root.TruePathScoring || !root.TruePathSvg) { showFailure(); return; }
    if (!$('#true-path-app')) return;

    loadConfig().then(function (canonical) {
      prepare(canonical);
      restore();
      stepRoot = $('#tp-step-root');
      if (!stepRoot) { showFailure(); return; }

      var requested = stepFromPath();
      var reportId = requested === 'report' ? reportIdFromLocation() : null;

      if (reportId) {
        // A persistent report link must serve the report it NAMES. A saved session is only good
        // enough when it is that same report; any other saved session is skipped, not trusted.
        if (loadOwnSavedReport(reportId)) { afterBoot(requested); return; }
        loadReport(reportId).then(function (outcome) {
          reportMissing = outcome === 'missing' ? 1 : 0;
          reportUnavailable = outcome === 'unavailable' ? 1 : 0;
          S.step = outcome === 'ok' ? 'report' : 'landing';
          afterBoot(requested);
        });
        return;
      }
      S.step = guarded(requested || S.step || 'landing');
      afterBoot(requested);
    }).catch(function () {
      showFailure();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
