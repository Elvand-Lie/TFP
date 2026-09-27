// @ts-check
/**
 * True Path — report model.
 *
 * LOGIC ONLY, no DOM. This module does two things:
 *
 *  1. `buildResultRecord`  — assembles the Section 13 result schema (the auditable record
 *     that is persisted server-side and posted to the CRM webhook).
 *  2. `buildReportModel`   — turns that record plus config into the three-page report as a
 *     neutral block structure, so the online view, the printable view and the server-side
 *     PDF endpoint all render the SAME content from the SAME source.
 *
 * Brief 15 / 20.3: every user-facing string comes from config, and the record stores STABLE
 * KEYS (category, role, title, alignment-message keys), never display copy.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).TruePathReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = '2.1';

  /** Brief 13: resultId looks like "tp_8f3k2...". */
  function makeResultId() {
    let suffix = '';
    try {
      const cryptoObj = /** @type {any} */ (globalThis).crypto;
      if (cryptoObj && cryptoObj.getRandomValues) {
        const bytes = new Uint8Array(8);
        cryptoObj.getRandomValues(bytes);
        suffix = Array.from(bytes)
          .map((byte) => byte.toString(36).padStart(2, '0'))
          .join('')
          .slice(0, 10);
      }
    } catch (error) {
      /* fall through to Math.random */
    }
    if (!suffix) {
      suffix = Math.random().toString(36).slice(2, 12);
    }
    return 'tp_' + suffix;
  }

  /** Device class for attribution (Brief 13 `attribution.device`). */
  function deviceClass(width) {
    const w = typeof width === 'number' ? width : 0;
    if (w && w < 640) return 'mobile';
    if (w && w < 1024) return 'tablet';
    return 'desktop';
  }

  /**
   * The Ikigai picks a screen contributed, as stable option keys.
   *
   * @param {Array<any>} picks normalised picks ({ screenId, key, fromSuggestion })
   * @param {string} screenId
   */
  function keysForScreen(picks, screenId) {
    return (picks || []).filter((pick) => pick.screenId === screenId).map((pick) => pick.key);
  }

  /**
   * Brief 7.2 alignment message KEYS (not copy) for the §13 record.
   */
  function alignmentKeys(alignment) {
    const keys = [];
    if (alignment && alignment.talent) {
      if (alignment.talent.kind === 'aligned') keys.push('talent_capability_aligned');
      if (alignment.talent.kind === 'divergent') keys.push('talent_capability_divergent');
    }
    if (alignment && alignment.economic) {
      if (alignment.economic.kind === 'aligned') keys.push('economic_role_aligned');
      if (alignment.economic.kind === 'gap') keys.push('economic_gap_role');
    }
    return keys;
  }

  /**
   * Build the Section 13 result record.
   *
   * @param {object} input
   * @param {any} input.talent scoring.scoreTalent output
   * @param {any} input.triangle scoring.computeRoleResult output
   * @param {any} input.resolved trupath.buildTruePathResult output
   * @param {Array<any>} input.picks normalised Ikigai picks
   * @param {Array<any>} input.suggestedKeys every option key that was ever highlighted
   * @param {any} input.talentAnswers raw answers keyed by question id
   * @param {Array<any>} input.scenarios iron-triangle scenarios (for answer keys)
   * @param {any} input.scenarioAnswers role key per scenario id
   * @param {any} input.configs { ikigai, scoring, truthPath }
   * @param {object} [input.meta] { resultId, createdAt, locale, attribution, lead }
   */
  function buildResultRecord(input) {
    const { talent, triangle, resolved, picks } = input;
    const { ikigai: ikigaiConfig, scoring } = input.configs;
    const meta = input.meta || {};

    const ikigai = {
      energises: [],
      goodAt: [],
      economicValue: [],
      impact: [],
      suggested: (input.suggestedKeys || []).slice(),
      selectedFromSuggestions: (picks || []).filter((pick) => pick.fromSuggestion).length
    };

    ikigaiConfig.screens.forEach((screen) => {
      const keys = keysForScreen(picks, screen.id);
      if (screen.field && Object.prototype.hasOwnProperty.call(ikigai, screen.field)) {
        ikigai[screen.field] = keys;
      }
    });

    const scenarioAnswers = input.scenarioAnswers || {};
    const answers = {};
    (input.scenarios || []).forEach((scenario) => {
      answers[scenario.id] = scenarioAnswers[scenario.id] || '';
    });

    const pattern = resolved.pattern || { kind: 'single', label: null };

    return {
      schemaVersion: SCHEMA_VERSION,
      resultId: meta.resultId || makeResultId(),
      createdAt: meta.createdAt || new Date().toISOString(),
      locale: meta.locale || 'en',
      talent: {
        answers: Object.assign({}, input.talentAnswers || {}),
        raw: Object.assign({}, talent.raw),
        pct: Object.assign({}, talent.pct),
        dominant: talent.primary,
        secondary: talent.secondary,
        coDominant: Boolean(talent.coDominant),
        balancedProfile: Boolean(talent.balancedProfile),
        archetypeKey: talent.archetypeKey,
        archetypeName: resolved.archetype ? resolved.archetype.name : null
      },
      ikigai,
      ironTriangle: {
        answers,
        points: Object.assign({}, triangle.scenarioPoints),
        ikigaiHits: Object.assign({}, triangle.ikigai.hits),
        share: Object.assign({}, triangle.shares),
        primary: triangle.primary,
        supporting: triangle.supporting,
        gap: triangle.gap,
        pattern: triangle.pattern,
        dualLabel: pattern.kind === 'dual' ? pattern.label : null,
        weights: {
          scenario: scoring.weights.scenario,
          talent: scoring.weights.talent,
          ikigai: scoring.weights.ikigai,
          affinityMatrixVersion: scoring.affinityMatrixVersion,
          ikigaiTagVersion: scoring.ikigaiTagVersion
        }
      },
      truePath: {
        titleKey: resolved.title ? resolved.title.key : null,
        title: resolved.title ? resolved.title.title : null,
        alignment: alignmentKeys(resolved.alignment)
      },
      lead: Object.assign(
        { firstName: null, email: null, reportConsent: false, marketingConsent: false },
        meta.lead || {}
      ),
      attribution: Object.assign(
        { utm_source: null, utm_campaign: null, device: 'desktop' },
        meta.attribution || {}
      ),
      ancientWisdom: null
    };
  }

  // ─── three-page report model (Brief 8) ─────────────────────────────────────

  /**
   * The three-page report as neutral blocks. Every `text` here already comes from config;
   * nothing is invented in the UI layer.
   *
   * @param {any} record Section 13 record
   * @param {any} configs { talent, ikigai, ironTriangle, truthPath, scoring, cta }
   */
  function buildReportModel(record, configs) {
    const talentConfig = configs.talent;
    const ikigaiConfig = configs.ikigai;
    const iron = configs.ironTriangle;
    const truthPath = configs.truthPath;
    const cta = configs.cta;

    const labels = truthPath.resultBlocks.labels;
    const archetype = talentConfig.archetypes.find(
      (entry) => entry.key === record.talent.archetypeKey
    );
    const primaryRole = iron.roles.find((entry) => entry.key === record.ironTriangle.primary);
    const gapRole = iron.roles.find((entry) => entry.key === record.ironTriangle.gap);
    const title = truthPath.titles.find((entry) => entry.key === record.truePath.titleKey);
    const gapInsight = iron.gapInsights[record.ironTriangle.gap];

    // Natural strengths: the core strengths of the two branches behind the archetype.
    const naturalStrengths = (archetype ? archetype.pair : record.talent.pct && [])
      .map((key) => talentConfig.categories.find((entry) => entry.key === key))
      .filter(Boolean)
      .map((category) => ({ key: category.key, name: category.name, line: category.coreStrengths }));

    // Three observations: the three strongest branches (Brief 8, page 1).
    const observations = record.talent.dominant && talentConfig.observations
      ? rankedCategories(record, talentConfig)
          .slice(0, 3)
          .map((key) => ({ key, text: talentConfig.observations[key] }))
          .filter((entry) => entry.text)
      : [];

    const ikigaiRows = ikigaiConfig.screens.map((screen) => ({
      screenId: screen.id,
      field: screen.field,
      label: screen.rowLabel,
      items: optionsFor(ikigaiConfig, screen.id, record.ikigai[screen.field] || [])
    }));

    const shareRows = iron.roles.map((role) => ({
      key: role.key,
      name: role.name,
      chinese: role.chinese,
      glyph: role.glyph,
      share: record.ironTriangle.share[role.key]
    }));

    const patternLabel = patternLabelFor(record, iron, truthPath);

    const page1 = {
      n: 1,
      key: 'talent',
      heading: cta.report.pages[0].title,
      blocks: [
        { kind: 'talent-tree', pct: record.talent.pct, categories: talentConfig.categories },
        {
          kind: 'scores',
          label: labels.talentPattern,
          rows: talentConfig.categories.map((category) => ({
            key: category.key,
            name: category.name,
            value: record.talent.pct[category.key]
          }))
        },
        {
          kind: 'pair',
          label: patternLabel,
          dominant: categoryName(talentConfig, record.talent.dominant),
          secondary: categoryName(talentConfig, record.talent.secondary),
          coDominant: record.talent.coDominant,
          balancedProfile: record.talent.balancedProfile,
          archetype: archetype ? { name: archetype.name, essence: archetype.essence } : null
        },
        {
          kind: 'list-block',
          label: 'Natural Strengths',
          items: naturalStrengths.map((entry) => entry.name + ' — ' + entry.line)
        },
        {
          kind: 'list-block',
          label: 'Observations',
          items: observations.map((entry) => entry.text)
        }
      ]
    };

    const page2 = {
      n: 2,
      key: 'direction',
      heading: cta.report.pages[1].title,
      blocks: [
        {
          kind: 'selections',
          label: labels.purpose,
          rows: ikigaiRows.map((row) => ({
            label: row.label,
            value: row.items.map((item) => item.label).join(', ') || '—'
          }))
        },
        {
          kind: 'text',
          label: labels.economicDirection,
          text: synthesisLine(ikigaiConfig, record)
        },
        {
          kind: 'text',
          label: labels.valueCreation,
          text: valueCreationSentence(truthPath, record)
        },
        {
          kind: 'text',
          label: labels.capability,
          text: alignmentMessage(truthPath, record, 'talent') || '—'
        }
      ]
    };

    const page3 = {
      n: 3,
      key: 'role',
      heading: cta.report.pages[2].title,
      blocks: [
        { kind: 'iron-triangle', shares: record.ironTriangle.share, roles: iron.roles },
        {
          kind: 'scores',
          label: iron.reveal.headline,
          rows: shareRows.map((row) => ({
            key: row.key,
            name: row.name + ' ' + row.chinese,
            value: row.share
          }))
        },
        primaryRole
          ? {
              kind: 'role-card',
              label: 'Your Primary Role',
              name: primaryRole.name,
              chinese: primaryRole.chinese,
              glyph: primaryRole.glyph,
              subtitle: primaryRole.subtitle,
              essence: primaryRole.essence,
              oneLine: primaryRole.oneLine,
              naturalStrengths: primaryRole.naturalStrengths,
              contribution: primaryRole.contribution,
              watchOut: primaryRole.watchOut
            }
          : null,
        gapRole
          ? {
              kind: 'text',
              label: iron.reveal.gapHeadline,
              text:
                gapRole.name +
                ' ' +
                gapRole.chinese +
                ' — ' +
                iron.reveal.gapFraming +
                '. ' +
                (gapInsight ? gapInsight.classicImbalance + '. ' + gapInsight.insight : '')
            }
          : null,
        primaryRole ? { kind: 'text', label: iron.reveal.thriveHeadline, text: primaryRole.thrive } : null,
        primaryRole ? { kind: 'text', label: 'Growth Edge', text: primaryRole.growthEdge } : null,
        title
          ? {
              kind: 'title',
              label: truthPath.resultBlocks.headline,
              title: title.title,
              essence: title.essence,
              subtitle: truthPath.displayFormat.subtitleTemplate
                .replace('{archetypeName}', archetype ? archetype.name : '')
                .replace('{roleName}', primaryRole ? primaryRole.name : '')
                .replace('{chinese}', primaryRole ? primaryRole.chinese : '')
            }
          : null,
        {
          kind: 'list-block',
          label: labels.alignment,
          items: [
            alignmentMessage(truthPath, record, 'talent'),
            alignmentMessage(truthPath, record, 'economic')
          ].filter(Boolean)
        },
        {
          kind: 'list-block',
          label: labels.reflection,
          items: (truthPath.reflectionPrompts || []).map((prompt) =>
            typeof prompt === 'string' ? prompt : prompt.text
          )
        },
        {
          kind: 'invite',
          headline: cta.result.consultHeadline,
          text: cta.result.consultSubcopy,
          ctaLabel: cta.result.consultCtaLabel,
          ctaHref: cta.result.consultHref
        }
      ].filter(Boolean)
    };

    return {
      schemaVersion: record.schemaVersion,
      resultId: record.resultId,
      createdAt: record.createdAt,
      headline: cta.report.headline,
      pages: [page1, page2, page3],
      disclaimer: truthPath.disclaimer,
      brand: cta.footer.brand,
      downloadLabel: cta.report.downloadLabel,
      email: {
        headline: cta.report.emailHeadline,
        fieldName: cta.report.emailFieldName,
        fieldEmail: cta.report.emailFieldEmail,
        sendLabel: cta.report.emailSendLabel,
        skipLabel: cta.report.emailSkipLabel,
        marketingLabel: cta.report.marketingConsentLabel,
        consentNote: cta.report.consentNote,
        privacyLabel: cta.report.privacyLabel,
        privacyHref: cta.report.privacyHref,
        sentMessage: cta.report.sentMessage
      }
    };
  }

  function categoryName(talentConfig, key) {
    const category = talentConfig.categories.find((entry) => entry.key === key);
    return category ? category.name : '';
  }

  /**
   * Rank branches for the observation list. When the record carries percentiles we use them;
   * otherwise we fall back to the fixed config order so the report never renders blank.
   */
  function rankedCategories(record, talentConfig) {
    const pct = record.talent.pct || {};
    return talentConfig.categories
      .map((category) => category.key)
      .slice()
      .sort((a, b) => (pct[b] || 0) - (pct[a] || 0));
  }

  function optionsFor(ikigaiConfig, screenId, keys) {
    const screen = ikigaiConfig.screens.find((entry) => entry.id === screenId);
    if (!screen) return [];
    return (keys || [])
      .map((key) => screen.options.find((option) => option.key === key))
      .filter(Boolean);
  }

  /** Brief 7.3: state the selections back in the visitor's own terms. */
  function synthesisLine(ikigaiConfig, record) {
    const template = ikigaiConfig.snapshot && ikigaiConfig.snapshot.synthesisTemplate;
    if (!template) return '';
    const join = (screenId, field) =>
      optionsFor(ikigaiConfig, screenId, record.ikigai[field] || [])
        .map((option) => String(option.label).toLowerCase())
        .join(' and ');
    return template
      .replace('{energises}', join('I-1', 'energises'))
      .replace('{impact}', join('I-4', 'impact'))
      .replace('{economicValue}', join('I-3', 'economicValue'));
  }

  /** Brief 7.4: value creation sentence, rebuilt from stored keys. */
  function valueCreationSentence(truthPath, record) {
    const talentVerb = truthPath.talentVerbs[record.talent.dominant] || '';
    const roleVerb = truthPath.roleVerbs[record.ironTriangle.primary] || '';
    const impactKey = (record.ikigai.impact || [])[0];
    const impactPhrase = impactKey ? impactKey.replace(/_/g, ' ') : '';
    const template = truthPath.valueCreationTemplate;
    if (!impactPhrase) {
      return template
        .replace('{talentVerb}', talentVerb)
        .replace('{roleVerb}', roleVerb)
        .replace(', and {impactPhrase}', '');
    }
    return template
      .replace('{talentVerb}', talentVerb)
      .replace('{roleVerb}', roleVerb)
      .replace('{impactPhrase}', impactPhrase);
  }

  function alignmentMessage(truthPath, record, which) {
    const keys = record.truePath.alignment || [];
    const wanted =
      which === 'talent'
        ? ['talent_capability_aligned', 'talent_capability_divergent']
        : ['economic_role_aligned', 'economic_gap_role'];
    const found = keys.find((key) => wanted.indexOf(key) !== -1);
    return found ? truthPath.alignmentMessages[found] || null : null;
  }

  function patternLabelFor(record, iron, truthPath) {
    const triangle = record.ironTriangle;
    if (triangle.pattern === 'balanced') return iron.patterns.balanced.label;
    if (triangle.pattern === 'dual' && triangle.dualLabel) return triangle.dualLabel;
    // A single-dominant triangle has no special pattern label, and the "Talent Pattern"
    // block above already carries that label — returning it here would print it twice.
    return null;
  }

  return Object.freeze({
    SCHEMA_VERSION,
    makeResultId,
    deviceClass,
    buildResultRecord,
    buildReportModel,
    alignmentKeys
  });
});
