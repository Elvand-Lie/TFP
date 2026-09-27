// @ts-check
/**
 * True Path — report page controller  (loaded ONLY by /true-path/report).
 *
 * Why this file exists instead of routing through `true-path-app.js`: the journey router has
 * no `/true-path/report` case, so on the report page it falls through to `default:` and
 * redirects to the landing page. Giving the report its own entry point fixes that and keeps
 * the 1,425-line journey controller untouched.
 *
 * Brief 8 / 12: the report is viewable online, always, with NO email capture. Reachable three
 * ways, in priority order:
 *   1. `?r=<payload>`   — self-contained link (works with no server-side store)
 *   2. `?id=<resultId>` — server-side persistent id from Vercel KV / Upstash
 *   3. sessionStorage   — the visitor just finished the journey
 *
 * Holds no scoring logic: every number comes from lib/scoring.js.
 */

(function () {
  'use strict';

  var Scoring = /** @type {any} */ (window).TruePathScoring;
  var Resolve = /** @type {any} */ (window).TruePathResolve;
  var Svg = /** @type {any} */ (window).TruePathSvg;
  var StateMod = /** @type {any} */ (window).TruePathState;
  var ReportModel = /** @type {any} */ (window).TruePathReport;
  var ReportView = /** @type {any} */ (window).TruePathReportView;

  var REPORT_ENDPOINT = '/api/true-path-report';
  var PDF_ENDPOINT = '/api/true-path-pdf';

  function loadConfig() {
    var node = document.getElementById('tp-config');
    if (!node || !node.textContent) throw new Error('True Path config missing');
    return JSON.parse(node.textContent);
  }

  var CFG = loadConfig();
  var TALENT = CFG.talent;
  var IKIGAI = CFG.ikigai;
  var IRON = CFG.ironTriangle;
  var SCORING = CFG.scoring;
  var TRUPATH = CFG.trupath;
  var CTA = CFG.cta;
  var TALENT_FOR_ENGINE = Object.assign({}, TALENT, { scoring: SCORING.talent });

  var reportRoot = /** @type {any} */ (document.querySelector('[data-tp-report-root]'));
  var stepRoot = /** @type {any} */ (document.querySelector('[data-tp-step-root]'));

  function safeSession() {
    try {
      return window.sessionStorage;
    } catch (error) {
      return null;
    }
  }

  var store = StateMod.createStore(safeSession());
  var resultStore = StateMod.createResultStore(safeSession());

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(value));
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function qs(name) {
    var match = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setTitle(value) {
    document.title = value + ' | True Path \u8f68\u9053 \u2014 The Full Picture';
  }

  function tp(eventName, props) {
    if (qs('noanalytics') === '1') return;
    var payload = Object.assign({ event: eventName, ts: Date.now() }, props || {});
    /** @type {any} */ (window).dataLayer = /** @type {any} */ (window).dataLayer || [];
    /** @type {any} */ (window).dataLayer.push(payload);
    if (window.console && console.debug) console.debug('[true-path]', eventName, props || {});
  }

  /** UTF-8 safe base64url, so Chinese copy survives a payload link. */
  function encodeRecord(record) {
    try {
      var utf8 = unescape(encodeURIComponent(JSON.stringify(record)));
      return window.btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (error) {
      return null;
    }
  }

  function decodeRecord(payload) {
    try {
      var base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      var padded = base64 + new Array((4 - (base64.length % 4)) % 4 + 1).join('=');
      var parsed = JSON.parse(decodeURIComponent(escape(window.atob(padded))));
      return parsed && parsed.talent && parsed.ironTriangle ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Rebuild the §13 record from the journey the visitor just completed. Returns null when the
   * journey is incomplete, so the page can explain itself instead of rendering an empty report.
   */
  function computeFromJourney() {
    var state = store.getState();
    var answers = state.talentAnswers;
    if (Object.keys(answers).length < TALENT.displayOrder.length) return null;

    var talent = Scoring.scoreTalent(answers, TALENT_FOR_ENGINE);
    var scenarioRoles = IRON.scenarios.map(function (scenario) {
      return state.scenarioAnswers[scenario.id];
    });
    if (scenarioRoles.filter(Boolean).length < IRON.scenarios.length) return null;

    var picks = state.ikigaiPicks;
    var triangle = Scoring.computeRoleResult(scenarioRoles, talent.pct, picks, SCORING);

    var resolved = Resolve.buildTruePathResult({
      talent: talent,
      triangle: triangle,
      picks: picks,
      configs: {
        talent: TALENT_FOR_ENGINE,
        ikigai: IKIGAI,
        ironTriangle: IRON,
        truthPath: TRUPATH
      }
    });

    // Every option key ever highlighted as a suggestion, across all four screens (Brief 5).
    var suggestedKeys = [];
    [talent.primary, talent.secondary].forEach(function (category) {
      var bucket = (IKIGAI.suggestions || {})[category];
      if (!bucket) return;
      Object.keys(bucket).forEach(function (screenId) {
        (bucket[screenId] || []).forEach(function (key) {
          if (suggestedKeys.indexOf(key) === -1) suggestedKeys.push(key);
        });
      });
    });

    var previous = resultStore.read();
    var record = ReportModel.buildResultRecord({
      talent: talent,
      triangle: triangle,
      resolved: resolved,
      picks: picks,
      suggestedKeys: suggestedKeys,
      talentAnswers: answers,
      scenarios: IRON.scenarios,
      scenarioAnswers: state.scenarioAnswers,
      configs: { ikigai: IKIGAI, scoring: SCORING, truthPath: TRUPATH },
      meta: {
        resultId: previous && previous.resultId ? previous.resultId : ReportModel.makeResultId(),
        createdAt: previous && previous.createdAt ? previous.createdAt : new Date().toISOString(),
        attribution: {
          utm_source: null,
          utm_campaign: null,
          device: ReportModel.deviceClass(window.innerWidth)
        }
      }
    });

    resultStore.write(record);
    return record;
  }

  function renderEmpty(message) {
    if (reportRoot) reportRoot.hidden = true;
    if (!stepRoot) return;
    stepRoot.hidden = false;
    while (stepRoot.firstChild) stepRoot.removeChild(stepRoot.firstChild);
    stepRoot.appendChild(
      el('section', { class: 'tp-section' }, [
        el('div', { class: 'tp-wrap tp-center' }, [
          el('h1', { class: 'tp-h1', text: 'Your report is not ready yet' }),
          el('p', { class: 'tp-lead', style: 'margin:0 auto', text: message }),
          el('div', { class: 'tp-btn-row', style: 'justify-content:center;margin-top:24px' }, [
            el('a', { class: 'tp-btn', href: '/true-path', text: 'Start the True Path analysis' })
          ])
        ])
      ])
    );
  }

  /**
   * Store the record server-side so the short link /true-path/report?id=... works (Brief 12).
   * Best-effort: the report is already rendered and the payload link already carries
   * everything, so a missing KV store degrades to a longer URL rather than a broken page.
   */
  function persist(record) {
    try {
      fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      })
        .then(function (response) {
          if (!response.ok) throw new Error('status ' + response.status);
          return response.json();
        })
        .then(function (data) {
          if (data && data.stored && data.resultId) {
            try {
              // Canonical persistent URL, without reloading the page.
              window.history.replaceState(
                {},
                '',
                '/true-path/report?id=' + encodeURIComponent(data.resultId)
              );
            } catch (error) {
              /* history is best-effort */
            }
          }
        })
        .catch(function (error) {
          if (window.console && console.info) {
            console.info('[true-path] report not persisted (payload link still works)', error);
          }
        });
    } catch (error) {
      /* fetch unavailable */
    }
  }

  function renderReport(record) {
    if (stepRoot) stepRoot.hidden = true;
    if (!reportRoot) return;

    var model = ReportModel.buildReportModel(record, {
      talent: TALENT,
      ikigai: IKIGAI,
      ironTriangle: IRON,
      truthPath: TRUPATH,
      scoring: SCORING,
      cta: CTA
    });

    setTitle(CTA.report.headline);
    tp('tp_report_view', { resultId: record.resultId });

    ReportView.render(reportRoot, model, {
      Svg: Svg,
      iron: IRON,
      // The email form carries the record in the query string, so a report can be emailed even
      // when no server-side store is configured (Brief 21: degrade, never break).
      emailEndpoint: REPORT_ENDPOINT + '?r=' + encodeURIComponent(encodeRecord(record) || ''),
      pdfEndpoint: PDF_ENDPOINT + '?r=' + encodeURIComponent(encodeRecord(record) || ''),
      canDownloadPdf: true,
      onEmailSent: function () {
        tp('tp_report_email_sent', { resultId: record.resultId });
      }
    });

    persist(record);
  }

  function boot() {
    if (!Scoring || !Resolve || !Svg || !StateMod || !ReportModel || !ReportView) {
      renderEmpty('The report could not load. Please refresh the page.');
      return;
    }

    var payload = qs('r');
    if (payload) {
      var decoded = decodeRecord(payload);
      if (decoded) {
        renderReport(decoded);
        return;
      }
    }

    var id = qs('id');
    if (id) {
      fetch(REPORT_ENDPOINT + '?id=' + encodeURIComponent(id))
        .then(function (response) {
          if (!response.ok) throw new Error('status ' + response.status);
          return response.json();
        })
        .then(function (data) {
          if (data && data.record) renderReport(data.record);
          else {
            renderEmpty(
              'We could not find that report. You can retake the journey in about four minutes.'
            );
          }
        })
        .catch(function () {
          renderEmpty('We could not load that report right now. Please try again shortly.');
        });
      return;
    }

    var record = computeFromJourney();
    if (record) renderReport(record);
    else renderEmpty('Please complete the four-minute journey and your report will appear here.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
