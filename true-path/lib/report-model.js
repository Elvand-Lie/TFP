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
   *
   * Canonical vocabulary first (`*_explore`), as approved in the integration config. Records written
   * before the rename carry `*_divergent` / `*_gap_role`; both are still READ (see `alignmentMessage`)
   * so stored results keep rendering, but nothing new is written with the old names.
   */
  function alignmentKeys(alignment) {
    const keys = [];
    if (alignment && alignment.talent) {
      if (alignment.talent.kind === 'aligned') keys.push('talent_capability_aligned');
      if (alignment.talent.kind === 'divergent') keys.push('talent_capability_explore');
    }
    if (alignment && alignment.economic) {
      if (alignment.economic.kind === 'aligned') keys.push('economic_role_aligned');
      if (alignment.economic.kind === 'gap') keys.push('economic_role_explore');
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
    const archetype = findArchetype(talentConfig, record.talent.archetypeKey);
    const primaryRole = iron.roles.find((entry) => entry.key === record.ironTriangle.primary);
    const gapRole = iron.roles.find((entry) => entry.key === record.ironTriangle.gap);
    const title = truthPath.titles.find((entry) => entry.key === record.truePath.titleKey);
    const gapInsight = iron.gapInsights[record.ironTriangle.gap];

    // Natural strengths: canonical prints the DOMINANT then the SECONDARY branch's strength list
    // (not the archetype pair, which is ordered by the config's fixed order and can differ).
    const strengthKeys = [record.talent.dominant, record.talent.secondary]
      .filter(Boolean)
      .filter((key, index, keys) => keys.indexOf(key) === index);

    // Canonical page 1 leads with the read of the tree, then three derived observations. These are
    // RESPONSES to this visitor's scores — never the static per-category blurbs the old page printed,
    // which said the same thing to every visitor regardless of what they scored.
    const strengthSentence = strengthKeys
      .map((key) => categoryStrengths(talentConfig, key))
      .filter(Boolean)
      .join('; ');
    const observations = observationalLines(record.talent, talentConfig).map((text, index) => ({
      key: 'observation-' + (index + 1),
      text
    }));

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
        {
          kind: 'talent-tree',
          pct: record.talent.pct,
          categories: talentConfig.categories,
          // The canonical highlight rule needs `raw` (the 10-15 integers), because `pct` saturates
          // at 100 and cannot tell a tie from a lone leader.
          raw: record.talent.raw,
          dominant: record.talent.dominant,
          balancedProfile: Boolean(record.talent.balancedProfile)
        },
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
          // Canonical: the archetype heading becomes "Balanced / Emerging Tree" when no branch leads.
          archetypeHeading: record.talent.balancedProfile
            ? (talentConfig.snapshot && talentConfig.snapshot.balancedHeadline) || ''
            : archetype
              ? archetype.name
              : '',
          leadLine: leadLine(record.talent, talentConfig),
          // Canonical prints the archetype essence only when a single branch leads; for a balanced
          // profile the essence would contradict the lead line above it.
          essence: record.talent.balancedProfile || !archetype ? '' : archetype.essence,
          naturalStrengthsLine: strengthSentence ? 'Natural strengths: ' + strengthSentence + '.' : '',
          archetype: archetype ? { name: archetype.name, essence: archetype.essence } : null
        },
        {
          kind: 'list-block',
          label: labels.observations || 'Observations',
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
          label: labels.capability,
          text: capabilityLine(truthPath, ikigaiConfig, record)
        },
        {
          kind: 'text',
          label: labels.valueCreation,
          text: valueCreationSentence(truthPath, ikigaiConfig, record, primaryRole)
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
              subtitle: asText(primaryRole.subtitle),
              essence: asText(primaryRole.essence),
              oneLine: asText(primaryRole.oneLine),
              naturalStrengths: (primaryRole.naturalStrengths || []).map(asText).filter(Boolean),
              contribution: asText(primaryRole.contribution),
              watchOut: asText(primaryRole.watchOut),
              // Canonical boxes the role copy as "How you contribute / Natural strengths / Watch-out /
              // Natural allies". Allies are part of the role's read, so they belong here rather than
              // being dropped from the report.
              allies: primaryRole.allies
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
                gapInsightText(gapInsight) +
                gapLeanNote(record, iron)
            }
          : null,
        primaryRole
          ? { kind: 'text', label: iron.reveal.thriveHeadline, text: asText(primaryRole.thrive) }
          : null,
        primaryRole
          ? { kind: 'text', label: 'Growth Edge', text: asText(primaryRole.growthEdge) }
          : null,
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
   * Resolve an archetype for a stored key.
   *
   * Records written before the canonical vocabulary flip carry the pair in the old order
   * ("creative_analyst"), while the canonical config lists "analyst_creative". Matching on the PAIR,
   * order-insensitively, keeps every stored record readable without rewriting history, and still
   * resolves canonical keys exactly.
   */
  function findArchetype(talentConfig, key) {
    const list = talentConfig.archetypes || [];
    const exact = list.find((entry) => entry.key === key);
    if (exact) return exact;
    const wanted = String(key || '').split('_').filter(Boolean).sort().join('_');
    if (!wanted) return null;
    return list.find((entry) => (entry.pair || []).slice().sort().join('_') === wanted) || null;
  }
  function categoryStrengths(talentConfig, key) {
    const category = talentConfig.categories.find((entry) => entry.key === key);
    return category && category.coreStrengths ? category.coreStrengths : '';
  }

  /**
   * Canonical role/copy fields are authored as EITHER a string or a list of sentences, and a few
   * carry a list of short phrases. A renderer that prints the raw value shows an array (or a bare
   * `a,b` blob) instead of readable text, so every user-facing field is normalised here.
   *
   * List items are joined with a space: the sentences in this config already carry their own
   * terminal punctuation, and a comma would both read badly and collide with the punctuation the
   * surrounding copy supplies.
   *
   * @param {any} value string | string[] | null
   * @returns {string}
   */
  function asText(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
      return value
        .map((item) => asText(item))
        .filter(Boolean)
        .join(' ')
        .trim();
    }
    return String(value).trim();
  }

  /** Canonical `jn()`: "A", "A and B", "A, B and C". */
  function joinNames(names) {
    const list = (names || []).filter(Boolean);
    if (list.length > 1) return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
    return list[0] || '—';
  }

  /**
   * Canonical `leadLine(t)` — the one sentence that reads the tree back to the visitor.
   *
   * Three cases, in canonical precedence order: a balanced profile (no single branch leads), a tie
   * among the leaders, and a single leader (with the runner-up described as close or trailing).
   * A balanced profile must NEVER be told that one branch leads it.
   */
  function leadLine(talent, talentConfig) {
    const name = (key) => categoryName(talentConfig, key);
    const tied = talentConfig.categories
      .map((category) => category.key)
      .filter((key) => talent.raw[key] === talent.raw[talent.dominant]);
    const gap = talent.raw[talent.dominant] - talent.raw[talent.secondary];

    if (talent.balancedProfile) {
      return (
        'Your four branches are close in strength, so no single Talent leads. Your title draws on ' +
        name(talent.dominant) +
        ' and ' +
        name(talent.secondary) +
        '.'
      );
    }
    if (tied.length > 1) {
      return (
        'Your ' +
        joinNames(tied.map(name)) +
        ' branches are equally strong.' +
        (tied.length > 2
          ? ' Your title draws on ' + name(talent.dominant) + ' and ' + name(talent.secondary) + '.'
          : '')
      );
    }
    return (
      name(talent.dominant) +
      ' leads' +
      (gap <= 2
        ? ', with ' + name(talent.secondary) + ' close behind'
        : ', followed by ' + name(talent.secondary)) +
      '.'
    );
  }

  /**
   * Canonical `obs(t)` — three observations DERIVED from this visitor's scores.
   *
   * The third line is fixed by definition (the four branches are independent, so they never total
   * 100%); the first two restate the strongest and quietest readings of the tree, and switch to the
   * balanced wording when no branch leads.
   */
  function observationalLines(talent, talentConfig) {
    const name = (key) => categoryName(talentConfig, key);
    const keys = talentConfig.categories.map((category) => category.key);
    const lowest = Math.min.apply(
      null,
      keys.map((key) => talent.raw[key])
    );
    const quiet = keys.filter((key) => talent.raw[key] === lowest);

    return [
      talent.balancedProfile
        ? 'Your four branches are within a point of each other, so no single style dominates yet.'
        : talent.coDominant
          ? leadLine(talent, talentConfig)
          : 'Your strongest branch is ' +
            name(talent.dominant) +
            ' (' +
            talent.pct[talent.dominant] +
            '%).',
      talent.balancedProfile
        ? 'No branch is notably quieter than the rest, which gives you range.'
        : 'Your ' +
          joinNames(quiet.map(name)) +
          ' ' +
          (quiet.length > 1 ? 'branches are' : 'branch is') +
          ' your quietest, which is a reading, not a flaw.',
      'Scores are independent: you can be strong on every branch.'
    ];
  }

  /** Canonical `list(k(1))` — the capability box restates the chosen strengths in the visitor's words. */
  function capabilityLine(truthPath, ikigaiConfig, record) {
    const prefix =
      (truthPath.resultBlocks && truthPath.resultBlocks.strengthsInPrefix) ||
      'You see your strengths in';
    const chosen = optionsFor(ikigaiConfig, 'I-2', record.ikigai.goodAt || []);
    const message = alignmentMessage(truthPath, record, 'talent');
    const seen = chosen.length
      ? prefix + ' ' + joinNames(chosen.map((option) => String(option.label).toLowerCase())) + '.'
      : prefix + ' —';
    return message ? seen + ' ' + message : seen;
  }

  /**
   * Legacy option keys that resolve to a canonical one, READ-side only.
   *
   * Records stored before the vocabulary flip carry `helping_others_transform`, while the canonical
   * config lists `helping_transform`. Both name the same Ikigai option, so a stored record keeps
   * rendering its selection instead of a dash. Only pairs that are demonstrably the same option are
   * listed: nothing here changes scoring, and nothing new is ever written with a legacy key
   * (`buildResultRecord` stores whatever key the screen produced).
   */
  const LEGACY_OPTION_ALIASES = { helping_others_transform: 'helping_transform' };

  function optionsFor(ikigaiConfig, screenId, keys) {
    const screen = ikigaiConfig.screens.find((entry) => entry.id === screenId);
    if (!screen) return [];
    return (keys || [])
      .map(
        (key) =>
          screen.options.find((option) => option.key === key) ||
          screen.options.find((option) => option.key === LEGACY_OPTION_ALIASES[key])
      )
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
  function valueCreationSentence(truthPath, ikigaiConfig, record, primaryRole) {
    const talentVerb = truthPath.talentVerbs[record.talent.dominant] || '';
    const roleVerb = truthPath.roleVerbs[record.ironTriangle.primary] || '';
    const template = truthPath.valueCreationTemplate;

    // Canonical cites the impact option's REPHRASE ("helping businesses grow"), never its label and
    // never the raw key. The rephrase is optional in config, so fall back to the label and only then
    // to the key — that keeps an older record readable instead of printing a snake_case key on the
    // page. The label is the same words without the sentence form, which still reads correctly.
    const impactKey = (record.ikigai.impact || [])[0];
    const impactOption = impactKey
      ? optionsFor(ikigaiConfig, 'I-4', [impactKey])[0]
      : null;
    const impactPhrase = impactOption
      ? impactOption.rephrase || String(impactOption.label).toLowerCase()
      : impactKey
        ? String(impactKey).replace(/_/g, ' ')
        : '';

    if (!impactPhrase) return template.replace(/\{talentVerb\}/g, talentVerb)
      .replace(/\{roleVerb\}/g, roleVerb)
      .replace(/,\s*and \{impactPhrase\}|, and \{impactPhrase\}/g, '')
      .replace(/\{impactPhrase\}/g, '');

    return template
      .replace(/\{talentVerb\}/g, talentVerb)
      .replace(/\{roleVerb\}/g, roleVerb)
      .replace(/\{impactPhrase\}/g, impactPhrase);
  }

  /**
   * The gap insight reads as one sentence: the canonical GAP copy, alone.
   *
   * The approved report's user-facing gap sentence is GAP[role] and nothing else. The adapter keeps
   * `classicImbalance` as historical metadata for older records, so it must never be prefixed onto a
   * canonical report - that would put copy the brief retired back in front of visitors.
   */
  function gapInsightText(gapInsight) {
    if (!gapInsight) return '';
    // Canonical GAP copy ONLY. `classicImbalance` is legacy metadata (the reveal contract asserts it
    // still exists) and is reached here solely as a fallback for a record whose config predates GAP,
    // so the retired classic imbalance framing can never be prefixed onto a canonical report.
    const canonical = String(gapInsight.insight || '').trim();
    if (canonical) return canonical;
    return String(gapInsight.classicImbalance || '').trim();
  }

  /** Canonical: a balanced triangle says so, so the gap is not read as a fault. */
  function gapLeanNote(record, iron) {
    if (record.ironTriangle.pattern !== 'balanced') return '';
    const line = (iron.balanced && iron.balanced.line) || '';
    return line ? ' ' + line : '';
  }

  /**
   * Resolve an alignment message. Canonical keys come first; the pre-rename keys are accepted so
   * stored records keep rendering their copy.
   */
  function alignmentMessage(truthPath, record, which) {
    const keys = record.truePath.alignment || [];
    const wanted =
      which === 'talent'
        ? [
            'talent_capability_aligned',
            'talent_capability_explore',
            'talent_capability_divergent'
          ]
        : ['economic_role_aligned', 'economic_role_explore', 'economic_gap_role'];
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
