/* v2.3 final deliverables: render every required profile through the production HTML pipeline. */
const path = require('path');
const fs = require('fs');
const Config = require('../true-path/lib/config.js');
const Scoring = require('../true-path/lib/scoring.js');
const Resolve = require('../true-path/lib/trupath.js');
const ReportModel = require('../true-path/lib/report-model.js');
const ReportHtml = require('../true-path/lib/report-html.js');
const puppeteer = require('puppeteer-core');

const configs = Config.build(require('../true-path/config/true-path.config.json'));
const outDir = path.join(__dirname, '..', '.v23');
fs.mkdirSync(outDir, { recursive: true });

const ik = (e, g, ec, im) => ({ energises: e, goodAt: g, economicValue: ec, impact: im });
const PROFILES = {
  // Jose He — 4 Oct acceptance profile (nearest reproducible triangle, see hand-off note).
  'Jose He': {
    talent: [5, 4, 5, 1, 1, 2, 5, 5, 4, 1, 2, 2],
    ikigai: ik(['leading_influencing', 'teaching_sharing'], ['communication', 'leadership'], ['education_training', 'consulting_advisory'], ['help_people_find_direction', 'inspire_others']),
    scenarios: ['commander', 'commander', 'general', 'general', 'general', 'general']
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
  // Edge: lowest talent >= 65 (A2 hidden, quick win from A3).
  'High-Floor': {
    talent: [5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 4, 5],
    ikigai: ik(['teaching_sharing'], ['communication'], ['business_entrepreneurship'], ['help_people_find_direction']),
    scenarios: ['commander', 'commander', 'commander', 'commander', 'commander', 'commander']
  },
  // Edge: balanced Iron Triangle.
  'Balanced-Triangle': {
    talent: [4, 4, 4, 4, 5, 5, 4, 4, 3, 3, 4, 4],
    // Neutral Ikigai (no tagged picks) is the path that yields a truly balanced triangle.
    ikigai: ik([], [], [], []),
    scenarios: ['commander', 'commander', 'general', 'general', 'chancellor', 'chancellor']
  },
  // Edge: all-low talent (all 1s).
  'All-Low': {
    talent: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ikigai: ik(['teaching_sharing'], ['communication'], ['business_entrepreneurship'], ['help_people_find_direction']),
    scenarios: ['commander', 'commander', 'commander', 'commander', 'commander', 'commander']
  },
  // Edge: tied-lowest talent (analyst + creative tie for lowest).
  'Tied-Lowest': {
    talent: [5, 5, 5, 1, 1, 2, 5, 5, 5, 1, 2, 1],
    ikigai: ik(['leading_influencing'], ['communication'], ['education_training'], ['help_people_find_direction']),
    scenarios: ['commander', 'commander', 'commander', 'commander', 'commander', 'commander']
  },
  // Long-content profile.
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
    meta: { resultId: 'tp_v23' + name.toLowerCase().replace(/[^a-z]/g, '').padEnd(6, '0').slice(0, 6), createdAt: '2026-10-05T09:00:00+08:00', locale: 'en', attribution: { utm_source: null, utm_campaign: null, device: 'desktop' }, profile: { firstName: name } }
  });
  return { model: ReportModel.buildReportModel(record, configs), triangle };
}

(async () => {
  const results = [];
  for (const [name, profile] of Object.entries(PROFILES)) {
    const { model, triangle } = build(name, profile);
    const html = ReportHtml.buildReportHtml(model, { firstName: name, reportDate: '5 October 2026', resultId: model.resultId }, {});
    const htmlPath = path.join(outDir, name + '.html');
    fs.writeFileSync(htmlPath, html);
    const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    fs.writeFileSync(path.join(outDir, name + '.pdf'), pdf);
    await browser.close();
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.load(pdf);
    const pages = doc.getPageCount();
    const s = triangle.shares || triangle.share;
    const pair = model.pages[0].blocks.find(b => b.kind === 'pair');
    const cards = model.pages[3].blocks.filter(b => b.kind === 'watch-card').map(c => c.number + ':' + (c.talent || c.title));
    results.push({ name, pages, shares: s, pattern: pair.archetypeHeading, cards, quickWin: model.pages[3].quickWin });
    console.log(`${name}: pages=${pages} shares=${s.commander}/${s.general}/${s.chancellor} archetype=${pair.archetypeHeading} cards=[${cards.join(' | ')}] quickWin="${model.pages[3].quickWin}"`);
  }
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(results, null, 1));
  console.log('summary written');
})();
