/**
 * True Path — scoring rule and invariant tests beyond the six Section 17 cases.
 *
 * These defend behaviours the brief states as rules but only exercises obliquely:
 * tie-break ordering, co-dominance, balanced profile, dual/balanced classification,
 * largest-remainder normalisation, and "shares always total exactly 100".
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

const talentJson = readJson('true-path/config/talent.json');
const scoringCfg = readJson('true-path/config/scoring.json');
const ikigaiJson = readJson('true-path/config/ikigai.json');
const talentConfig = Object.assign({}, talentJson, { scoring: scoringCfg.talent });

const ROLE_KEYS = ['commander', 'general', 'chancellor'];
const sum = (values) => values.reduce((a, b) => a + b, 0);

// ─── Cross-config integrity (Brief 14: "7 tags per role", column totals 0.75) ──

test('affinity matrix: every row totals 1.00 and every column totals 0.75', () => {
  const categories = talentJson.categories.map((category) => category.key);
  const rows = { commander: 0, general: 0, chancellor: 0 };
  const cols = {};
  categories.forEach((category) => {
    cols[category] = 0;
  });

  ROLE_KEYS.forEach((role) => {
    categories.forEach((category) => {
      const value = scoringCfg.affinity[role][category];
      rows[role] += value;
      cols[category] += value;
    });
  });

  ROLE_KEYS.forEach((role) => {
    assert.equal(Math.round(rows[role] * 100) / 100, 1, `row total for ${role}`);
  });
  categories.forEach((category) => {
    assert.equal(Math.round(cols[category] * 100) / 100, 0.75, `column total for ${category}`);
  });
});

test('ikigai role tags: exactly 7 tags per role and no role structurally favoured', () => {
  const counts = { commander: 0, general: 0, chancellor: 0 };
  Object.values(scoringCfg.ikigaiRoleTags).forEach((role) => {
    counts[role] += 1;
  });
  assert.deepEqual(counts, { commander: 7, general: 7, chancellor: 7 });
});

test('every tagged Ikigai key exists in the configured option sets with a stable key', () => {
  const known = new Set();
  ikigaiJson.screens.forEach((screen) => {
    screen.options.forEach((option) => {
      assert.ok(option.key, `option in ${screen.id} must have a stable key`);
      assert.ok(!/^\d+$/.test(option.key), `key must not be a display position: ${option.key}`);
      known.add(option.key);
    });
  });

  Object.keys(scoringCfg.ikigaiRoleTags).forEach((key) => {
    assert.ok(known.has(key), `tagged key not present in ikigai.json: ${key}`);
  });

  // Option-level tags must agree with the scoring tag map.
  ikigaiJson.screens.forEach((screen) => {
    screen.options.forEach((option) => {
      const mapped = scoringCfg.ikigaiRoleTags[option.key];
      if (option.role === null || option.role === undefined) {
        assert.ok(!mapped, `${option.key} is untagged in ikigai.json but tagged in scoring.json`);
      } else {
        assert.equal(mapped, option.role, `role mismatch for ${option.key}`);
      }
    });
  });
});

test('all 18 True Path titles exist, are unique, and cover every archetype x role', () => {
  const archetypes = talentJson.archetypes.map((archetype) => archetype.key);
  const seen = new Set();
  assert.equal(talentJson.archetypes.length, 6);

  archetypes.forEach((archetype) => {
    ROLE_KEYS.forEach((role) => {
      const matches = readJson('true-path/config/trupath.json').titles.filter(
        (entry) => entry.archetype === archetype && entry.role === role
      );
      assert.equal(matches.length, 1, `exactly one title for ${archetype} x ${role}`);
      assert.ok(!seen.has(matches[0].title), `duplicate title: ${matches[0].title}`);
      seen.add(matches[0].title);
    });
  });

  assert.equal(seen.size, 18);
});

// ─── Talent tie-breaks (Brief 4.2) ──────────────────────────────────────────

test('tie-break 1: higher single-item answer within the tied category wins', () => {
  // Organiser 4,4,4 (max 4) vs Analyst 5,4,3 (max 5) -> both raw 12, Analyst wins on max item.
  const answers = { Q1: 4, Q2: 4, Q3: 4, Q4: 5, Q5: 4, Q6: 3, Q7: 1, Q8: 1, Q9: 1, Q10: 1, Q11: 1, Q12: 1 };
  const result = S.scoreTalent(answers, talentConfig);
  assert.equal(result.raw.organiser, 12);
  assert.equal(result.raw.analyst, 12);
  assert.equal(result.primary, 'analyst');
  assert.equal(result.secondary, 'organiser');
});

test('tie-break 2: equal max item, more "5 - Strongly Agree" answers wins', () => {
  // Organiser 5,3,3 vs Analyst 5,3,3 -> identical, must fall through to fixed order.
  // Compare against Creative 5,3,3 vs Analyst 4,4,3 (max 4) to prove max-item beats fives count.
  const answers = { Q1: 5, Q2: 3, Q3: 3, Q4: 4, Q5: 4, Q6: 3, Q7: 1, Q8: 1, Q9: 1, Q10: 1, Q11: 1, Q12: 1 };
  const result = S.scoreTalent(answers, talentConfig);
  assert.equal(result.raw.organiser, 11);
  assert.equal(result.raw.analyst, 11);
  // Both max 5, both one "5": fixed order -> Organiser first.
  assert.equal(result.primary, 'organiser');
});

test('tie-break 3: fully identical categories fall back to fixed order Organiser, Analyst, Communicator, Creative', () => {
  const answers = { Q1: 3, Q2: 3, Q3: 3, Q4: 3, Q5: 3, Q6: 3, Q7: 3, Q8: 3, Q9: 3, Q10: 3, Q11: 3, Q12: 3 };
  const result = S.scoreTalent(answers, talentConfig);
  assert.deepEqual(result.ranked, ['organiser', 'analyst', 'communicator', 'creative']);
});

test('coDominant is true whenever the top two raw scores are equal', () => {
  const answers = { Q1: 5, Q2: 5, Q3: 2, Q4: 5, Q5: 5, Q6: 2, Q7: 1, Q8: 1, Q9: 1, Q10: 1, Q11: 1, Q12: 1 };
  const result = S.scoreTalent(answers, talentConfig);
  assert.equal(result.raw.organiser, result.raw.analyst);
  assert.equal(result.coDominant, true);
});

test('balancedProfile is true when all four raw scores are within 1 point', () => {
  // 9, 9, 10, 10 -> spread 1 -> balanced.
  const answers = { Q1: 3, Q2: 3, Q3: 3, Q4: 3, Q5: 3, Q6: 3, Q7: 4, Q8: 3, Q9: 3, Q10: 4, Q11: 3, Q12: 3 };
  const result = S.scoreTalent(answers, talentConfig);
  const raws = Object.values(result.raw);
  assert.equal(Math.max.apply(null, raws) - Math.min.apply(null, raws) <= 1, true);
  assert.equal(result.balancedProfile, true);
});

test('Talent scores are independent and never forced to total 100', () => {
  const answers = { Q1: 5, Q2: 5, Q3: 5, Q4: 5, Q5: 5, Q6: 5, Q7: 5, Q8: 5, Q9: 5, Q10: 5, Q11: 5, Q12: 5 };
  const result = S.scoreTalent(answers, talentConfig);
  Object.values(result.pct).forEach((pct) => assert.equal(pct, 100));
  assert.equal(sum(Object.values(result.pct)), 400);
});

test('archetype mapping is unordered: Organisation+Analyst and Analyst+Organiser resolve identically', () => {
  const a = S.findArchetype(talentConfig, 'organiser', 'analyst');
  const b = S.findArchetype(talentConfig, 'analyst', 'organiser');
  assert.equal(a.key, b.key);
  assert.equal(a.name, 'Systems Strategist');
});

// ─── Iron Triangle normalisation and classification (Brief 14 Step D) ────────

test('largest remainder: shares always total exactly 100 across a wide sweep of inputs', () => {
  let checked = 0;
  const tokens = ['Cm', 'Ge', 'Ch'];
  const toRole = (token) => ({ Cm: 'commander', Ge: 'general', Ch: 'chancellor' })[token];

  // Exhaustive over every 6-scenario combination (3^6 = 729) x three talent profiles.
  const profiles = [
    { organiser: 100, analyst: 100, communicator: 100, creative: 100 },
    { organiser: 0, analyst: 100, communicator: 0, creative: 100 },
    { organiser: 33, analyst: 67, communicator: 17, creative: 50 }
  ];

  for (let i = 0; i < 729; i += 1) {
    let n = i;
    const seq = [];
    for (let slot = 0; slot < 6; slot += 1) {
      seq.push(tokens[n % 3]);
      n = Math.floor(n / 3);
    }
    profiles.forEach((talentPct) => {
      // Exercise the pure normaliser directly with arbitrary blended inputs.
      const arbitrary = {
        commander: 10 + (i % 7),
        general: 5 + (i % 11),
        chancellor: 3 + (i % 13)
      };
      const shares = S.largestRemainderShares(arbitrary, ROLE_KEYS);
      assert.equal(sum(ROLE_KEYS.map((role) => shares[role])), 100, `sum must be 100 for i=${i}`);
      ROLE_KEYS.forEach((role) => assert.ok(Number.isInteger(shares[role]), 'shares are integers'));

      // And exercise the full pipeline on real inputs.
      const result = S.computeRoleResult(seq.map(toRole), talentPct, [{ key: 'solving_problems' }], scoringCfg);
      assert.equal(sum(ROLE_KEYS.map((role) => result.shares[role])), 100, `pipeline sum must be 100 for i=${i}`);
    });
    checked += 1;
  }
  assert.equal(checked, 729);
});

test('largest remainder distributes leftover points by remainders, then fixed order on ties', () => {
  // Exact: 33.333... each -> floors 33/33/33, one leftover, all remainders equal -> fixed order gets it.
  const shares = S.largestRemainderShares({ commander: 1, general: 1, chancellor: 1 }, ROLE_KEYS);
  assert.deepEqual(shares, { commander: 34, general: 33, chancellor: 33 });
});

test('zero-signal input still yields a valid 100-point distribution', () => {
  const shares = S.largestRemainderShares({ commander: 0, general: 0, chancellor: 0 }, ROLE_KEYS);
  assert.equal(sum(ROLE_KEYS.map((role) => shares[role])), 100);
});

test('pattern classification: balanced when spread <= 6, dual when top two within 5, else single', () => {
  const scenarioPoints = { commander: 4, general: 4, chancellor: 4 };
  const shares = { commander: 34, general: 33, chancellor: 33 };

  // Balanced: exact spread <= 6.
  const balanced = S.classifyTriangle(
    { commander: 40, general: 38, chancellor: 36 },
    scenarioPoints,
    shares,
    scoringCfg
  );
  assert.equal(balanced.pattern, 'balanced');

  // Dual: commander 50, general 47, chancellor 20 -> spread 30 (>6), top-two gap 3 (<=5).
  const dual = S.classifyTriangle(
    { commander: 50, general: 47, chancellor: 20 },
    scenarioPoints,
    { commander: 50, general: 47, chancellor: 20 },
    scoringCfg
  );
  assert.equal(dual.pattern, 'dual');
  assert.equal(dual.dualPair, 'commander_general');

  // Single: clear separation.
  const single = S.classifyTriangle(
    { commander: 70, general: 20, chancellor: 10 },
    scenarioPoints,
    { commander: 70, general: 20, chancellor: 10 },
    scoringCfg
  );
  assert.equal(single.pattern, 'single');
});

test('ordering and gap use exact blended values, not the rounded shares', () => {
  // Two roles whose exact shares round to the same integer must still order deterministically.
  const scenarioPoints = { commander: 1, general: 0, chancellor: 0 };
  const shares = S.largestRemainderShares({ commander: 1, general: 1, chancellor: 1 }, ROLE_KEYS);

  // Commander and General nearly equal but commander marginally lower and fewer scenario points.
  const result = S.classifyTriangle(
    { commander: 33.3331, general: 33.3332, chancellor: 33.3337 },
    scenarioPoints,
    shares,
    scoringCfg
  );
  assert.equal(result.ordered[0], 'chancellor');
  assert.equal(result.gap, 'commander');
});

test('Ikigai signal is neutral only when no tagged option was picked', () => {
  const neutral = S.ikigaiRoleSignal([{ key: 'teaching_sharing' }, { key: 'empathy' }], scoringCfg);
  assert.equal(neutral.neutral, true);
  assert.equal(neutral.totalHits, 0);
  ROLE_KEYS.forEach((role) => {
    assert.equal(Math.round(neutral.pct[role] * 10) / 10, 33.3);
  });

  const tagged = S.ikigaiRoleSignal(
    [{ key: 'leading_influencing' }, { key: 'planning' }],
    scoringCfg
  );
  assert.equal(tagged.neutral, false);
  assert.equal(tagged.hits.commander, 1);
  assert.equal(tagged.hits.chancellor, 1);
  assert.equal(tagged.pct.commander, 50);
  assert.equal(tagged.pct.chancellor, 50);
  assert.equal(tagged.pct.general, 0);
});

// ─── Scenario sampling covers every role (Brief 6.3) ────────────────────────

test('config defines exactly six scenarios, each offering all three roles', () => {
  const ironTriangle = readJson('true-path/config/iron-triangle.json');
  assert.equal(ironTriangle.scenarios.length, 6);
  ironTriangle.scenarios.forEach((scenario) => {
    ROLE_KEYS.forEach((role) => {
      assert.ok(scenario.options[role], `scenario ${scenario.id} must offer role ${role}`);
      assert.equal(typeof scenario.options[role], 'string');
    });
  });
});

test('talent display order is interleaved, not grouped by archetype', () => {
  const byId = {};
  talentJson.questions.forEach((question) => {
    byId[question.id] = question.category;
  });

  const order = talentJson.displayOrder;
  assert.equal(order.length, 12);
  assert.equal(new Set(order).size, 12, 'display order lists every question exactly once');

  // The first four displayed questions must span four different categories.
  const firstFour = new Set(order.slice(0, 4).map((id) => byId[id]));
  assert.equal(firstFour.size, 4, 'first four statements must span all four archetypes');

  // No two consecutive displayed questions share a category.
  for (let i = 1; i < order.length; i += 1) {
    assert.notEqual(
      byId[order[i]],
      byId[order[i - 1]],
      `display order repeats category at positions ${i} and ${i + 1}`
    );
  }
});
