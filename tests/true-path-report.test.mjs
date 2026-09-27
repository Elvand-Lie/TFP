/**
 * True Path — report layer tests.
 *
 * Covers what the report layer can get wrong that only a careful eye would catch in a browser:
 *   1. the Section 13 record reproduces the documented values (Brief 13 / 17),
 *   2. the record stores STABLE KEYS and the model resolves each one into copy — an unresolved key
 *      shows up as an empty label, which is exactly how the duplicate "Talent Pattern" label bug
 *      reached the page,
 *   3. page 3 carries role shares that total exactly 100, and
 *   4. the PDF renders from that same model, so the file cannot drift from the screen (Brief 8/17).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ReportModel = require('../true-path/lib/report-model.js');
const ReportPdf = require('../true-path/lib/report-pdf.js');
const Scoring = require('../true-path/lib/scoring.js');
const Resolve = require('../true-path/lib/trupath.js');
const Svg = require('../true-path/assets/true-path-svg.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const readJson = (relative) => JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));

const talentJson = readJson('true-path/config/talent.json');
const ikigaiJson = readJson('true-path/config/ikigai.json');
const ironJson = readJson('true-path/config/iron-triangle.json');
const scoringJson = readJson('true-path/config/scoring.json');
const truthPathJson = readJson('true-path/config/trupath.json');
const ctaJson = readJson('true-path/config/cta.json');

const talentConfig = Object.assign({}, talentJson, { scoring: scoringJson.talent });
const modelConfigs = {
  talent: talentConfig,
  ikigai: ikigaiJson,
  ironTriangle: ironJson,
  truthPath: truthPathJson,
  scoring: scoringJson,
  cta: ctaJson
};

const ROLE_KEYS = ['commander', 'general', 'chancellor'];

/**
 * Brief 17 Case F: every Likert answer is 5, so all four branches tie at 100.
 *
 * The case also selects in Ikigai (leading / influencing, execution). A journey with no Ikigai
 * picks is not reportable, so the fixture mirrors the documented case and includes them.
 */
function caseFInput() {
  const answers = {};
  talentJson.displayOrder.forEach((questionId) => {
    answers[questionId] = 5;
  });

  const scenarioAnswers = {};
  ironJson.scenarios.forEach((scenario) => {
    scenarioAnswers[scenario.id] = 'commander';
  });

  const picks = [
    { screenId: 'I-1', key: 'leading_influencing', fromSuggestion: false },
    { screenId: 'I-2', key: 'strategy', fromSuggestion: false },
    { screenId: 'I-2', key: 'execution', fromSuggestion: false },
    { screenId: 'I-3', key: 'business_entrepreneurship', fromSuggestion: false },
    { screenId: 'I-4', key: 'inspire_others', fromSuggestion: false }
  ];

  return { answers, scenarioAnswers, picks };
}

/** Build the Section 13 record exactly the way the page does, from raw journey answers. */
function buildRecord({ answers, scenarioAnswers, picks = [] }) {
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
    suggestedKeys: [],
    talentAnswers: answers,
    scenarios: ironJson.scenarios,
    scenarioAnswers,
    configs: { ikigai: ikigaiJson, scoring: scoringJson, truthPath: truthPathJson },
    meta: {
      resultId: 'tp_test000001',
      createdAt: '2026-09-24T10:00:00+08:00',
      attribution: { utm_source: null, utm_campaign: null, device: 'desktop' }
    }
  });
}

test('report: record carries its schema version and the weights that produced it', () => {
  const record = buildRecord(caseFInput());

  assert.equal(record.schemaVersion, ReportModel.SCHEMA_VERSION);
  assert.equal(record.schemaVersion, '2.1');
  assert.equal(record.resultId, 'tp_test000001');
  assert.equal(record.locale, 'en');

  // Brief 13: the weights travel with the record so older results stay auditable.
  assert.equal(record.ironTriangle.weights.scenario, 0.65);
  assert.equal(record.ironTriangle.weights.talent, 0.2);
  assert.equal(record.ironTriangle.weights.ikigai, 0.15);
  assert.ok(record.ironTriangle.weights.affinityMatrixVersion);
  assert.ok(record.ironTriangle.weights.ikigaiTagVersion);
});

test('report: record stores stable keys, never display copy', () => {
  const record = buildRecord(caseFInput());

  const displayNames = new Set(talentJson.categories.map((category) => category.name));
  talentJson.categories.forEach((category) => {
    assert.ok(category.key in record.talent.pct, 'pct missing key ' + category.key);
  });
  Object.keys(record.talent.pct).forEach((key) => {
    assert.ok(!displayNames.has(key), 'pct should be keyed by stable keys, found "' + key + '"');
  });

  assert.ok(ROLE_KEYS.includes(record.ironTriangle.primary));
  assert.ok(ROLE_KEYS.includes(record.ironTriangle.supporting));
  assert.match(record.truePath.titleKey, /^[a-z_]+__[a-z_]+$/);
  assert.ok(Array.isArray(record.truePath.alignment));
});

test('report: the all-100 tie puts Commander first and the shares total exactly 100', () => {
  const record = buildRecord(caseFInput());
  const shares = ROLE_KEYS.map((key) => record.ironTriangle.share[key]);

  assert.equal(shares.reduce((a, b) => a + b, 0), 100);
  assert.equal(record.ironTriangle.primary, 'commander');
  assert.equal(record.ironTriangle.pattern, 'single');
});

test('report: the model resolves to three pages, in journey order, with config headings', () => {
  const record = buildRecord(caseFInput());
  const model = ReportModel.buildReportModel(record, modelConfigs);

  assert.equal(model.pages.length, 3);
  assert.deepEqual(
    model.pages.map((page) => page.n),
    [1, 2, 3]
  );
  model.pages.forEach((page, index) => {
    assert.equal(page.heading, ctaJson.report.pages[index].title);
  });

  // Page 3 must keep the Iron Triangle reveal, the role card and the True Path title.
  const kinds = model.pages[2].blocks.map((block) => block.kind);
  assert.ok(kinds.includes('iron-triangle'));
  assert.ok(kinds.includes('role-card'));
  assert.ok(kinds.includes('title'));
});

test('report: every model block resolves its keys to real copy', () => {
  const record = buildRecord(caseFInput());
  const model = ReportModel.buildReportModel(record, modelConfigs);

  // Blocks that are pure visuals or self-labelling by design, not missing a label.
  const selfLabelled = ['invite', 'title', 'pair', 'talent-tree', 'iron-triangle'];

  model.pages.forEach((page) => {
    assert.ok(page.blocks.length > 0, 'page ' + page.n + ' has no blocks');
    page.blocks.forEach((block) => {
      assert.ok(block && block.kind, 'page ' + page.n + ' has an empty block');
      assert.ok(
        selfLabelled.includes(block.kind) || block.label,
        'block "' + block.kind + '" on page ' + page.n + ' lost its label'
      );
      if (block.kind === 'text') {
        assert.ok(block.text && block.text !== '\u2014', 'empty text block "' + block.label + '"');
      }
      if (block.kind === 'role-card') {
        assert.ok(block.name && block.chinese && block.glyph);
        assert.ok(block.naturalStrengths.length > 0);
      }
      if (block.kind === 'list-block') {
        assert.ok(block.items.length > 0, 'empty list block "' + block.label + '"');
      }
    });
  });
});

test('report: a single-dominant triangle labels the talent pattern only once', () => {
  // Regression: the "Talent Pattern" label was emitted by both the scores block and the pair
  // block when the pattern was single, so page 1 printed it twice.
  const answers = {};
  talentJson.displayOrder.forEach((questionId) => {
    answers[questionId] = 4;
  });
  const scenarioAnswers = {};
  ironJson.scenarios.forEach((scenario) => {
    scenarioAnswers[scenario.id] = 'chancellor';
  });

  const input = caseFInput();
  const record = buildRecord({
    answers,
    scenarioAnswers,
    picks: input.picks
  });
  assert.equal(record.ironTriangle.pattern, 'single');

  const model = ReportModel.buildReportModel(record, modelConfigs);
  const patternLabel = truthPathJson.resultBlocks.labels.talentPattern;
  const occurrences =
    JSON.stringify(model.pages[0]).split(JSON.stringify(patternLabel)).length - 1;

  assert.equal(occurrences, 1, '"' + patternLabel + '" should appear once, found ' + occurrences);
});

test('report: page 3 score rows are the role shares and still total 100', () => {
  const record = buildRecord(caseFInput());
  const model = ReportModel.buildReportModel(record, modelConfigs);

  const scoreBlock = model.pages[2].blocks.find((block) => block.kind === 'scores');
  assert.ok(scoreBlock, 'page 3 is missing its share breakdown');

  const total = scoreBlock.rows.reduce((sum, row) => sum + Number(row.value), 0);
  assert.equal(total, 100);
  assert.equal(scoreBlock.rows.length, 3);
});

test('report: the model exposes the email and consultation copy from config (Brief 9)', () => {
  const record = buildRecord(caseFInput());
  const model = ReportModel.buildReportModel(record, modelConfigs);

  assert.equal(model.email.headline, ctaJson.report.emailHeadline);
  assert.equal(model.email.sendLabel, ctaJson.report.emailSendLabel);
  assert.equal(model.email.skipLabel, ctaJson.report.emailSkipLabel);
  assert.equal(model.email.marketingLabel, ctaJson.report.marketingConsentLabel);
  assert.equal(model.email.privacyHref, ctaJson.report.privacyHref);

  const invite = model.pages[2].blocks.find((block) => block.kind === 'invite');
  assert.ok(invite.ctaHref, 'the consultation invite lost its destination');
});

test('report: the PDF definition maps every page of the model', () => {
  const record = buildRecord(caseFInput());
  const model = ReportModel.buildReportModel(record, modelConfigs);

  const definition = ReportPdf.buildReportPdfDefinition(model, { Svg });

  assert.equal(definition.pageSize, 'A4');
  assert.equal(definition.defaultStyle.font, ReportPdf.FONT);
  assert.equal(definition.defaultStyle.font, 'NotoSansSC');
  assert.ok(definition.content.length > 0);

  // One page per journey stage: every page after the first starts a new PDF page (Brief 8).
  const breaks = definition.content.filter((item) => item.pageBreak === 'before');
  assert.equal(breaks.length, model.pages.length - 1);

  // The drawings and the brand colour must survive into the PDF.
  const serialized = JSON.stringify(definition);
  assert.ok(serialized.includes('<svg'), 'the PDF definition lost its SVG visuals');
  assert.ok(serialized.includes('C6A96B'), 'the PDF definition lost the gold brand colour');

  // The True Path title, the emotional close of the journey, must be in the file.
  const titleBlock = model.pages[2].blocks.find((block) => block.kind === 'title');
  assert.ok(serialized.includes(titleBlock.title), 'the PDF lost the True Path title');
});

test('report: the PDF carries CJK text rather than dropping it', () => {
  // The report prints 才 / 道 / 位 / 帅 / 将 / 相. Without an embedded CJK font those become tofu.
  const record = buildRecord(caseFInput());
  const model = ReportModel.buildReportModel(record, modelConfigs);
  const definition = ReportPdf.buildReportPdfDefinition(model, { Svg });

  assert.equal(definition.defaultStyle.font, 'NotoSansSC');
  const cjk = JSON.stringify(definition).match(/[\u4e00-\u9fff]/g);
  assert.ok(cjk && cjk.length > 0, 'no CJK characters reached the PDF model');
});

test('report: PDF score bars stay inside 0-100 even for an out-of-range value', () => {
  assert.equal(ReportPdf.scoreBar(140, 100).canvas[1].w, 300);
  assert.equal(ReportPdf.scoreBar(-10, 100).canvas[1].w, 0);
  assert.equal(ReportPdf.scoreBar(50, 100).canvas[1].w, 150);
});

test('report: the result id shape matches the documented tp_ prefix', () => {
  const id = ReportModel.makeResultId();
  assert.match(id, /^tp_[A-Za-z0-9_-]{4,64}$/);
  assert.notEqual(id, ReportModel.makeResultId());
});
