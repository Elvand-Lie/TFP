/**
 * True Path — Iron Triangle config/UI contract tests.
 *
 * `revealRole()` is the only renderer with no defensive guard: it maps over config
 * fields and writes straight into `#tp-step-root`. When a config field's type does
 * not match what the renderer expects, the throw happens *after* the synthesis has
 * removed itself, so the visitor gets a blank page with no error shown.
 *
 * That exact failure shipped once: `iron-triangle.json` authors `thrive` as a single
 * string while `revealRole()` called `.map()` on it.
 *
 * These tests assert the contract between the config and every field `revealRole()`
 * consumes, so the config cannot drift out of type again without the gate failing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const S = require('../true-path/lib/scoring.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const readJson = (relative) => JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));

const iron = readJson('true-path/config/iron-triangle.json');
const scoringCfg = readJson('true-path/config/scoring.json');

/**
 * Canonical role order. `iron-triangle.json` keys its role list and its dual-pattern
 * keys in this order, so a derived pair key must use it rather than a lexicographic sort.
 */
const ROLE_KEYS = ['commander', 'general', 'chancellor'];

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

/** Order an unordered role pair the way the config does. */
const canonicalPair = (a, b) =>
  [a, b].sort((x, y) => ROLE_KEYS.indexOf(x) - ROLE_KEYS.indexOf(y)).join('_');

// ─── Role fields consumed by revealRole() ─────────────────────────────────────

// Fields the renderer passes to `el(..., { text: value })` — a non-string here renders
// "[object Object]" rather than throwing, so the assertion is about content, not crash.
const ROLE_TEXT_FIELDS = [
  'key',
  'name',
  'chinese',
  'subtitle',
  'essence',
  'oneLine',
  'exemplarName',
  'exemplarLine',
  'contribution',
  'watchOut',
  'allies',
  'growthEdge'
];

test('every role field revealRole() renders as text is a non-empty string', () => {
  assert.ok(Array.isArray(iron.roles) && iron.roles.length > 0, 'roles must be a non-empty array');

  iron.roles.forEach((role) => {
    ROLE_TEXT_FIELDS.forEach((field) => {
      assert.ok(
        isNonEmptyString(role[field]),
        `role "${role.key}" field "${field}" must be a non-empty string, got ${typeof role[field]}`
      );
    });
  });
});

test('naturalStrengths is an array of strings — revealRole() maps it directly', () => {
  iron.roles.forEach((role) => {
    assert.ok(
      Array.isArray(role.naturalStrengths),
      `role "${role.key}" naturalStrengths must be an array (revealRole maps it), got ${typeof role.naturalStrengths}`
    );
    assert.ok(role.naturalStrengths.length > 0, `role "${role.key}" naturalStrengths must not be empty`);
    role.naturalStrengths.forEach((item, index) => {
      assert.ok(
        isNonEmptyString(item),
        `role "${role.key}" naturalStrengths[${index}] must be a non-empty string`
      );
    });
  });
});

test('thrive is a string or an array of strings — never any other type', () => {
  // The regression that blanked the result page: `thrive` was a string while the
  // renderer mapped it. Either shape is allowed now that the renderer normalizes,
  // but a number/object/null must still fail here rather than in the browser.
  iron.roles.forEach((role) => {
    const thrive = role.thrive;
    const ok =
      isNonEmptyString(thrive) ||
      (Array.isArray(thrive) && thrive.length > 0 && thrive.every(isNonEmptyString));
    assert.ok(
      ok,
      `role "${role.key}" thrive must be a non-empty string or array of non-empty strings, got ${
        Array.isArray(thrive) ? 'array' : typeof thrive
      }`
    );
  });
});

test('revealRole() normalizes thrive before mapping it', () => {
  // Guards the fix itself: the renderer must not map thrive directly again. If this
  // assertion fails, someone removed the normalization and reintroduced the blank page.
  const appSource = readFileSync(path.join(repoRoot, 'true-path/assets/true-path-app.js'), 'utf8');
  assert.match(
    appSource,
    /Array\.isArray\(primaryRole\.thrive\)/,
    'revealRole() must normalize primaryRole.thrive with Array.isArray before mapping'
  );
});

// ─── Reveal-level copy consumed by revealRole() ────────────────────────────────

test('reveal copy is present as non-empty strings', () => {
  assert.ok(iron.reveal && typeof iron.reveal === 'object', 'reveal block is required');
  ['headline', 'shareTooltip', 'gapHeadline', 'gapFraming', 'thriveHeadline'].forEach((field) => {
    assert.ok(
      isNonEmptyString(iron.reveal[field]),
      `reveal.${field} must be a non-empty string, got ${typeof iron.reveal[field]}`
    );
  });
  assert.ok(isNonEmptyString(iron.stageLabel), 'stageLabel must be a non-empty string');
});

test('gapInsights covers every role with both lines revealRole() renders', () => {
  ROLE_KEYS.forEach((key) => {
    const insight = iron.gapInsights && iron.gapInsights[key];
    assert.ok(insight, `gapInsights.${key} is missing — revealRole() reads it for the gap role`);
    assert.ok(
      isNonEmptyString(insight.classicImbalance),
      `gapInsights.${key}.classicImbalance must be a non-empty string`
    );
    assert.ok(isNonEmptyString(insight.insight), `gapInsights.${key}.insight must be a non-empty string`);
  });
});

// ─── Pattern keys — the second contract revealRole() depends on ────────────────

test('dual pattern keys cover every role pair in canonical order', () => {
  const expected = [];
  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    for (let j = i + 1; j < ROLE_KEYS.length; j += 1) {
      expected.push(canonicalPair(ROLE_KEYS[i], ROLE_KEYS[j]));
    }
  }
  const actual = Object.keys(iron.patterns.dual);
  expected.forEach((key) => {
    assert.ok(actual.includes(key), `patterns.dual is missing canonical key "${key}"`);
  });
  Object.entries(iron.patterns.dual).forEach(([key, entry]) => {
    assert.ok(isNonEmptyString(entry.label), `patterns.dual.${key}.label must be a non-empty string`);
    assert.ok(isNonEmptyString(entry.line), `patterns.dual.${key}.line must be a non-empty string`);
  });
});

test('balanced pattern copy is present', () => {
  assert.ok(isNonEmptyString(iron.patterns.balanced.label), 'patterns.balanced.label is required');
  assert.ok(isNonEmptyString(iron.patterns.balanced.line), 'patterns.balanced.line is required');
});

test('classifyTriangle() derives a dualPair key that actually resolves in the config', () => {
  // revealRole() and trupath.js both do `iron.patterns.dual[triangle.dualPair]`. A key
  // built by sorting the two role names lexicographically does not match the config for
  // commander+chancellor or general+chancellor, so the dual badge silently disappears.
  const scenarioPoints = { commander: 4, general: 4, chancellor: 4 };
  let dualCases = 0;

  for (let i = 0; i < ROLE_KEYS.length; i += 1) {
    for (let j = 0; j < ROLE_KEYS.length; j += 1) {
      if (i === j) continue;
      const primary = ROLE_KEYS[i];
      const supporting = ROLE_KEYS[j];
      const shares = { commander: 2, general: 2, chancellor: 2 };
      shares[primary] = 50;
      shares[supporting] = 46;
      shares[ROLE_KEYS.find((key) => key !== primary && key !== supporting)] = 4;

      const triangle = S.classifyTriangle(shares, scenarioPoints, shares, scoringCfg);
      if (triangle.pattern !== 'dual' || !triangle.dualPair) continue;
      dualCases += 1;

      assert.ok(
        iron.patterns.dual[triangle.dualPair],
        `dualPair "${triangle.dualPair}" (primary ${primary}, supporting ${supporting}) has no patterns.dual entry`
      );
      assert.equal(
        triangle.dualPair,
        canonicalPair(primary, supporting),
        `dualPair must use canonical role order for ${primary} + ${supporting}`
      );
    }
  }

  assert.ok(dualCases > 0, 'expected at least one dual classification to exercise this contract');
});

test('every dualPair the scoring library can emit resolves to a config entry', () => {
  const scenarioPoints = { commander: 4, general: 4, chancellor: 4 };
  const shares = { commander: 34, general: 33, chancellor: 33 };
  const triangle = S.classifyTriangle(
    { commander: 40, general: 38, chancellor: 36 },
    scenarioPoints,
    shares,
    scoringCfg
  );
  if (triangle.pattern === 'dual' && triangle.dualPair) {
    assert.ok(iron.patterns.dual[triangle.dualPair], `dualPair "${triangle.dualPair}" is unmatched`);
  }
});
