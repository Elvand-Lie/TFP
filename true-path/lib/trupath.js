// @ts-check
/**
 * True Path — title, content and alignment resolution.
 *
 * LOGIC ONLY, driven entirely by config (Brief 15 / 20.3): six Talent archetypes x three
 * Iron Triangle roles produce the 18 True Path titles, and the alignment check compares
 * what the visitor picked in Ikigai against their computed talent pattern and role.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).TruePathResolve = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function findTitle(truthPathConfig, archetypeKey, roleKey) {
    return (
      truthPathConfig.titles.find(
        (entry) => entry.archetype === archetypeKey && entry.role === roleKey
      ) || null
    );
  }

  function findArchetype(talentConfig, archetypeKey) {
    return talentConfig.archetypes.find((entry) => entry.key === archetypeKey) || null;
  }

  function findRole(ironTriangleConfig, roleKey) {
    return ironTriangleConfig.roles.find((entry) => entry.key === roleKey) || null;
  }

  /**
   * The full three-layer synthesis shown on the True Path page (Brief 7).
   *
   * @param {object} input
   * @param {any} input.talent result of scoring.scoreTalent
   * @param {any} input.triangle result of scoring.computeRoleResult
   * @param {Array<any>} input.picks normalised Ikigai picks (with screenId + key)
   * @param {any} input.configs { talent, ikigai, ironTriangle, truthPath }
   */
  function buildTruePathResult(input) {
    const { talent, triangle, picks } = input;
    const { talent: talentConfig, ikigai: ikigaiConfig, ironTriangle, truthPath } = input.configs;

    const archetype = findArchetype(talentConfig, talent.archetypeKey);
    const primaryRole = findRole(ironTriangle, triangle.primary);
    const gapRole = findRole(ironTriangle, triangle.gap);
    const title = findTitle(truthPath, talent.archetypeKey, triangle.primary);

    const pattern = buildPatternLabel(triangle, ironTriangle, truthPath);

    return {
      archetype,
      primaryRole,
      gapRole,
      title,
      pattern,
      talent,
      triangle,
      direction: buildDirectionSection(picks, ikigaiConfig, truthPath),
      valueCreation: buildValueCreation(talent, triangle, picks, truthPath),
      alignment: buildAlignmentChecks(talent, triangle, picks, ikigaiConfig, truthPath),
      reflectionPrompts: truthPath.reflectionPrompts,
      disclaimer: truthPath.disclaimer
    };
  }

  /**
   * Brief 6.8: dual and balanced patterns get their own label and line.
   */
  function buildPatternLabel(triangle, ironTriangle, truthPath) {
    if (triangle.pattern === 'balanced') {
      return {
        kind: 'balanced',
        label: ironTriangle.patterns.balanced.label,
        line: ironTriangle.patterns.balanced.line,
        tag: truthPath.displayFormat.balancedTag
      };
    }

    if (triangle.pattern === 'dual' && triangle.dualPair) {
      const entry = ironTriangle.patterns.dual[triangle.dualPair];
      if (entry) {
        return {
          kind: 'dual',
          label: entry.label,
          line: entry.line,
          tag: truthPath.displayFormat.dualTagTemplate.replace('{dualLabel}', entry.label)
        };
      }
    }

    return { kind: 'single', label: null, line: null, tag: null };
  }

  /**
   * Brief 7.3: state the Ikigai selections as the visitor's own words.
   */
  function buildDirectionSection(picks, ikigaiConfig, truthPath) {
    const byField = {};
    ikigaiConfig.screens.forEach((screen) => {
      byField[screen.field] = [];
    });

    const labelFor = {};
    ikigaiConfig.screens.forEach((screen) => {
      screen.options.forEach((option) => {
        labelFor[option.key] = option;
      });
    });

    (picks || []).forEach((pick) => {
      const screen = ikigaiConfig.screens.find((entry) => entry.id === pick.screenId);
      const option = labelFor[pick.key];
      if (screen && option) byField[screen.field].push(option);
    });

    return { byField, labels: truthPath.resultBlocks };
  }

  /**
   * Brief 7.4: value creation style = talent verb + role verb + impact phrase.
   */
  function buildValueCreation(talent, triangle, picks, truthPath) {
    const talentVerb = truthPath.talentVerbs[talent.primary] || '';
    const roleVerb = truthPath.roleVerbs[triangle.primary] || '';

    let impactPhrase = '';
    const impactPicks = (picks || []).filter((pick) => pick.screenId === 'I-4');
    if (impactPicks.length) {
      const source = impactPicks[0];
      impactPhrase = source.rephrase || '';
      if (!impactPhrase) {
        // Derive a phrase from the option label when the config supplies no rephrase.
        impactPhrase = String(source.label || '').toLowerCase();
      }
    }

    const template = truthPath.valueCreationTemplate;
    const sentence = impactPhrase
      ? template
          .replace('{talentVerb}', talentVerb)
          .replace('{roleVerb}', roleVerb)
          .replace('{impactPhrase}', impactPhrase)
      : template
          .replace('{talentVerb}', talentVerb)
          .replace('{roleVerb}', roleVerb)
          .replace(', and {impactPhrase}', '');

    return { talentVerb, roleVerb, impactPhrase, sentence };
  }

  /**
   * Brief 7.2 alignment check:
   *   (a) chosen strengths/abilities match the natural talent pattern
   *   (b) the areas chosen for economic value suit the primary role, or sit on the gap role
   */
  function buildAlignmentChecks(talent, triangle, picks, ikigaiConfig, truthPath) {
    const messages = truthPath.alignmentMessages;

    // (a) talent vs ability: compare the talent categories suggested by the visitor's
    //     I-2 "good at" picks against the two leading talent categories.
    const abilityPicks = (picks || []).filter((pick) => pick.screenId === 'I-2');
    const expectedSkills = [talent.primary, talent.secondary].reduce((acc, category) => {
      const list = (ikigaiConfig.talentSkills && ikigaiConfig.talentSkills[category]) || [];
      return acc.concat(list);
    }, []);

    const abilityMatches = abilityPicks.filter((pick) => expectedSkills.indexOf(pick.key) !== -1);
    const talentAligned = abilityPicks.length === 0 ? null : abilityMatches.length > 0;

    // (b) economic value vs role: check the I-3 picks against the primary and gap roles.
    const economicPicks = (picks || []).filter((pick) => pick.screenId === 'I-3');
    const primaryEnvironments =
      (ikigaiConfig.roleEnvironment && ikigaiConfig.roleEnvironment[triangle.primary]) || [];
    const gapEnvironments =
      (ikigaiConfig.roleEnvironment && ikigaiConfig.roleEnvironment[triangle.gap]) || [];

    const hitsPrimary = economicPicks.filter((pick) => primaryEnvironments.indexOf(pick.key) !== -1);
    const hitsGapOnly = economicPicks.filter(
      (pick) => gapEnvironments.indexOf(pick.key) !== -1 && primaryEnvironments.indexOf(pick.key) === -1
    );

    let economicKind = 'neutral';
    let economicMessage = null;
    if (economicPicks.length) {
      if (hitsPrimary.length > 0) {
        economicKind = 'aligned';
        economicMessage = messages.economic_role_aligned;
      } else if (hitsGapOnly.length > 0) {
        economicKind = 'gap';
        economicMessage = messages.economic_gap_role;
      }
    }

    return {
      talent: {
        kind: talentAligned === null ? 'neutral' : talentAligned ? 'aligned' : 'divergent',
        message:
          talentAligned === null
            ? null
            : talentAligned
            ? messages.talent_capability_aligned
            : messages.talent_capability_divergent
      },
      economic: { kind: economicKind, message: economicMessage }
    };
  }

  return Object.freeze({
    findTitle,
    findArchetype,
    findRole,
    buildTruePathResult,
    buildPatternLabel,
    buildDirectionSection,
    buildValueCreation,
    buildAlignmentChecks
  });
});
