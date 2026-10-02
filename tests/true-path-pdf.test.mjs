/**
 * True Path — PDF rendering tests (Brief 8 / 17).
 *
 * The definition-level checks live in `true-path-report.test.mjs`. These go further and render a
 * True Path — PDF rendering tests (Brief 8 / 17).
 *
 * The definition-level checks live in `true-path-report.test.mjs`. These render a REAL PDF, because
 * two failure modes only show up in the file itself:
 *   - pdfmake silently ignoring the SVG visuals, and
 *   - a missing CJK font, which prints 才 / 道 / 位 / 帅 / 将 / 相 as tofu boxes.
 *
 * The render pipeline lives in `true-path/lib/report-pdf.js`, so the test can drive it with the
 * same pdfmake instance and font the API uses, without importing any TypeScript.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readTruePathConfig } from './helpers/true-path-config.mjs';

const require = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
// Suite path -> config bundle, via the canonical build() output (tests/helpers/true-path-config.mjs).
const readJson = (relative) => readTruePathConfig(repoRoot, relative);

const ReportModel = require('../true-path/lib/report-model.js');
const ReportPdf = require('../true-path/lib/report-pdf.js');
const Svg = require('../true-path/assets/true-path-svg.js');
const Scoring = require('../true-path/lib/scoring.js');
const Resolve = require('../true-path/lib/trupath.js');
const pdfmake = require('pdfmake');

const talentJson = readJson('true-path/config/talent.json');
const ikigaiJson = readJson('true-path/config/ikigai.json');
const ironJson = readJson('true-path/config/iron-triangle.json');
const scoringJson = readJson('true-path/config/scoring.json');
const truthPathJson = readJson('true-path/config/trupath.json');
const ctaJson = readJson('true-path/config/cta.json');

const talentConfig = Object.assign({}, talentJson, { scoring: scoringJson.talent });
const fontPath = path.join(repoRoot, 'fonts', 'NotoSansSC.ttf');

test('score bars fit their 60-point report column at every percentage', () => {
  for (const value of [0, 8, 50, 84, 100]) {
    const bar = ReportPdf.scoreBar(value, 100);
    assert.equal(bar.canvas[0].w, 60);
    assert.equal(bar.canvas[1].w, 60 * value / 100);
  }
});

/** A completed journey: Case F talents, all-Chancellor scenarios, and Ikigai selections. */
function sampleRecord() {
  return recordFor({
    talentValue: 4,
    role: 'chancellor',
    picks: [
      { screenId: 'I-1', key: 'solving_problems', fromSuggestion: true },
      { screenId: 'I-2', key: 'planning', fromSuggestion: true },
      { screenId: 'I-3', key: 'operations_management', fromSuggestion: true },
      { screenId: 'I-4', key: 'build_systems_efficiency', fromSuggestion: false }
    ]
  });
}

/**
 * Build a record for an arbitrary journey shape. Give either `picks` (an explicit list) or `per`
 * (a screen id → how many of that screen's options were picked, 1..3). Pick volume is the only
 * input that moves the page count, so `per` is how the tests reach the page-3 overflow.
 */
function recordFor(options) {
  const opts = options || {};
  const talentValue = opts.talentValue || 4;
  const role = opts.role || 'chancellor';
  const answers = {};
  talentJson.displayOrder.forEach((questionId) => {
    answers[questionId] = talentValue;
  });
  const scenarioAnswers = {};
  ironJson.scenarios.forEach((scenario) => {
    scenarioAnswers[scenario.id] = role;
  });

  let picks = opts.picks;
  if (!picks) {
    const per = opts.per || { 'I-1': 1, 'I-2': 1, 'I-3': 1, 'I-4': 1 };
    picks = [];
    Object.keys(per).forEach((screenId) => {
      const screen = ikigaiJson.screens.find((s) => s.id === screenId);
      screen.options.slice(0, per[screenId]).forEach((option) => {
        picks.push({ screenId, key: option.key, fromSuggestion: true });
      });
    });
  }

  const talent = Scoring.scoreTalent(answers, talentConfig);
  const scenarioRoles = ironJson.scenarios.map((scenario) => scenarioAnswers[scenario.id]);
  const triangle = Scoring.computeRoleResult(scenarioRoles, talent.pct, picks, scoringJson);
  const resolved = Resolve.buildTruePathResult({
    talent,
    triangle,
    picks,
    configs: {
      talent: talentConfig,
      ikigai: ikigaiJson,
      ironTriangle: ironJson,
      truthPath: truthPathJson
    }
  });

  return ReportModel.buildResultRecord({
    talent,
    triangle,
    resolved,
    picks,
    suggestedKeys: ['solving_problems', 'planning', 'operations_management'],
    talentAnswers: answers,
    scenarios: ironJson.scenarios,
    scenarioAnswers,
    configs: { ikigai: ikigaiJson, scoring: scoringJson, truthPath: truthPathJson },
    meta: {
      resultId: 'tp_pdf0000001',
      createdAt: '2026-09-24T10:00:00+08:00',
      attribution: { utm_source: null, utm_campaign: null, device: 'mobile' }
    }
  });
}

function modelFor(record) {
  return ReportModel.buildReportModel(record, {
    talent: talentConfig,
    ikigai: ikigaiJson,
    ironTriangle: ironJson,
    truthPath: truthPathJson,
    scoring: scoringJson,
    cta: ctaJson
  });
}

function render(model) {
  return ReportPdf.renderReportPdf(model, { Svg }, { pdfmake, fontPath });
}

test('pdf: the CJK font needed for correct Chinese rendering is bundled', () => {
  // Brief 17: the PDF must render Chinese characters correctly, which needs this file shipped.
  const font = path.join(repoRoot, 'fonts', 'NotoSansSC.ttf');
  assert.ok(existsSync(font), 'fonts/NotoSansSC.ttf is missing from the bundle');
  assert.ok(readFileSync(font).length > 1000, 'fonts/NotoSansSC.ttf looks empty');
});

test('pdf: rendering produces a real, complete three-page PDF', async () => {
  const buffer = await render(modelFor(sampleRecord()));
  assert.equal(buffer.slice(0, 5).toString('latin1'), '%PDF-');
  assert.ok(Buffer.isBuffer(buffer), 'the renderer must return a Buffer');
  // A three-page report with an embedded CJK subset and two SVG drawings is comfortably large.
  assert.ok(buffer.length > 12000, 'PDF looks too small: ' + buffer.length + ' bytes');

  const raw = buffer.toString('latin1');
  assert.match(raw, /%%EOF/, 'the PDF is truncated');
  // A CJK subset must be embedded, otherwise 才 / 道 / 位 / 帅 / 将 / 相 would render as tofu.
  assert.match(raw, /\/FontFile2/, 'the font file was not embedded');
  assert.match(raw, /Subtype \/Type0/, 'the CJK font was not embedded as a composite font');
  assert.match(raw, /Identity-H/, 'the CJK font is not using a CID encoding');
  assert.match(raw, /\/ToUnicode/, 'the CJK text would not be extractable or searchable');
  // Three pages, one per journey stage.
  assert.match(raw, /\/Count 3/, 'the PDF does not have the expected three pages');
});

test('pdf: a full-length journey still renders three pages, not four', async () => {
  // Page 3's copy grows with the number of Ikigai picks, so a realistic journey is the shape that
  // reaches the overflow: the fixture above picks 1 per screen and never spills, which is exactly
  // why the defect shipped. Each shape below was verified to render 4 pages before the fix (one
  // per role), so this test genuinely fails if the page-3 overflow ever comes back.
  const overflowing = [
    { talentValue: 5, role: 'commander', per: { 'I-1': 1, 'I-2': 1, 'I-3': 2, 'I-4': 1 } },
    { talentValue: 5, role: 'general', per: { 'I-1': 1, 'I-2': 1, 'I-3': 3, 'I-4': 1 } },
    { talentValue: 5, role: 'chancellor', per: { 'I-1': 2, 'I-2': 2, 'I-3': 2, 'I-4': 2 } }
  ];

  for (const shape of overflowing) {
    const buffer = await render(modelFor(recordFor(shape)));
    const raw = buffer.toString('latin1');
    const count = Number((raw.match(/\/Count\s+(\d+)/) || [])[1]);
    // cta.json promises a "3-Page True Path Report" in two places, so this is a product contract.
    assert.equal(
      count,
      3,
      'journey ' + JSON.stringify(shape) + ' rendered ' + count + ' pages, not 3'
    );
  }
});

test('pdf: the report content is the model the on-screen page shows', () => {
  // The PDF and the browser view are built from one model, so proving the model carries the copy
  // proves the PDF was rendered from the same content (Brief 8: the PDF matches the report).
  const model = modelFor(sampleRecord());
  const serialized = JSON.stringify(model);

  assert.ok(serialized.includes('The Master Architect'), 'the model lost its True Path title');
  assert.ok(serialized.includes('\u5e05\u624d'), 'the model lost the Commander 帅才 label');
  assert.ok(serialized.includes('\u76f8\u624d'), 'the model lost the Chancellor 相才 label');

  // The drawn visuals must be present as SVG in the model the PDF is rendered from.
  const definition = ReportPdf.buildReportPdfDefinition(model, { Svg });
  const svgCount = JSON.stringify(definition).split('<svg').length - 1;
  assert.equal(svgCount, 2, 'expected a talent tree and an iron triangle, found ' + svgCount);
});

test('pdf: rendering refuses to run without a CJK font', () => {
  // Guards the tofu failure mode: a render with no font must fail loudly, not print boxes.
  assert.throws(
    () => ReportPdf.renderReportPdf(modelFor(sampleRecord()), { Svg }, { pdfmake }),
    /font/i
  );
});
