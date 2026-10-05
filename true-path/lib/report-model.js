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

  const SCHEMA_VERSION = '2.2';

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

    // v2.2 C1: the visitor's first name travels in the record (`profile.firstName`) and pre-fills
    // the lead. The name is NEVER written to analytics; it only lives in the saved record.
    const firstName = asName(
      (meta.profile && meta.profile.firstName) || (meta.lead && meta.lead.firstName) || ''
    );

    return {
      schemaVersion: SCHEMA_VERSION,
      resultId: meta.resultId || makeResultId(),
      createdAt: meta.createdAt || new Date().toISOString(),
      locale: meta.locale || 'en',
      profile: { firstName: firstName || null },
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
        { firstName: firstName || null, email: null, reportConsent: false, marketingConsent: false },
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
    const name = asName((record.profile && record.profile.firstName) || '');
    const archetype = findArchetype(talentConfig, record.talent.archetypeKey);
    const primaryRole = iron.roles.find((entry) => entry.key === record.ironTriangle.primary);
    const gapRole = iron.roles.find((entry) => entry.key === record.ironTriangle.gap);
    const title = truthPath.titles.find((entry) => entry.key === record.truePath.titleKey);
    const gapInsight = iron.gapInsights[record.ironTriangle.gap];

    // v2.2 C10: one strengths sentence replaces the raw lists.
    const strengthsSentence = naturalStrengthsSentence(truthPath, record, archetype);

    // v2.3 D3: the lowest-branch observation uses the shared strength labels and energy lines.
    const observations = observationalLines(record.talent, talentConfig, configs).map((text, index) => ({
      key: 'observation-' + (index + 1),
      text
    }));

    // v2.2 C4: four full Direction sentences replace the bare selections table.
    const directionSentences = directionSentenceBlocks(truthPath, ikigaiConfig, record, name);

    // v2.2 C4: "Possible areas to explore" — the I-3 sentence forms plus two environments
    // for the primary role.
    const possibleAreas = possibleAreasList(truthPath, ikigaiConfig, record, primaryRole);

    const shareRows = iron.roles.map((role) => ({
      key: role.key,
      name: role.name,
      chinese: role.chinese,
      glyph: role.glyph,
      share: record.ironTriangle.share[role.key]
    }));

    const patternLabel = patternLabelFor(record, iron, truthPath);

    const subtitle = truthPath.displayFormat.subtitleTemplate
      .replace('{archetypeName}', archetype ? archetype.name : '')
      .replace('{roleName}', primaryRole ? primaryRole.name : '')
      .replace('{chinese}', primaryRole ? primaryRole.chinese : '');

    // v2.2 C3: the headline result opens page 1.
    const hero = {
      kind: 'hero',
      preparedFor: name ? 'Prepared for ' + name + ' · ' + reportDate(record.createdAt) : '',
      intro: name ? name + ', your True Path is' : 'Your True Path is',
      title: title ? title.title : '',
      tagline: title ? title.essence : '',
      subtitle
    };

    const page1 = {
      n: 1,
      key: 'talent',
      heading: cta.report.pages[0].title,
      blocks: [
        hero,
        {
          kind: 'talent-tree',
          pct: record.talent.pct,
          categories: talentConfig.categories,
          // The canonical highlight rule needs `raw` (the 10-15 integers), because `pct` saturates
          // at 100 and cannot tell a tie from a lone leader.
          raw: record.talent.raw,
          dominant: record.talent.dominant,
          balancedProfile: Boolean(record.talent.balancedProfile),
          // v2.3 D2: two-line tree labels use the shared strength bands, not percentages.
          strengthLabels: Object.fromEntries(
            talentConfig.categories.map((category) => [
              category.key,
              strengthLabelFn(configs)(record.talent.pct[category.key])
            ])
          )
        },
        {
          kind: 'scores',
          label: labels.talentPattern,
          rows: talentConfig.categories.map((category) => ({
            key: category.key,
            name: category.name,
            value: record.talent.pct[category.key],
            // v2.3 D2: visitor-facing label; `value` stays internal for the bar fill.
            label: strengthLabelFn(configs)(record.talent.pct[category.key])
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
          strengthsSentence,
          // v2.3 D4: the archetype essence as a complete sentence.
          essenceSentence: (function () {
            const essence = (configs.essenceSentences || {})[record.talent.archetypeKey];
            return archetype && essence ? 'As a ' + archetype.name + ', you ' + essence + '.' : '';
          })(),
          archetype: archetype ? { name: archetype.name, essence: archetype.essence } : null
        },
        {
          kind: 'list-block',
          label: labels.observations || 'Observations',
          items: observations.map((entry) => entry.text)
        },
        {
          // v2.2 visual pass: the "What this suggests" box — the lowest-branch reading plus, when
          // every branch is strong, the versatile-profile note.
          kind: 'insight',
          title: (truthPath.pdf && truthPath.pdf.talentInsight && truthPath.pdf.talentInsight.title) || 'What this suggests',
          body: observations
            .filter((entry) => /least dominant|least natural|versatile profile|range/.test(entry.text))
            .map((entry) => entry.text)
            .join(' ')
        }
      ]
    };

    const page2 = {
      n: 2,
      key: 'direction',
      heading: cta.report.pages[1].title,
      blocks: [
        ...directionSentences,
        {
          kind: 'list-block',
          label: 'Possible areas to explore',
          items: possibleAreas
        },
        {
          kind: 'text',
          label: labels.valueCreation,
          text: valueCreationSentence(truthPath, ikigaiConfig, record, primaryRole)
        },
        {
          kind: 'list-block',
          label: labels.alignment,
          items: [
            alignmentMessage(truthPath, record, 'talent'),
            alignmentMessage(truthPath, record, 'economic')
          ].filter(Boolean)
        },
        {
          // v2.2 visual pass: closing framing line for the Direction page.
          kind: 'insight',
          title:
            (truthPath.pdf && truthPath.pdf.directionInsight && truthPath.pdf.directionInsight.title) ||
            'Direction is a field to explore, not a prediction',
          body: (truthPath.pdf && truthPath.pdf.directionInsight && truthPath.pdf.directionInsight.body) || ''
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
              subtitle
            }
          : null,
        {
          kind: 'list-block',
          label: labels.reflection,
          items: (truthPath.reflectionPrompts || []).map((prompt) =>
            typeof prompt === 'string' ? prompt : prompt.text
          )
        }
      ].filter(Boolean)
    };

    // ─── v2.3 D10: page 4 — Watch-outs & Growth 留意 ───
    const watch = configs.watchouts || {};
    const low = lowestTalentInfo(record.talent, talentConfig);
    const balancedTriangle = record.ironTriangle.pattern === 'balanced';
    const a2Eligible =
      !record.talent.balancedProfile && low.lowestPct <= 64 && low.lowestKey !== record.talent.dominant;

    const watchCards = [];
    if (watch.a1 && watch.a1[record.talent.dominant]) {
      const a1 = watch.a1[record.talent.dominant];
      watchCards.push({
        kind: 'watch-card',
        title: 'Strength overused',
        talent: categoryName(talentConfig, record.talent.dominant),
        watchOut: a1.watchOut,
        signal: a1.signal
      });
    }
    if (watch.a2 && a2Eligible && watch.a2[low.lowestKey]) {
      const a2 = watch.a2[low.lowestKey];
      watchCards.push({
        kind: 'watch-card',
        title: 'Least natural talent',
        talent: categoryName(talentConfig, low.lowestKey),
        watchOut: a2.watchOut,
        signal: a2.signal
      });
    }
    let a3Card = null;
    if (balancedTriangle) {
      a3Card = {
        kind: 'watch-card',
        title: 'Your Triangle Gap',
        talent: '',
        watchOut: (watch.a3Balanced && watch.a3Balanced.watchOut) || '',
        signal: (watch.a3Balanced && watch.a3Balanced.signal) || ''
      };
      watchCards.push(a3Card);
    } else if (gapRole && watch.a3 && watch.a3[gapRole.key]) {
      const a3 = watch.a3[gapRole.key];
      a3Card = {
        kind: 'watch-card',
        title: 'Your Triangle Gap: ' + gapRole.name + ' ' + gapRole.chinese,
        talent: '',
        watchOut: a3.watchOut,
        signal: a3.signal,
        ally: 'A ' + gapRole.name + '-type partner can secure the gains.'
      };
      watchCards.push(a3Card);
    }
    // Number the cards 1..N in render order.
    watchCards.forEach((card, index) => { card.number = index + 1; });

    // Block C: A2's talent quick win when A2 shows; otherwise the gap role's. The balanced
    // triangle has no gap quick win, so it falls back to a lane-choosing action.
    let quickWin = '';
    if (a2Eligible && watch.a2 && watch.a2[low.lowestKey]) {
      quickWin = watch.a2[low.lowestKey].quickWin;
    } else if (!balancedTriangle && gapRole && watch.a3 && watch.a3[gapRole.key]) {
      quickWin = watch.a3[gapRole.key].quickWin;
    } else if (balancedTriangle) {
      quickWin = 'Choose one primary lane to focus on this week.';
    }

    const teaser = watch.teaser || {};
    const page4 = {
      n: 4,
      key: 'watchouts',
      heading: (cta.report.pages[3] && cta.report.pages[3].title) || 'Watch-outs & Growth 留意',
      intro: watch.intro || '',
      // Analytics inputs (tp_watchouts_view) — no personal data.
      a2Shown: Boolean(a2Eligible),
      gapRole: record.ironTriangle.gap,
      pattern: record.ironTriangle.pattern,
      quickWin,
      blocks: [
        ...watchCards.map((card) => ({ kind: 'watch-card', ...card })),
        primaryRole && watch.underPressure && watch.underPressure[record.ironTriangle.primary]
          ? {
              kind: 'text',
              label: 'Under Pressure',
              text: watch.underPressure[record.ironTriangle.primary]
            }
          : null,
        quickWin ? { kind: 'quick-win', text: quickWin } : null,
        teaser.heading || teaser.bullets
          ? {
              kind: 'teaser',
              heading: teaser.heading || '',
              intro: teaser.intro || '',
              bullets: teaser.bullets || [],
              advisoryLine: teaser.advisory || '',
              advisoryHref: configs.advisoryUrl || ''
            }
          : null,
        {
          kind: 'invite',
          headline: cta.result.consultHeadline,
          text: cta.result.consultSubcopy,
          ctaLabel: (teaser.button || cta.result.consultCtaLabel),
          ctaHref: cta.result.consultHref
        }
      ].filter(Boolean)
    };

    return {
      schemaVersion: record.schemaVersion,
      resultId: record.resultId,
      createdAt: record.createdAt,
      profile: record.profile || { firstName: null },
      headline: cta.report.headline,
      pages: [page1, page2, page3, page4],
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

  // ─── v2.2 helpers ────────────────────────────────────────────────────────────

  /**
   * C1: validate + clean the visitor's first name exactly as the brief specifies. Anything that
   * does not pass the brief's regex is treated as no name at all (the journey blocks invalid
   * names before this, so this is the last line of defence for stored values).
   */
  function asName(value) {
    // v2.3 D7: use exactly what the visitor types. Only trim/collapse surrounding whitespace;
    // no case changes, no splitting.
    const raw = String(value === undefined || value === null ? '' : value).trim().replace(/\s+/g, ' ');
    if (!raw || raw.length > 30) return '';
    if (!/^[\p{L}\p{M}][\p{L}\p{M} '.’-]{0,29}$/u.test(raw)) return '';
    return raw;
  }

  /** "Prepared for Jose · 3 October 2026" — the date half, in the report's long form. */
  function reportDate(iso) {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.getDate() + ' ' +
      ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][date.getMonth()] +
      ' ' + date.getFullYear();
  }

  /** C10: "As a {Archetype}, you combine {dominant phrase} with {secondary phrase}." */
  function naturalStrengthsSentence(truthPath, record, archetype) {
    const phrases = (truthPath && truthPath.strengthPhrases) || {};
    const dominant = phrases[record.talent.dominant];
    const secondary = phrases[record.talent.secondary];
    if (!dominant || !secondary || !archetype) return '';
    return 'As a ' + archetype.name + ', you combine ' + dominant + ' with ' + secondary + '.';
  }

  /**
   * C4: the four full Direction sentences. The Ikigai sentence forms come from the config's
   * per-option rephrase (lowercase, e.g. "leading people"); lists join naturally.
   * `{name}` is substituted with the visitor's first name; without one the sentence keeps its
   * generic form with a capital first letter.
   */
  function directionSentenceBlocks(truthPath, ikigaiConfig, record, name) {
    const templates = (truthPath && truthPath.directionSentences) || {};
    const labels = truthPath.resultBlocks.labels;
    const sentence = (templateKey, label, screenId, field) => {
      const template = templates[templateKey];
      if (!template) return null;
      const list = joinNames(
        optionsFor(ikigaiConfig, screenId, record.ikigai[field] || []).map((option) =>
          option.rephrase || String(option.label).toLowerCase()
        )
      );
      let text = template.replace('{list}', list);
      text = name ? text.replace('{name}', name) : text.replace('{name}, ', '');
      if (!name) text = text.charAt(0).toUpperCase() + text.slice(1);
      return { kind: 'text', label, text: list ? text : text.replace('{list}', '—') };
    };
    return [
      sentence('energises', labels.purpose, 'I-1', 'energises'),
      sentence('goodAt', labels.capability, 'I-2', 'goodAt'),
      sentence('paidFor', labels.economicDirection, 'I-3', 'economicValue'),
      sentence('impact', labels.impactDirection, 'I-4', 'impact')
    ].filter(Boolean);
  }

  /**
   * C4: "Possible areas to explore" — the visitor's I-3 sentence forms (short phrases) plus the
   * two environments of their primary role. Never phrased as "you should".
   */
  function possibleAreasList(truthPath, ikigaiConfig, record, primaryRole) {
    const areas = optionsFor(ikigaiConfig, 'I-3', record.ikigai.economicValue || [])
      .map((option) => option.rephrase || String(option.label).toLowerCase());
    const env = (truthPath && truthPath.possibleAreas && primaryRole && truthPath.possibleAreas[primaryRole.key]) || [];
    return areas.concat(env).slice(0, 5);
  }

  /**
   * C13: booking QR payload. REMOVED in v2.3 — the QR code is cancelled (Change Brief v2.3).
   * BOOKING_URL stays in config for the normal consultation link system.
   */

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
   * v2.2 C11: the second line now depends on the LOWEST branch score, so a strong branch is never
   * called "quiet": >= 70% is a genuine strength, 40-69% a least-dominant branch, below 40% the
   * quietest branch. When all four branches reach 75%, the versatile-profile line is added.
   * The third line is fixed by definition (the four branches are independent, so they never total
   * 100%).
   */
  /**
   * v2.3 D2/D3: the lowest-branch observation. Labels come from the shared strength bands; the
   * below-40 tier names the energy line from config. Ties name both branches and use the first
   * branch in tie order for the energy sentence.
   */
  /** v2.3 D2: the shared band labels; callers that hand-assemble configs get the same defaults. */
  function strengthLabelFn(configs) {
    if (configs && typeof configs.strengthLabel === 'function') return configs.strengthLabel;
    var FALLBACK_BANDS = [
      { min: 85, label: 'Very strong' }, { min: 65, label: 'Strong' }, { min: 40, label: 'Moderate' },
      { min: 20, label: 'Developing' }, { min: 0, label: 'Emerging' }
    ];
    return function (pct) {
      var v = Math.max(0, Math.min(100, Number(pct) || 0));
      var band = FALLBACK_BANDS.find(function (b) { return v >= b.min; });
      return band ? band.label : 'Emerging';
    };
  }

  function lowestTalentInfo(talent, talentConfig) {
    const keys = talentConfig.categories.map((category) => category.key);
    const lowestPct = Math.min.apply(null, keys.map((key) => talent.pct[key]));
    const tiedKeys = keys.filter((key) => talent.pct[key] === lowestPct);
    return { lowestPct, lowestKey: tiedKeys[0], tiedKeys };
  }

  function observationalLines(talent, talentConfig, configs) {
    const name = (key) => categoryName(talentConfig, key);
    // v2.3 D2: the shared bands live in config; a caller that assembles configs by hand falls
    // back to the same defaults, so labels never silently disappear.
    const FALLBACK_BANDS = [
      { min: 85, label: 'Very strong' }, { min: 65, label: 'Strong' }, { min: 40, label: 'Moderate' },
      { min: 20, label: 'Developing' }, { min: 0, label: 'Emerging' }
    ];
    const strengthLabel = configs.strengthLabel || function (pct) {
      const v = Math.max(0, Math.min(100, Number(pct) || 0));
      const band = FALLBACK_BANDS.find((b) => v >= b.min);
      return band ? band.label : 'Emerging';
    };
    const keys = talentConfig.categories.map((category) => category.key);
    const { lowestPct, lowestKey, tiedKeys } = lowestTalentInfo(talent, talentConfig);
    const lowestNames = tiedKeys.map(name);
    const isPlural = tiedKeys.length > 1;

    let lowestLine;
    if (talent.balancedProfile) {
      lowestLine = 'No branch is notably quieter than the rest, which gives you range.';
    } else if (lowestPct >= 65) {
      lowestLine =
        'Even your least dominant branch, ' + lowestNames.join(' and ') + ', is a genuine strength (' +
        strengthLabel(lowestPct) + ').';
    } else if (lowestPct >= 40) {
      lowestLine =
        lowestNames.join(' and ') + (isPlural ? ' are' : ' is') + ' your least dominant branch (' +
        strengthLabel(lowestPct) + '). This may be an area where you lean on others.';
    } else {
      const energyLine = (configs.energyLines && configs.energyLines[lowestKey]) || '';
      lowestLine =
        lowestNames.join(' and ') +
        (isPlural ? ' are your least natural branches' : ' is your least natural branch') +
        ' for now. ' + energyLine + ', so a partner who is strong here can complement you.';
    }

    // v2.3 D4: the co-dominant line lives only in the Talent Pattern paragraph, not here.
    const lines = [];
    if (!talent.balancedProfile && !talent.coDominant) {
      lines.push('Your strongest branch is ' + name(talent.dominant) + ' (' + strengthLabel(talent.pct[talent.dominant]) + ').');
    }
    lines.push(lowestLine);
    if (keys.every((key) => talent.pct[key] >= 75)) {
      lines.push('You show strong scores across all four branches, which suggests a versatile profile.');
    }
    return lines;
  }

  /** Canonical `list(k(1))` — the capability box restates the chosen strengths in the visitor's words. */
  function capabilityLine(truthPath, ikigaiConfig, record) {
    const prefix =
      (truthPath.resultBlocks && truthPath.resultBlocks.strengthsInPrefix) ||
      'You see your strengths in';
    const chosen = optionsFor(ikigaiConfig, 'I-2', record.ikigai.goodAt || []);
    // v2.2 C4: the Alignment Check block carries the alignment messages on page 2, so the
    // capability sentence no longer repeats the talent line here.
    return chosen.length
      ? prefix + ' ' + joinNames(chosen.map((option) => String(option.label).toLowerCase())) + '.'
      : prefix + ' —';
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

  /** Brief 7.4 / v2.2 C8: value creation sentence, rebuilt from stored keys. */
  function valueCreationSentence(truthPath, ikigaiConfig, record, primaryRole) {
    const talentVerb = truthPath.talentVerbs[record.talent.dominant] || '';
    const roleVerb = truthPath.roleVerbs[record.ironTriangle.primary] || '';
    const template = truthPath.valueCreationTemplate;

    // Canonical cites the impact option's REPHRASE ("helping businesses grow"), never its label and
    // never the raw key. The rephrase is optional in config, so fall back to the label and only then
    // to the key — that keeps an older record readable instead of printing a snake_case key on the
    // page. The label is the same words without the sentence form, which still reads correctly.
    //
    // v2.2 C8: if the phrase shares a MAIN word with the role phrase, the visitor's NEXT I-4 pick
    // is used instead; the first pick's phrase is only kept when no other pick exists.
    const phraseOf = (option) =>
      option.rephrase || String(option.label).toLowerCase();
    const picks = (record.ikigai.impact || []).map(
      (key) => optionsFor(ikigaiConfig, 'I-4', [key])[0] || null
    ).filter(Boolean);
    const roleWords = new Set(
      String(roleVerb || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2)
    );
    const clashes = (phrase) =>
      String(phrase || '').toLowerCase().split(/[^a-z]+/)
        .some((w) => w.length > 2 && roleWords.has(w));

    let impactPhrase = '';
    if (picks.length) {
      const clashFree = picks.find((option) => !clashes(phraseOf(option)));
      impactPhrase = phraseOf(clashFree || picks[0]);
    }
    if (!impactPhrase && picks.length === 0) {
      const impactKey = (record.ikigai.impact || [])[0];
      impactPhrase = impactKey ? String(impactKey).replace(/_/g, ' ') : '';
    }

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
