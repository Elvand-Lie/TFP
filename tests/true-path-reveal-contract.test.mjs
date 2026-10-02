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
import { readTruePathConfig } from './helpers/true-path-config.mjs';

const require = createRequire(import.meta.url);
const S = require('../true-path/lib/scoring.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
// Suite path -> config bundle, via the canonical build() output (tests/helpers/true-path-config.mjs).
const readJson = (relative) => readTruePathConfig(repoRoot, relative);

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

test('thrive and growthEdge survive the config -> model -> report render path as text', () => {
  // Guards the original failure, which was a blank page: `iron-triangle.json` authors `thrive`
  // as a single string while the renderer called `.map()` on it, and the throw landed after the
  // synthesis overlay had already removed itself.
  //
  // The earlier version of this test asserted on the renderer's SOURCE (`Array.isArray(...)`
  // before mapping). That pinned one implementation, so a renderer that legitimately stopped
  // needing the guard — because the value is now treated as text everywhere — failed the gate
  // while the visitor-visible behaviour was still correct. This asserts the behaviour instead:
  // whatever the renderer does internally, the configured thrive/growthEdge copy must reach the
  // built report model intact and as display text.
  const ReportModel = require('../true-path/lib/report-model.js');
  const Scoring = require('../true-path/lib/scoring.js');
  const Resolve = require('../true-path/lib/trupath.js');

  const talentConfig = readJson('true-path/config/talent.json');
  const ikigaiConfig = readJson('true-path/config/ikigai.json');
  const truthPathConfig = readJson('true-path/config/trupath.json');
  const ctaConfig = readJson('true-path/config/cta.json');

  // A full, valid journey, built through the same scoring path the page uses.
  const answers = {};
  talentConfig.questions.forEach((question) => {
    answers[question.id] = 5;
  });
  const scenarioAnswers = {};
  iron.scenarios.forEach((scenario) => {
    scenarioAnswers[scenario.id] = 'commander';
  });
  const picks = [
    { screenId: 'I-1', key: 'teaching_sharing', fromSuggestion: false },
    { screenId: 'I-2', key: 'communication', fromSuggestion: false },
    { screenId: 'I-3', key: 'business_entrepreneurship', fromSuggestion: false },
    { screenId: 'I-4', key: 'help_people_find_direction', fromSuggestion: false }
  ];

  const talent = Scoring.scoreTalent(answers, talentConfig);
  const triangle = Scoring.computeRoleResult(
    iron.scenarios.map((scenario) => scenarioAnswers[scenario.id]),
    talent.pct,
    picks,
    scoringCfg
  );
  const resolved = Resolve.buildTruePathResult({
    talent,
    triangle,
    picks,
    configs: {
      talent: talentConfig,
      ikigai: ikigaiConfig,
      ironTriangle: iron,
      truthPath: truthPathConfig
    }
  });

  const record = ReportModel.buildResultRecord({
    talent,
    triangle,
    resolved,
    picks,
    suggestedKeys: [],
    talentAnswers: answers,
    scenarios: iron.scenarios,
    scenarioAnswers,
    configs: { ikigai: ikigaiConfig, scoring: scoringCfg, truthPath: truthPathConfig },
    meta: {
      resultId: 'tp_test000001',
      createdAt: '2026-09-24T10:00:00+08:00',
      attribution: { utm_source: null, utm_campaign: null, device: 'desktop' }
    }
  });

  ROLE_KEYS.forEach((key) => {
    const role = iron.roles.find((candidate) => candidate.key === key);
    assert.ok(role, `role "${key}" is missing from the config`);

    // Every role must carry both lines as non-empty text — the shape the report renders.
    ['thrive', 'growthEdge'].forEach((field) => {
      assert.ok(
        isNonEmptyString(role[field]),
        `roles.${key}.${field} must be a non-empty string (it is rendered as text), got ${typeof role[field]}`
      );
    });
  });

  const model = ReportModel.buildReportModel(record, {
    talent: talentConfig,
    ikigai: ikigaiConfig,
    ironTriangle: iron,
    truthPath: truthPathConfig,
    scoring: scoringCfg,
    cta: ctaConfig
  });

  assert.ok(model, 'buildReportModel returned null for a well-formed record');

  // The rendered report carries the configured copy through unchanged — not "[object Object]",
  // not a blank line, and not a comma-joined array.
  const serialized = JSON.stringify(model);
  for (const key of ROLE_KEYS) {
    const role = iron.roles.find((candidate) => candidate.key === key);
    assert.ok(
      serialized.includes(role.thrive),
      `role "${key}" thrive text did not reach the report model (would render blank)`
    );
    assert.ok(
      serialized.includes(role.growthEdge),
      `role "${key}" growthEdge text did not reach the report model (would render blank)`
    );
  }
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
