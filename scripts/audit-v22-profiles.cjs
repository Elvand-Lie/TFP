/* Final v2.2 audit: generate the dynamic profile matrix through the production HTML renderer. */
const path = require('path');
const fs = require('fs');
const Config = require('../true-path/lib/config.js');
const Scoring = require('../true-path/lib/scoring.js');
const Resolve = require('../true-path/lib/trupath.js');
const ReportModel = require('../true-path/lib/report-model.js');
const ReportHtml = require('../true-path/lib/report-html.js');
const puppeteer = require('puppeteer-core');

const configs = Config.build(require('../true-path/config/true-path.config.json'));
const outDir = path.join(__dirname, '..', '.audit');
fs.mkdirSync(outDir, { recursive: true });

const ik = (energises, goodAt, economicValue, impact) => ({ energises, goodAt, economicValue, impact });
const PROFILES = {
  Jose: {
    talent: [4, 4, 5, 4, 4, 4, 5, 5, 4, 5, 5, 5],
    ikigai: ik(['leading_influencing', 'teaching_sharing', 'helping_transform'], ['communication', 'empathy', 'leadership'], ['education_training', 'consulting_advisory', 'personal_growth_coaching'], ['help_people_find_direction', 'inspire_others', 'teach_wisdom']),
    scenarios: ['commander', 'commander', 'commander', 'commander', 'commander', 'commander']
  },
  Yvonne: {
    talent: [5, 4, 4, 3, 4, 3, 2, 3, 2, 2, 2, 3],
    ikigai: ik(['building_creating_projects', 'solving_problems'], ['planning', 'analysis', 'execution'], ['operations_management', 'technology_systems'], ['build_systems_efficiency', 'help_people_navigate_change']),
    scenarios: ['chancellor', 'chancellor', 'general', 'chancellor', 'chancellor', 'chancellor']
  },
  Kelvin: {
    talent: [2, 3, 2, 2, 2, 3, 5, 4, 5, 4, 4, 4],
    ikigai: ik(['designing_imagining'], ['creativity', 'communication'], ['business_entrepreneurship', 'sales_influence', 'creative_work'], ['build_wealth_freedom', 'create_innovation']),
    scenarios: ['general', 'commander', 'general', 'general', 'commander', 'general']
  },
  'Balanced-Talent': {
    talent: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    ikigai: ik(['teaching_sharing'], ['communication'], ['business_entrepreneurship'], ['help_people_find_direction']),
    scenarios: ['commander', 'commander', 'commander', 'commander', 'commander', 'commander']
  },
  'Dual-Triangle': {
    talent: [5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3],
    ikigai: ik(['leading_influencing'], ['strategy'], ['operations_management'], ['help_people_navigate_change']),
    scenarios: ['commander', 'commander', 'general', 'general', 'commander', 'general']
  },
  'Balanced-Triangle': {
    talent: [4, 4, 4, 4, 5, 5, 4, 4, 3, 3, 4, 4],
    ikigai: ik(['teaching_sharing'], ['planning'], ['consulting_advisory'], ['help_businesses_grow']),
    scenarios: ['commander', 'general', 'chancellor', 'commander', 'general', 'chancellor']
  },
  'Long-Content': {
    talent: [5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5],
    ikigai: ik(['leading_influencing', 'teaching_sharing', 'helping_transform', 'designing_imagining'], ['communication', 'leadership', 'creativity'], ['education_training', 'consulting_advisory', 'personal_growth_coaching', 'business_entrepreneurship'], ['help_people_find_direction', 'inspire_others', 'teach_wisdom', 'create_innovation']),
    scenarios: ['commander', 'commander', 'commander', 'general', 'commander', 'commander']
  }
};

function build(name, profile) {
  const ta = {}; profile.talent.forEach((v, i) => { ta['Q' + (i + 1)] = v; });
  const sa = {}; profile.scenarios.forEach((r, i) => { sa['S' + (i + 1)] = r; });
  const picks = [];
  [['I-1', 'energises'], ['I-2', 'goodAt'], ['I-3', 'economicValue'], ['I-4', 'impact']].forEach(([screenId, field]) => {
    profile.ikigai[field].forEach((key) => picks.push({ screenId, key, fromSuggestion: false }));
  });
  const talent = Scoring.scoreTalent(ta, configs.talent);
  const triangle = Scoring.computeRoleResult(profile.scenarios, talent.pct, picks, configs.scoring);
  const resolved = Resolve.buildTruePathResult({ talent, triangle, picks, configs: { talent: configs.talent, ikigai: configs.ikigai, ironTriangle: configs.ironTriangle, truthPath: configs.truthPath } });
  const record = ReportModel.buildResultRecord({
    talent, triangle, resolved, picks, suggestedKeys: [], talentAnswers: ta,
    scenarios: configs.ironTriangle.scenarios, scenarioAnswers: sa,
    configs: { ikigai: configs.ikigai, scoring: configs.scoring, truthPath: configs.truthPath },
    meta: { resultId: 'tp_audit' + name.toLowerCase().padEnd(6, '0').slice(0, 6), createdAt: '2026-10-04T09:00:00+08:00', locale: 'en', attribution: { utm_source: null, utm_campaign: null, device: 'desktop' }, profile: { firstName: name } }
  });
  return ReportModel.buildReportModel(record, configs);
}

(async () => {
  const puppeteerLauncher = { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] };
  for (const [name, profile] of Object.entries(PROFILES)) {
    const model = build(name, profile);
    const rc = model.pages[2].blocks.find(b => b.kind === 'role-card');
    const summary = `title=${model.pages[2].blocks.find(b => b.kind === 'title').title} | archetype=${rc.name}/${rc.subtitle} | pattern=${model.pages[0].blocks.find(b => b.kind === 'pair').archetypeHeading}`;
    const html = ReportHtml.buildReportHtml(model, { firstName: name, reportDate: '4 October 2026', resultId: 'tp_audit' + name.toLowerCase() });
    fs.writeFileSync(path.join(outDir, name + '.html'), html);
    const browser = await puppeteer.launch(puppeteerLauncher);
    const page = await browser.newPage();
    await page.goto('file:///' + path.join(outDir, name + '.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    fs.writeFileSync(path.join(outDir, name + '.pdf'), pdf);
    // count pages via pdf header heuristic: count /Type /Page occurrences (not /Pages)
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    await browser.close();
    console.log(`${name}: ${summary} | pages=${pages} | ${pdf.length} bytes`);
  }
})();
