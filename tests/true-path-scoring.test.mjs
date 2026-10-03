/**
 * True Path — Section 17 scoring acceptance gate (Master Brief v2.1).
 *
 * "Testing is a release gate ... The developer must reproduce these exact outputs."
 * Each case below is transcribed from Brief Section 17 and asserted exactly.
 * Do NOT edit an expected value to make a test pass — debug the engine against Section 14.
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

const talentJson = readJson('true-path/config/talent.json');
const scoringCfg = readJson('true-path/config/scoring.json');
const trupathCfg = readJson('true-path/config/trupath.json');

// The engine takes talent.json merged with its scoring block.
const talentConfig = Object.assign({}, talentJson, { scoring: scoringCfg.talent });

const ROLE_TOKEN = { Cm: 'commander', Ge: 'general', Ch: 'chancellor' };

function answers(list) {
  const out = {};
  talentJson.questions.forEach((question, index) => {
    out[question.id] = list[index];
  });
  return out;
}

function picks(keys) {
  return keys.map((key) => ({ key }));
}

function roles(tokens) {
  return tokens.map((token) => ROLE_TOKEN[token]);
}

function titleFor(archetypeKey, roleKey) {
  const found = trupathCfg.titles.find(
    (entry) => entry.archetype === archetypeKey && entry.role === roleKey
  );
  return found ? found.title : null;
}

/** Run one full Section 17 case: Talent (Q1-Q12) + Ikigai picks + Scenarios (S1-S6). */
function runCase(talentAnswers, ikigaiKeys, scenarioTokens) {
  const talent = S.scoreTalent(answers(talentAnswers), talentConfig);
  const triangle = S.computeRoleResult(
    roles(scenarioTokens),
    talent.pct,
    picks(ikigaiKeys),
    scoringCfg
  );
  return { talent, triangle };
}

// ─── Case A ──────────────────────────────────────────────────────────────────
test('Section 17 Case A — Systems Strategist, Chancellor, gap Commander, The Master Architect', () => {
  const { talent, triangle } = runCase(
    [5, 5, 4, 5, 5, 5, 3, 2, 3, 3, 3, 2],
    ['solving_problems', 'strategy', 'analysis', 'consulting_advisory', 'help_businesses_grow'],
    ['Ch', 'Ch', 'Ch', 'Cm', 'Ch', 'Ge']
  );

  assert.equal(talent.archetype.name, 'Systems Strategist');
  assert.equal(talent.archetypeKey, 'organiser_analyst');

  // Displayed shares: Cm 22 / Ge 22 / Ch 58 -> v2.2 C5 (consulting untagged, technology tagged chancellor)
  assert.deepEqual(triangle.shares, { commander: 22, general: 22, chancellor: 56 });
  assert.equal(triangle.primary, 'chancellor');

  // gap Commander -> The Master Architect
  assert.equal(triangle.gap, 'commander');
  assert.equal(titleFor(talent.archetypeKey, triangle.primary), 'The Master Architect');
});

// ─── Case B ──────────────────────────────────────────────────────────────────
test('Section 17 Case B — co-dominant Communicator=Creative, Creative Influencer, The Movement Builder', () => {
  const { talent, triangle } = runCase(
    [2, 2, 2, 3, 3, 3, 5, 4, 5, 5, 5, 4],
    [
      'leading_influencing',
      'communication',
      'creativity',
      'personal_growth_coaching',
      'inspire_others'
    ],
    ['Cm', 'Cm', 'Ge', 'Cm', 'Cm', 'Cm']
  );

  assert.equal(talent.coDominant, true);
  assert.equal(talent.raw.communicator, talent.raw.creative);
  assert.equal(talent.archetype.name, 'Creative Influencer'); // v2.2 C6 rename
  assert.equal(talent.archetypeKey, 'communicator_creative');

  // Cm 67 / Ge 25 / Ch 8
  assert.deepEqual(triangle.shares, { commander: 67, general: 25, chancellor: 8 });
  assert.equal(triangle.primary, 'commander');
  assert.equal(titleFor(talent.archetypeKey, triangle.primary), 'The Movement Builder');
});

// ─── Case C ──────────────────────────────────────────────────────────────────
test('Section 17 Case C — Leadership Coordinator, Cm 19 / Ge 73 / Ch 8, The Field Marshal', () => {
  const { talent, triangle } = runCase(
    [4, 4, 3, 2, 2, 3, 4, 4, 5, 3, 2, 3],
    ['building_creating_projects', 'execution', 'sales_influence', 'build_wealth_freedom'],
    ['Ge', 'Ge', 'Ge', 'Ge', 'Cm', 'Ge']
  );

  assert.equal(talent.archetype.name, 'Leadership Coordinator');
  assert.equal(talent.archetypeKey, 'organiser_communicator');

  assert.deepEqual(triangle.shares, { commander: 19, general: 73, chancellor: 8 });
  assert.equal(triangle.primary, 'general');
  assert.equal(titleFor(talent.archetypeKey, triangle.primary), 'The Field Marshal');
});

// ─── Case D ──────────────────────────────────────────────────────────────────
test('Section 17 Case D — balancedProfile, neutral Ikigai, 34 / 33 / 33, pattern balanced', () => {
  const { talent, triangle } = runCase(
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    ['teaching_sharing', 'empathy', 'education_training', 'teach_wisdom'],
    ['Cm', 'Ge', 'Ch', 'Cm', 'Ge', 'Ch']
  );

  assert.equal(talent.balancedProfile, true);
  Object.values(talent.raw).forEach((raw) => assert.equal(raw, 9));

  // Every pick is untagged -> neutral signal, equal thirds.
  assert.equal(triangle.ikigai.neutral, true);
  assert.equal(triangle.ikigai.totalHits, 0);

  assert.deepEqual(triangle.shares, { commander: 34, general: 33, chancellor: 33 });
  assert.equal(triangle.pattern, 'balanced');
});

// ─── Case E ──────────────────────────────────────────────────────────────────
test('Section 17 Case E — Organiser = Analyst tie resolves to Organiser, 9 / 37 / 54, The Master Architect', () => {
  const { talent, triangle } = runCase(
    [5, 4, 4, 4, 4, 5, 2, 2, 2, 3, 3, 3],
    ['solving_problems', 'planning', 'operations_management', 'build_systems_efficiency'],
    ['Ch', 'Ge', 'Ch', 'Ge', 'Ch', 'Ge']
  );

  // Tie-break 1: higher single-item answer within the category -> Organiser (max 5) before Analyst (max 5),
  // then tie-break 2 counts of "5": Organiser 1 vs Analyst 1, then tie-break 3 fixed order -> Organiser first.
  assert.equal(talent.raw.organiser, 13);
  assert.equal(talent.raw.analyst, 13);
  assert.equal(talent.primary, 'organiser');
  assert.equal(talent.secondary, 'analyst');
  assert.equal(talent.coDominant, true);
  assert.equal(talent.archetypeKey, 'organiser_analyst');

  assert.deepEqual(triangle.shares, { commander: 9, general: 37, chancellor: 54 });
  assert.equal(titleFor(talent.archetypeKey, triangle.primary), 'The Master Architect');
});

// ─── Case F ──────────────────────────────────────────────────────────────────
test('Section 17 Case F — all 100, dual The Pioneer, tie resolves to Commander, The Grand Strategist', () => {
  const { talent, triangle } = runCase(
    [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    ['leading_influencing', 'execution'],
    ['Cm', 'Cm', 'Cm', 'Ge', 'Ge', 'Ge']
  );

  Object.values(talent.pct).forEach((pct) => assert.equal(pct, 100));

  assert.deepEqual(triangle.shares, { commander: 43, general: 43, chancellor: 14 });
  assert.equal(triangle.pattern, 'dual');
  assert.equal(triangle.dualPair, 'commander_general');

  // Equal exact shares between Commander and General -> fixed order gives Commander the primary slot.
  assert.equal(triangle.primary, 'commander');
  assert.equal(titleFor(talent.archetypeKey, triangle.primary), 'The Grand Strategist');
});
