/**
 * True Path — server-side report model.
 *
 * The online report and the PDF must show the SAME content, so the server reuses the exact
 * presentation-free model the browser uses (`true-path/lib/report-model.js`) rather than
 * re-implementing the layout. Config stays in JSON (Brief 15) and is the only source of copy.
 *
 * The record itself stores stable keys only (Brief 13), so keys -> copy mapping has to happen
 * here, on the server, where the config is available.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReportModel = require('../report-model.js');

const talent = require('../../config/talent.json');
const ikigai = require('../../config/ikigai.json');
const ironTriangle = require('../../config/iron-triangle.json');
const scoring = require('../../config/scoring.json');
const truthPath = require('../../config/trupath.json');
const cta = require('../../config/cta.json');

/** The config bundle `buildReportModel` expects. */
export function reportConfigs(): Record<string, unknown> {
  return {
    talent: { ...talent, scoring: scoring.talent },
    ikigai,
    ironTriangle,
    scoring,
    truthPath,
    cta
  };
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

export { ReportModel };
