/**
 * True Path — server-side report model.
 *
 * The online report and the PDF must show the SAME content, so the server reuses the exact
 * presentation-free model the browser uses (`true-path/lib/report-model.js`) rather than
 * re-implementing the layout. Config comes from the one approved JSON file (Brief 15) and is
 * the only source of copy.
 *
 * TWO jobs, and the second one is the security-relevant half:
 *
 *  1. `buildModel` / `decodePayload` — turn a stored record into renderable content, unchanged.
 *  2. `recomputeRecord` — treat an incoming record as UNTRUSTED raw input. Only the raw answer
 *     fields, attribution and suggestion metadata are read; every score, share, title and
 *     alignment is recomputed here with the shared scoring engine, and the id and timestamp are
 *     issued by the server. A client cannot post a fabricated result and have it stored as fact.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Config = require('../config.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const canonical = require('../../config/true-path.config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReportModel = require('../report-model.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Scoring = require('../scoring.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Resolve = require('../trupath.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const crypto = require('crypto');

/** The one approved configuration, in the shapes scoring/report already expect. */
let cachedConfigs: Record<string, any> | null = null;

export function reportConfigs(): Record<string, any> {
  if (!cachedConfigs) cachedConfigs = Config.build(canonical);
  return cachedConfigs as Record<string, any>;
}

/** The consolidated configuration itself, for callers that need canonical keys/copy. */
export function canonicalConfig(): any {
  return canonical;
}

/** Loose shape guard: a usable record is a Section 13 object, not a lead submission. */
export function isResultRecord(value: unknown): boolean {
  const record = value as Record<string, any> | null;
  return Boolean(
    record &&
      typeof record === 'object' &&
      record.talent &&
      record.ironTriangle &&
      record.truePath &&
      typeof record.resultId === 'string'
  );
}

/** Turn a stored record into the three-page block model, or null when the record is unusable. */
export function buildModel(record: unknown): any {
  if (!isResultRecord(record)) return null;

  try {
    return ReportModel.buildReportModel(record, reportConfigs());
  } catch (error) {
    return null;
  }
}

/** Decode the self-contained `?r=<base64url>` payload used by the report page and PDF link. */
export function decodePayload(payload: unknown): any {
  if (typeof payload !== 'string' || !payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return isResultRecord(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

// ─── validation of untrusted input ───────────────────────────────────────────

export type ValidationIssue = { field: string; code: string };

export type JourneyInputs = {
  talentAnswers: Record<string, number>;
  scenarioAnswers: Record<string, string>;
  picks: Array<{ screenId: string; key: string; fromSuggestion: boolean }>;
  suggestedKeys: string[];
  attribution: { utm_source: string | null; utm_campaign: string | null; device: string };
  locale: string;
};

const DEVICE_CLASSES = ['mobile', 'tablet', 'desktop'];
const MAX_TEXT = 200;

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function shortString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TEXT);
}

/**
 * Read ONLY the whitelisted raw fields out of an untrusted record.
 *
 * Everything else the client sent — scores, shares, titles, copy, lead — is ignored by
 * construction: it is simply never read. That is what stops an arbitrary copy payload from
 * overriding server-computed content.
 *
 * @param requireFullJourney true for a real save (all four Ikigai screens need a pick); false
 *   only for direct scoring of approved fixtures, which may leave a screen empty.
 */
export function validateJourneyInputs(
  record: unknown,
  options: { requireFullJourney: boolean }
): { ok: true; inputs: JourneyInputs } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const configs = reportConfigs();
  const source = isPlainObject(record) ? record : {};

  // ── Talent: all 12 questions, integer 1..5 ────────────────────────────────
  const talentSource = isPlainObject(source.talent) ? source.talent : {};
  const rawTalent = isPlainObject(talentSource.answers) ? talentSource.answers : {};
  const scale = configs.talent.scale;
  const talentAnswers: Record<string, number> = {};

  configs.talent.questions.forEach((question: any) => {
    const value = rawTalent[question.id];

    if (value === undefined || value === null || value === '') {
      issues.push({ field: `talent.answers.${question.id}`, code: 'missing' });
      return;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < scale.min || value > scale.max) {
      issues.push({ field: `talent.answers.${question.id}`, code: 'out_of_range' });
      return;
    }
    talentAnswers[question.id] = value;
  });

  // ── Iron Triangle: one role key per scenario ──────────────────────────────
  const ironSource = isPlainObject(source.ironTriangle) ? source.ironTriangle : {};
  const rawScenarios = isPlainObject(ironSource.answers) ? ironSource.answers : {};
  const roleKeys = configs.ironTriangle.roles.map((role: any) => role.key);
  const scenarioAnswers: Record<string, string> = {};

  configs.ironTriangle.scenarios.forEach((scenario: any) => {
    const value = rawScenarios[scenario.id];
    if (typeof value !== 'string' || !value) {
      issues.push({ field: `ironTriangle.answers.${scenario.id}`, code: 'missing' });
      return;
    }
    if (roleKeys.indexOf(value) === -1) {
      issues.push({ field: `ironTriangle.answers.${scenario.id}`, code: 'invalid_role' });
      return;
    }
    scenarioAnswers[scenario.id] = value;
  });

  // ── Ikigai: per-screen option keys, max 3 each ────────────────────────────
  const ikigaiSource = isPlainObject(source.ikigai) ? source.ikigai : {};
  const picks: Array<{ screenId: string; key: string; fromSuggestion: boolean }> = [];
  const minPerScreen = options.requireFullJourney ? configs.ikigai.minSelections : 0;
  const maxPerScreen = configs.ikigai.maxSelections;

  configs.ikigai.screens.forEach((screen: any) => {
    const raw = ikigaiSource[screen.field];
    const values = raw === undefined || raw === null ? [] : raw;

    if (!Array.isArray(values)) {
      issues.push({ field: `ikigai.${screen.field}`, code: 'invalid_type' });
      return;
    }

    const allowed = screen.options.map((option: any) => option.key);
    const unique: string[] = [];
    values.forEach((value: unknown) => {
      if (typeof value !== 'string' || allowed.indexOf(value) === -1) {
        issues.push({ field: `ikigai.${screen.field}`, code: 'invalid_key' });
        return;
      }
      if (unique.indexOf(value) === -1) unique.push(value);
    });

    if (unique.length < minPerScreen) {
      issues.push({ field: `ikigai.${screen.field}`, code: 'too_few' });
    }
    if (unique.length > maxPerScreen) {
      issues.push({ field: `ikigai.${screen.field}`, code: 'too_many' });
    }

    unique.slice(0, maxPerScreen).forEach((key) => {
      picks.push({ screenId: screen.id, key, fromSuggestion: false });
    });
  });

  // ── Suggestion metadata (whitelisted, non-scoring) ────────────────────────
  const allOptionKeys: string[] = [];
  configs.ikigai.screens.forEach((screen: any) => {
    screen.options.forEach((option: any) => {
      if (allOptionKeys.indexOf(option.key) === -1) allOptionKeys.push(option.key);
    });
  });

  const suggestedKeys: string[] = [];
  const rawSuggested = ikigaiSource.suggested;
  if (rawSuggested !== undefined && rawSuggested !== null) {
    if (!Array.isArray(rawSuggested)) {
      issues.push({ field: 'ikigai.suggested', code: 'invalid_type' });
    } else {
      rawSuggested.forEach((value: unknown) => {
        if (typeof value !== 'string' || allOptionKeys.indexOf(value) === -1) {
          issues.push({ field: 'ikigai.suggested', code: 'invalid_key' });
          return;
        }
        if (suggestedKeys.indexOf(value) === -1) suggestedKeys.push(value);
      });
    }
  }

  picks.forEach((pick) => {
    pick.fromSuggestion = suggestedKeys.indexOf(pick.key) !== -1;
  });

  // ── Attribution (whitelisted; never trusted blindly) ──────────────────────
  const attributionSource = isPlainObject(source.attribution) ? source.attribution : {};
  const device =
    typeof attributionSource.device === 'string' && DEVICE_CLASSES.indexOf(attributionSource.device) !== -1
      ? attributionSource.device
      : 'desktop';

  const attribution = {
    utm_source: shortString(attributionSource.utm_source),
    utm_campaign: shortString(attributionSource.utm_campaign),
    device,
  };

  const locale = shortString(source.locale) || 'en';

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    inputs: {
      talentAnswers,
      scenarioAnswers,
      picks,
      suggestedKeys,
      attribution,
      locale,
    },
  };
}

/**
 * A stable fingerprint of the validated inputs, so a repeated idempotency key can be told apart
 * from a key being reused with different answers. Ordered explicitly (config order) rather than
 * relying on object key insertion, and hashed so the stored value stays small.
 */
export function fingerprintInputs(inputs: JourneyInputs): string {
  const canonicalShape = JSON.stringify({
    v: 1,
    talent: inputs.talentAnswers,
    scenarios: inputs.scenarioAnswers,
    picks: inputs.picks.map((pick) => [pick.screenId, pick.key]),
    suggested: inputs.suggestedKeys,
    locale: inputs.locale,
  });

  return crypto.createHash('sha256').update(canonicalShape).digest('hex');
}

/**
 * Recompute the §13 record from validated raw input, with server-owned id and timestamp.
 *
 * @param meta.resultId server-issued id (never the client's)
 * @param meta.createdAt server timestamp
 */
export function buildRecordFromInputs(
  inputs: JourneyInputs,
  meta: { resultId: string; createdAt: string }
): Record<string, any> {
  const configs = reportConfigs();

  const talent = Scoring.scoreTalent(inputs.talentAnswers, configs.talent);
  const scenarioRoles = configs.ironTriangle.scenarios.map(
    (scenario: any) => inputs.scenarioAnswers[scenario.id]
  );
  const triangle = Scoring.computeRoleResult(
    scenarioRoles,
    talent.pct,
    inputs.picks,
    configs.scoring
  );
  const resolved = Resolve.buildTruePathResult({
    talent,
    triangle,
    picks: inputs.picks,
    configs: {
      talent: configs.talent,
      ikigai: configs.ikigai,
      ironTriangle: configs.ironTriangle,
      truthPath: configs.truthPath,
    },
  });

  return ReportModel.buildResultRecord({
    talent,
    triangle,
    resolved,
    picks: inputs.picks,
    suggestedKeys: inputs.suggestedKeys,
    talentAnswers: inputs.talentAnswers,
    scenarios: configs.ironTriangle.scenarios,
    scenarioAnswers: inputs.scenarioAnswers,
    configs: {
      ikigai: configs.ikigai,
      scoring: configs.scoring,
      truthPath: configs.truthPath,
    },
    meta: {
      resultId: meta.resultId,
      createdAt: meta.createdAt,
      locale: inputs.locale,
      attribution: inputs.attribution,
    },
  });
}

/**
 * Convenience wrapper: validate then recompute. Used by the save path and by tests that score
 * the approved fixtures directly (where a screen may be empty).
 */
export function recomputeRecord(
  record: unknown,
  options: { requireFullJourney: boolean; resultId: string; createdAt: string }
):
  | { ok: true; record: Record<string, any>; inputs: JourneyInputs; fingerprint: string }
  | { ok: false; issues: ValidationIssue[] } {
  const validated = validateJourneyInputs(record, {
    requireFullJourney: options.requireFullJourney,
  });
  // `in` rather than a truthiness check: `ok` widens to `boolean` under this repo's
  // non-strict tsconfig, which defeats discriminated-union narrowing.
  if ('issues' in validated) return { ok: false, issues: validated.issues };

  return {
    ok: true,
    record: buildRecordFromInputs(validated.inputs, {
      resultId: options.resultId,
      createdAt: options.createdAt,
    }),
    inputs: validated.inputs,
    fingerprint: fingerprintInputs(validated.inputs),
  };
}

/**
 * Strip anything personal before a record is returned by the public GET.
 *
 * The report itself needs no lead details to render, and a result link is shareable, so the
 * captured lead (name, email, consent flags) must never travel on a read.
 */
export function redactRecordForPublic(record: unknown): Record<string, any> | null {
  if (!isPlainObject(record)) return null;

  const copy: Record<string, any> = JSON.parse(JSON.stringify(record));
  delete copy.lead;

  return copy;
}

export { ReportModel };
