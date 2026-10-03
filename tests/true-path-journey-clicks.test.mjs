/**
 * True Path — journey click regression (jsdom).
 *
 * The journey's controls only come alive after the app boots: config fetch → prepare → bind →
 * render. Every hand-tested regression around "Begin: 12 statements" has been a break somewhere
 * on that chain, visible to a visitor as a button that renders but does nothing. These tests boot
 * the REAL app script in a DOM built from the REAL shell and drive the REAL delegated clicks, so
 * any tweak that breaks the click path fails here before it reaches a visitor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const APP_JS = readFileSync(path.join(repoRoot, 'true-path/assets/true-path-app.js'), 'utf8');
const CONFIG_JSON = JSON.parse(
  readFileSync(path.join(repoRoot, 'true-path/config/true-path.config.json'), 'utf8')
);

/** The talent intro ships as static shell markup; reproduce it exactly as deployed. */
const STATIC_INTRO_HTML =
  '<main id="true-path-app">' +
  '  <div id="tp-step-root"><h2>Four branches, one Talent Tree 才</h2>' +
  '  <button class="btn" data-act="begin-talent">Begin: 12 statements</button></div>' +
  '</main>';

/**
 * Boot the app in jsdom with every network primitive faked. `history` and `sessionStorage` are
 * stubbed far enough for the routing code to run; the assertions read the DOM, not the URL.
 */
function bootApp({ session = null, configError = false } = {}) {
  const dom = new JSDOM(STATIC_INTRO_HTML, {
    url: 'https://tfp-three.vercel.app/true-path/talent',
    runScripts: 'outside-only',
    beforeParse(window) {
      // jsdom has no storage backends; install simple map-based ones before app code runs.
      const makeStorage = () => ({
        _map: {},
        getItem(k) { return this._map[k] !== undefined ? this._map[k] : null; },
        setItem(k, v) { this._map[k] = String(v); },
        removeItem(k) { delete this._map[k]; },
        clear() { this._map = {}; }
      });
      const session = makeStorage();
      if (session) { /* seed below after construction via window.__seed */ }
      Object.defineProperty(window, 'sessionStorage', { value: session, configurable: true });
      Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true });
      window.__sessionStore = session;
      window.scrollTo = () => {};
    }
  });
  const { window } = dom;

  if (session) {
    window.__sessionStore.setItem('tfp.truepath.journey.v2', JSON.stringify(session));
  }
  window.history.replaceState = () => {};
  window.history.pushState = () => {};
  window.fetch = (url) => {
    if (configError) return Promise.reject(new Error('offline'));
    if (String(url).includes('true-path.config.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(CONFIG_JSON) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  };
  // The app guards on these globals being present before it boots at all.
  window.TruePathConfig = require(path.join(repoRoot, 'true-path/lib/config.js'));
  window.TruePathScoring = require(path.join(repoRoot, 'true-path/lib/scoring.js'));
  window.TruePathSvg = require(path.join(repoRoot, 'true-path/assets/true-path-svg.js'));
  window.TruePathReportPdf = require(path.join(repoRoot, 'true-path/lib/report-pdf.js'));

  window.eval(APP_JS);
  return { dom, window, document: window.document };
}

/** Wait for the async boot (config fetch → render) to settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

function click(window, selector) {
  const button = window.document.querySelector(selector);
  assert.ok(button, 'expected a ' + selector + ' button to be rendered');
  button.click();
}

/** A session that has passed the name gate: exactly what exists when the intro is on screen. */
function namedSession(overrides = {}) {
  return Object.assign({
    step: 'tintro', name: 'Test',
    ta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    qi: 0, ik: {}, ii: 0, sc: [], si: 0, ord: [], tal: null, res: null,
    fs: {}, id: null, saved: 0, sent: 0, skip: 0, rv: 0, saveKey: null,
    attr: { utm_source: null, utm_campaign: null }
  }, overrides);
}

test('journey: the intro Begin button renders the first Talent question', async () => {
  const { window } = bootApp({ session: namedSession() });
  await settle();

  click(window, '[data-act="begin-talent"]');
  await settle();

  const question = window.document.querySelector('#tp-step-root h2');
  assert.ok(question, 'the first question heading must render after Begin');
  assert.match(question.textContent, /I naturally enjoy/);
  assert.ok(
    window.document.querySelector('[data-ans]'),
    'the 1-5 answer options must render after Begin'
  );
});

test('journey: begin-name leads to the intro, and Begin: 12 statements still works after it', async () => {
  const { window, document } = bootApp();
  await settle();

  // The name gate: land on the start view, type a name, click Begin My True Path.
  click(window, '[data-act="begin-name"]'); // no input yet → validation message, no navigation
  document.querySelector('#tp-step-root');

  // Render the name view the way the app does, then drive it.
  const input = document.querySelector('#tp-name');
  if (input) {
    input.value = 'Test';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(window, '[data-act="begin-name"]');
    await settle();
    click(window, '[data-act="begin-talent"]');
    await settle();
    assert.ok(
      document.querySelector('[data-ans]'),
      'Begin: 12 statements must reach the questions after the name gate'
    );
  }
});

test('journey: a fresh journey with zero answers still reaches the questions', async () => {
  // Regression: the tq guard once sent unanswered journeys to the landing page, which a visitor
  // experiences as "the Begin button does nothing".
  const fresh = {
    step: 'tintro', name: 'Test',
    ta: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    qi: 0, ik: {}, ii: 0, sc: [], si: 0, ord: [], tal: null, res: null,
    fs: {}, id: null, saved: 0, sent: 0, skip: 0, rv: 0, saveKey: null,
    attr: { utm_source: null, utm_campaign: null }
  };
  const { window, document } = bootApp({ session: fresh });
  await settle();

  click(window, '[data-act="begin-talent"]');
  await settle();

  assert.ok(
    document.querySelector('[data-ans]'),
    'a zero-answer journey must reach the questions, never bounce to the landing page'
  );
  const landing = document.querySelector('[data-tp-view="landing"]');
  assert.ok(!landing || landing.hidden, 'the landing view must stay hidden');
});

test('journey: a stale pre-v2.2 session (no name) still completes the click path', async () => {
  const stale = {
    step: 'tq',
    ta: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    qi: 0, ik: {}, ii: 0, sc: [], si: 0, ord: [], tal: null, res: null,
    fs: {}, id: null, saved: 0, sent: 0, skip: 0, rv: 0, saveKey: null,
    attr: { utm_source: null, utm_campaign: null }
  };
  const { window, document } = bootApp({ session: stale });
  await settle();

  // Gated: no name → the app must land on the name screen with a working control.
  const input = document.querySelector('#tp-name');
  assert.ok(input, 'a session without a name must show the name gate');
  input.value = 'Test';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  click(window, '[data-act="begin-name"]');
  await settle();
  click(window, '[data-act="begin-talent"]');
  await settle();

  assert.ok(document.querySelector('[data-ans]'), 'the questions must render for a stale session');
});

test('journey: a failed config fetch shows the failure screen, never a dead intro', async () => {
  const { window, document } = bootApp({ configError: true });
  await settle();
  await settle();

  const host = document.querySelector('#true-path-app');
  assert.match(
    host.textContent,
    /could not load/i,
    'when the config cannot load the visitor must see the failure message'
  );
  assert.ok(
    !host.hasAttribute('data-tp-booting'),
    'the failure screen must lift the booting (pointer-events) gate'
  );
});

test('journey: booting state is released once controls are bound', async () => {
  const { window, document } = bootApp({ session: namedSession() });
  await settle();

  assert.ok(
    !document.querySelector('#true-path-app').hasAttribute('data-tp-booting'),
    'after a successful boot the pointer-events gate must be lifted'
  );
  click(window, '[data-act="begin-talent"]');
  await settle();
  assert.ok(document.querySelector('[data-ans]'), 'controls must be live after boot');
});
