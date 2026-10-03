/* Generate the three v2.2 validation reports (Jose, Yvonne, Kelvin). */
const path = require('path');
const fs = require('fs');

const canonical = require('../true-path/config/true-path.config.json');
const Config = require('../true-path/lib/config.js');
const Scoring = require('../true-path/lib/scoring.js');
const Resolve = require('../true-path/lib/trupath.js');
const ReportModel = require('../true-path/lib/report-model.js');
const Svg = require('../true-path/assets/true-path-svg.js');
const ReportPdf = require('../true-path/lib/report-pdf.js');
const pdfmake = require('pdfmake');

const configs = Config.build(canonical);
const outDir = path.join(__dirname, '..', '.v22-reports');
fs.mkdirSync(outDir, { recursive: true });

const PROFILES = {
  Jose: {
    // The 3 Oct profile: Creative 100 / Communicator 92 / Organiser 83 / Analyst 75.
    talent: [4, 4, 5, 4, 4, 4, 5, 5, 4, 5, 5, 5],
    ikigai: {
      energises: ['leading_influencing', 'teaching_sharing', 'helping_transform'],
      goodAt: ['communication', 'empathy', 'leadership'],
      economicValue: ['education_training', 'consulting_advisory', 'personal_growth_coaching'],
      impact: ['help_people_find_direction', 'inspire_others', 'teach_wisdom']
    },
    scenarios: ['commander', 'commander', 'commander', 'commander', 'commander', 'commander']
  },
  Yvonne: {
    talent: [5, 4, 4, 3, 4, 3, 2, 3, 2, 2, 2, 3],
    ikigai: {
      energises: ['building_creating_projects', 'solving_problems'],
      goodAt: ['planning', 'analysis', 'execution'],
      economicValue: ['operations_management', 'technology_systems'],
      impact: ['build_systems_efficiency', 'help_people_navigate_change']
    },
    scenarios: ['chancellor', 'chancellor', 'general', 'chancellor', 'chancellor', 'chancellor']
  },
  Kelvin: {
    talent: [2, 3, 2, 2, 2, 3, 5, 4, 5, 4, 4, 4],
    ikigai: {
      energises: ['designing_imagining'],
      goodAt: ['creativity', 'communication'],
      economicValue: ['business_entrepreneurship', 'sales_influence', 'creative_work'],
      impact: ['build_wealth_freedom', 'create_innovation']
    },
    scenarios: ['general', 'commander', 'general', 'general', 'commander', 'general']
  }
};

function buildRecord(firstName, profile, resultId, createdAt) {
  const talentAnswers = {};
  profile.talent.forEach((value, i) => { talentAnswers['Q' + (i + 1)] = value; });
  const scenarioAnswers = {};
  profile.scenarios.forEach((role, i) => { scenarioAnswers['S' + (i + 1)] = role; });
  const picks = [];
  [['I-1', 'energises'], ['I-2', 'goodAt'], ['I-3', 'economicValue'], ['I-4', 'impact']].forEach(([screenId, field]) => {
    profile.ikigai[field].forEach((key) => picks.push({ screenId, key, fromSuggestion: false }));
  });

  const talent = Scoring.scoreTalent(talentAnswers, configs.talent);
  const scenarioRoles = configs.ironTriangle.scenarios.map((s) => scenarioAnswers[s.id]);
  const triangle = Scoring.computeRoleResult(scenarioRoles, talent.pct, picks, configs.scoring);
  const resolved = Resolve.buildTruePathResult({
    talent, triangle, picks,
    configs: { talent: configs.talent, ikigai: configs.ikigai, ironTriangle: configs.ironTriangle, truthPath: configs.truthPath }
  });
  return ReportModel.buildResultRecord({
    talent, triangle, resolved, picks,
    suggestedKeys: [],
    talentAnswers,
    scenarios: configs.ironTriangle.scenarios,
    scenarioAnswers,
    configs: { ikigai: configs.ikigai, scoring: configs.scoring, truthPath: configs.truthPath },
    meta: {
      resultId, createdAt, locale: 'en',
      attribution: { utm_source: null, utm_campaign: null, device: 'desktop' },
      profile: { firstName }
    }
  });
}

(async () => {
  for (const [firstName, profile] of Object.entries(PROFILES)) {
    const record = buildRecord(
      firstName, profile,
      'tp_v22test' + firstName.toLowerCase().padEnd(6, '0').slice(0, 6),
      '2026-10-03T09:00:00+08:00'
    );

    const share = record.ironTriangle.share;
    console.log(firstName + ': ' + record.truePath.title + ' | ' + record.talent.archetypeName +
      ' | ' + record.ironTriangle.primary + ' | shares ' +
      share.commander + '/' + share.general + '/' + share.chancellor +
      ' | alignment: ' + JSON.stringify(record.truePath.alignment));
    console.log('  pct:', JSON.stringify(record.talent.pct));

    const model = ReportModel.buildReportModel(record, configs);
    const pdf = await ReportPdf.renderReportPdf(model, { Svg }, {
      pdfmake,
      fontPath: path.join(__dirname, '..', 'fonts', 'NotoSansSC.ttf'),
      configs
    });
    const file = path.join(outDir, 'True-Path-Report-' + firstName + '-2026-10-03.pdf');
    fs.writeFileSync(file, pdf);
    console.log('  wrote', file, (pdf.length / 1024).toFixed(0) + 'KB');
  }
})();
