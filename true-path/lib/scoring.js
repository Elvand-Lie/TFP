// @ts-check
/**
 * True Path scoring engine — Master Brief v2.1, Section 14 (reference engine).
 *
 * LOGIC ONLY. All content, weights, matrices, tags and thresholds are injected via
 * config so nothing here needs editing when copy or tuning changes (Brief 20.3 / 15).
 *
 * Reference (Brief 14), reproduced literally:
 *   scoreTalent      raw[cat] = sum of its 3 answers (3..15)
 *                    pct[cat] = round(((raw - 3) / 12) * 100)
 *   Step A           points[role] += 2 per scenario where role picked  (6 scenarios -> 12 total)
 *                    scenarioPct[role] = points[role] / 12 * 100
 *   Step B           affinity[role] = Σ_talent(AFFINITY[role][talent] × talentPct[talent])   // 0-100
 *   Step C           hits[role] = number of selected Ikigai options tagged to that role
 *                    ikigaiPct[role] = hits[role] / Σhits × 100   (no tagged picks -> 33.3 each)
 *   Step D           blended[role] = 0.65×scenarioPct + 0.20×affinity + 0.15×ikigaiPct
 *                    share[role] = blended / Σblended × 100   (largest remainder -> exactly 100)
 *                    primary = highest, supporting = 2nd, gap = lowest
 *                    pattern = balanced if (max-min) <= 6
 *                            = dual     if (primary-supporting) <= 5
 *                            = single   otherwise
 *
 * The six Section 17 cases are the acceptance gate for this file.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).TruePathScoring = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ROLE_KEYS = ['commander', 'general', 'chancellor'];

  // ─── helpers ───────────────────────────────────────────────────────────────

  function clampInt(value, min, max) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function sum(values) {
    return values.reduce((total, value) => total + value, 0);
  }

  /**
   * Largest remainder apportionment (Brief 14 Step D: "shares SUM to 100").
   * Deterministic and documented:
   *   1. floor every exact share
   *   2. hand the leftover points to the largest fractional remainders
   *   3. break remainder ties by the supplied role ranking (fixed order by default)
   *   4. if there is no signal at all, split evenly with the leftover by fixed order
   */
  function largestRemainderShares(exactShares, roleKeys, tieOrder = roleKeys) {
    const total = sum(roleKeys.map((key) => exactShares[key] || 0));
    const out = {};
    const remainders = [];

    if (total <= 0) {
      const base = Math.floor(100 / roleKeys.length);
      let leftover = 100 - base * roleKeys.length;
      roleKeys.forEach((key) => {
        out[key] = base;
      });
      roleKeys.forEach((key) => {
        if (leftover > 0) {
          out[key] += 1;
          leftover -= 1;
        }
      });
      return out;
    }

    roleKeys.forEach((key) => {
      const exact = ((exactShares[key] || 0) / total) * 100;
      out[key] = Math.floor(exact);
      remainders.push({ key, remainder: exact - Math.floor(exact) });
    });

    let leftover = 100 - sum(roleKeys.map((key) => out[key]));

    remainders.sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return tieOrder.indexOf(a.key) - tieOrder.indexOf(b.key);
    });

    for (let i = 0; i < remainders.length && leftover > 0; i += 1) {
      out[remainders[i].key] += 1;
      leftover -= 1;
    }

    return out;
  }

  // ─── Talent Tree (Brief 4.1, 4.2, 4.3) ────────────────────────────────────

  /**
   * @param {Record<string, number>} answers questionId -> 1..5
   * @param {any} config talent.json merged with its scoring block
   */
  function scoreTalent(answers, config) {
    const scale = config.scale;
    const scoring = config.scoring || {};
    const rawMin = scoring.rawMin !== undefined ? scoring.rawMin : 3;
    const pctRange = scoring.pctRange !== undefined ? scoring.pctRange : 12;
    const spreadThreshold = scoring.balancedProfileSpread !== undefined ? scoring.balancedProfileSpread : 1;

    const categories = config.categories.map((category) => category.key);
    const fixedOrder = config.fixedOrder || categories;

    const byCategory = {};
    categories.forEach((category) => {
      byCategory[category] = [];
    });

    config.questions.forEach((question) => {
      if (!byCategory[question.category]) return;
      byCategory[question.category].push(clampInt(answers[question.id], scale.min, scale.max));
    });

    const raw = {};
    const pct = {};
    categories.forEach((category) => {
      raw[category] = sum(byCategory[category]);
      pct[category] = Math.round(((raw[category] - rawMin) / pctRange) * 100);
    });

    const ranked = rankCategories(raw, byCategory, fixedOrder);

    const primary = ranked[0];
    const secondary = ranked[1];
    const coDominant = raw[ranked[0]] === raw[ranked[1]];

    const rawValues = categories.map((category) => raw[category]);
    const balancedProfile = Math.max.apply(null, rawValues) - Math.min.apply(null, rawValues) <= spreadThreshold;

    const archetype = findArchetype(config, primary, secondary);

    return {
      raw,
      pct,
      ranked,
      primary,
      secondary,
      coDominant,
      balancedProfile,
      archetypeKey: archetype ? archetype.key : null,
      archetype: archetype || null
    };
  }

  /**
   * Brief 4.2 tie rules, in order:
   *   1. higher raw score
   *   2. tie-break 1: the higher single-item answer within the category
   *   3. tie-break 2: the greater number of "5 - Strongly Agree" answers
   *   4. tie-break 3: fixed order Organiser, Analyst, Communicator, Creative (configurable)
   */
  function rankCategories(raw, perCategoryAnswers, fixedOrder) {
    return fixedOrder.slice().sort((a, b) => {
      if (raw[b] !== raw[a]) return raw[b] - raw[a];

      const aValues = perCategoryAnswers[a] || [];
      const bValues = perCategoryAnswers[b] || [];

      const aMax = aValues.length ? Math.max.apply(null, aValues) : 0;
      const bMax = bValues.length ? Math.max.apply(null, bValues) : 0;
      if (bMax !== aMax) return bMax - aMax;

      const aFives = aValues.filter((value) => value === 5).length;
      const bFives = bValues.filter((value) => value === 5).length;
      if (bFives !== aFives) return bFives - aFives;

      return fixedOrder.indexOf(a) - fixedOrder.indexOf(b);
    });
  }

  /**
   * Brief 4.3: mapping is by unordered pair (dominant + secondary in either order),
   * so both orders resolve to the same archetype.
   */
  function findArchetype(config, primary, secondary) {
    const wanted = [primary, secondary].slice().sort().join('|');
    return (
      config.archetypes.find((archetype) => archetype.pair.slice().sort().join('|') === wanted) || null
    );
  }

  // ─── Ikigai signal (Brief 14 Step C) ──────────────────────────────────────

  /**
   * @param {Array<{screenId?: string, key: string}>} picks stable option keys only
   * @param {any} scoring scoring.json
   */
  function ikigaiRoleSignal(picks, scoring) {
    const tagMap = scoring.ikigaiRoleTags || {};

    const hits = { commander: 0, general: 0, chancellor: 0 };
    let neutralPicks = 0;

    (picks || []).forEach((pick) => {
      const role = tagMap[pick.key];
      if (role && hits[role] !== undefined) hits[role] += 1;
      else neutralPicks += 1;
    });

    const totalHits = sum(ROLE_KEYS.map((role) => hits[role]));
    const neutral = totalHits === 0;

    // Full precision; display rounding happens in the UI, never in the blend.
    const pct = {};
    ROLE_KEYS.forEach((role) => {
      pct[role] = neutral ? 100 / 3 : (hits[role] / totalHits) * 100;
    });

    return { hits, totalHits, pct, neutral, neutralPicks };
  }

  // ─── Iron Triangle (Brief 14 Steps A-D) ───────────────────────────────────

  /**
   * Steps A–D are exposed individually for testing, plus one convenience entry point.
   *
   * @param {string[]} scenarioRoles one role key per scenario, in scenario order
   * @param {Record<string, number>} talentPct from scoreTalent().pct
   * @param {Array<{key: string}>} ikigaiPicks
   * @param {any} scoring scoring.json
   */
  function computeRoleResult(scenarioRoles, talentPct, ikigaiPicks, scoring) {
    const weights = scoring.weights;
    const affinityMatrix = scoring.affinity;
    const scenarioCount = scoring.scenarioCount !== undefined ? scoring.scenarioCount : 6;
    const pointsPerPick = scoring.pointsPerScenario !== undefined ? scoring.pointsPerScenario : 2;

    // Step A — scenario points: points[role] += 2 per scenario where the role was picked.
    const scenarioPoints = { commander: 0, general: 0, chancellor: 0 };
    (scenarioRoles || []).forEach((role) => {
      if (scenarioPoints[role] !== undefined) scenarioPoints[role] += pointsPerPick;
    });
    const scenarioTotal = pointsPerPick * scenarioCount;

    const scenarioPct = {};
    ROLE_KEYS.forEach((role) => {
      scenarioPct[role] = scenarioTotal > 0 ? (scenarioPoints[role] / scenarioTotal) * 100 : 0;
    });

    // Step B — talent affinity: Σ_talent(AFFINITY[role][talent] × talentPct[talent])  // 0-100
    const affinity = {};
    ROLE_KEYS.forEach((role) => {
      const row = affinityMatrix[role] || {};
      let value = 0;
      Object.keys(row).forEach((category) => {
        value += row[category] * ((talentPct && talentPct[category]) || 0);
      });
      affinity[role] = value;
    });

    // Step C — Ikigai role signal.
    const ikigai = ikigaiRoleSignal(ikigaiPicks, scoring);

    // Step D — blend.
    const blended = {};
    ROLE_KEYS.forEach((role) => {
      blended[role] =
        weights.scenario * scenarioPoints[role] / scenarioTotal * 100 +
        weights.talent * affinity[role] +
        weights.ikigai * ikigai.pct[role];
    });

    const ranked = ROLE_KEYS.slice().sort((a,b) => blended[b]-blended[a] || scenarioPoints[b]-scenarioPoints[a] || ROLE_KEYS.indexOf(a)-ROLE_KEYS.indexOf(b));
    const shares = largestRemainderShares(blended, ROLE_KEYS, ranked);

    // Ordering uses exact blended values; pattern thresholds use rounded shares. A tie in the
    // displayed rounded shares still resolves deterministically (Section 17 case A:
    // displayed "Cm 21 / Ge 21" but gap must be Commander, not General).
    const classification = classifyTriangle(blended, scenarioPoints, shares, scoring);

    return {
      scenarioPoints,
      scenarioPct,
      affinity,
      ikigai,
      blended,
      shares,
      pattern: classification.pattern,
      primary: classification.primary,
      supporting: classification.supporting,
      gap: classification.gap,
      ordered: classification.ordered,
      spread: classification.spread,
      dualPair: classification.dualPair,
      dualLabelKey: classification.dualLabelKey
    };
  }

  /**
   * Brief 14 Step D classification + Brief 6.4 Step 2:
   *   balanced — max share − min share <= 6
   *   dual     — primary − supporting <= 5   (ordered most-share first)
   *   single   — otherwise
   * Ordering comparator: exact blended desc, then scenario points desc, then fixed order.
   * `gap` is the lowest role under that same comparator.
   */
  function classifyTriangle(blended, scenarioPoints, shares, scoring) {
    const dualThreshold = scoring.dualThreshold !== undefined ? scoring.dualThreshold : 5;
    const balancedThreshold = scoring.balancedThreshold !== undefined ? scoring.balancedThreshold : 6;

    const ordered = ROLE_KEYS.slice().sort((a, b) => {
      if (blended[b] !== blended[a]) return blended[b] - blended[a];
      if ((scenarioPoints[b] || 0) !== (scenarioPoints[a] || 0)) {
        return (scenarioPoints[b] || 0) - (scenarioPoints[a] || 0);
      }
      return ROLE_KEYS.indexOf(a) - ROLE_KEYS.indexOf(b);
    });

    const spread = shares[ordered[0]] - shares[ordered[2]];

    const balanced = spread <= balancedThreshold;
    const topTwoGap = shares[ordered[0]] - shares[ordered[1]];
    const dual = !balanced && topTwoGap <= dualThreshold;

    let pattern = 'single';
    if (balanced) pattern = 'balanced';
    else if (dual) pattern = 'dual';

    const primary = ordered[0];
    const supporting = ordered[1];
    const gap = ordered[ordered.length - 1];

    // Keyed in canonical ROLE_KEYS order, not lexicographically: iron-triangle.json's
    // patterns.dual uses 'commander_chancellor' / 'general_chancellor', so a plain
    // sort would emit 'chancellor_commander' and the dual badge would silently not render.
    const dualPair = dual
      ? [primary, supporting]
          .slice()
          .sort((a, b) => ROLE_KEYS.indexOf(a) - ROLE_KEYS.indexOf(b))
          .join('_')
      : null;

    return { ordered, spread, pattern, primary, supporting, gap, dualPair, dualLabelKey: dualPair };
  }

  /**
   * Display helper: percentage labels for the three vertices, rounded for the UI.
   */
  function shareLabels(shares) {
    const labels = {};
    ROLE_KEYS.forEach((role) => {
      labels[role] = shares[role];
    });
    return labels;
  }

  return Object.freeze({
    ROLE_KEYS,
    scoreTalent,
    rankCategories,
    findArchetype,
    ikigaiRoleSignal,
    computeRoleResult,
    classifyTriangle,
    largestRemainderShares,
    shareLabels
  });
});
