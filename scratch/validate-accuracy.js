/**
 * Accuracy Validation Script
 * ─────────────────────────
 * Cross-references our BaZi calculations against lunar-javascript's
 * built-in data to verify the Useful God / Harmful God logic.
 *
 * The red/white rule:
 *   - Strong DM → needs draining elements (Output/Wealth/Power) → those years = RED
 *   - Weak DM   → needs supportive elements (Resource/Companion) → those years = RED
 *   - Opposite elements → WHITE
 *   - Balanced   → no bias, neutral
 */

const { Solar, LunarUtil } = require('lunar-javascript');

// ─── CONSTANTS ───
const STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

const STEM_ELEMENT = {
  '甲':'Wood','乙':'Wood','丙':'Fire','丁':'Fire','戊':'Earth','己':'Earth',
  '庚':'Metal','辛':'Metal','壬':'Water','癸':'Water'
};

const HIDDEN_STEMS_MAP = {
  '子':['癸'], '丑':['己','癸','辛'], '寅':['甲','丙','戊'], '卯':['乙'],
  '辰':['戊','乙','癸'], '巳':['丙','庚','戊'], '午':['丁','己'], '未':['己','丁','乙'],
  '申':['庚','壬','戊'], '酉':['辛'], '戌':['戊','辛','丁'], '亥':['壬','甲']
};

const ELEMENT_CYCLE = ['Wood','Fire','Earth','Metal','Water'];

const produces = {'Wood':'Fire','Fire':'Earth','Earth':'Metal','Metal':'Water','Water':'Wood'};
const controls = {'Wood':'Earth','Earth':'Water','Water':'Fire','Fire':'Metal','Metal':'Wood'};

function getUsefulGod(dmStem, chartStems, chartBranches, monthBranch) {
  const dmElement = STEM_ELEMENT[dmStem];
  
  // Collect all elements present
  const elementCounts = {Wood:0, Fire:0, Earth:0, Metal:0, Water:0};
  
  // Count stems
  chartStems.forEach(s => { elementCounts[STEM_ELEMENT[s]]++; });
  // Count hidden stems from branches
  chartBranches.forEach(b => {
    (HIDDEN_STEMS_MAP[b] || []).forEach(h => { elementCounts[STEM_ELEMENT[h]] += 0.5; });
  });
  
  // Month branch seasonal boost
  const MONTH_SEASON = {
    '寅':'Wood','卯':'Wood','辰':'Earth','巳':'Fire','午':'Fire','未':'Earth',
    '申':'Metal','酉':'Metal','戌':'Earth','亥':'Water','子':'Water','丑':'Earth'
  };
  const seasonElement = MONTH_SEASON[monthBranch];
  if (seasonElement) elementCounts[seasonElement] += 2;
  
  // Companion element = same as DM
  const companionElem = dmElement;
  // Resource element = what produces DM
  const resourceElem = Object.keys(produces).find(k => produces[k] === dmElement);
  // Output = what DM produces
  const outputElem = produces[dmElement];
  // Wealth = what DM controls  
  const wealthElem = controls[dmElement];
  // Power = what controls DM
  const powerElem = Object.keys(controls).find(k => controls[k] === dmElement);
  
  const supportive = elementCounts[companionElem] + elementCounts[resourceElem];
  const draining = elementCounts[outputElem] + elementCounts[wealthElem] + elementCounts[powerElem];
  const total = supportive + draining;
  const supportPct = (supportive / total) * 100;
  
  let structure, usefulGod, harmfulGod;
  
  if (supportPct > 55) {
    structure = 'Strong';
    // Strong DM needs draining → pick the strongest draining element
    const drainElements = [outputElem, wealthElem, powerElem];
    usefulGod = drainElements.sort((a,b) => elementCounts[b] - elementCounts[a])[0];
    harmfulGod = [companionElem, resourceElem].sort((a,b) => elementCounts[b] - elementCounts[a])[0];
  } else if (supportPct < 45) {
    structure = 'Weak';
    usefulGod = [companionElem, resourceElem].sort((a,b) => elementCounts[b] - elementCounts[a])[0];
    harmfulGod = [outputElem, wealthElem, powerElem].sort((a,b) => elementCounts[b] - elementCounts[a])[0];
  } else {
    structure = 'Balanced';
    usefulGod = '';
    harmfulGod = '';
  }
  
  return { structure, usefulGod, harmfulGod, dmElement, supportPct: supportPct.toFixed(1), elementCounts };
}

// ─── TEST CASES ───
const testCases = [
  { label: 'Test 1: Male born 1990-12-31 06:30', year: 1990, month: 12, day: 31, hour: 6, gender: 1 },
  { label: 'Test 2: Female born 1985-07-15 14:00', year: 1985, month: 7, day: 15, hour: 14, gender: 0 },
  { label: 'Test 3: Male born 2000-01-01 00:00', year: 2000, month: 1, day: 1, hour: 0, gender: 1 },
  { label: 'Test 4: Female born 1975-03-20 08:00', year: 1975, month: 3, day: 20, hour: 8, gender: 0 },
];

testCases.forEach(tc => {
  const solar = Solar.fromYmdHms(tc.year, tc.month, tc.day, tc.hour, 0, 0);
  const lunar = solar.getLunar();
  const bazi = lunar.getEightChar();
  
  const dmStem = bazi.getDayGan();
  const chartStems = [bazi.getYearGan(), bazi.getMonthGan(), bazi.getDayGan(), bazi.getTimeGan()];
  const chartBranches = [bazi.getYearZhi(), bazi.getMonthZhi(), bazi.getDayZhi(), bazi.getTimeZhi()];
  
  const result = getUsefulGod(dmStem, chartStems, chartBranches, bazi.getMonthZhi());
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${tc.label}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Four Pillars: ${chartStems[0]}${chartBranches[0]} ${chartStems[1]}${chartBranches[1]} ${chartStems[2]}${chartBranches[2]} ${chartStems[3]}${chartBranches[3]}`);
  console.log(`Day Master: ${dmStem} (${result.dmElement})`);
  console.log(`Support %: ${result.supportPct}%`);
  console.log(`Structure: ${result.structure}`);
  console.log(`Element Distribution:`, result.elementCounts);
  
  if (result.usefulGod) {
    console.log(`\n🟥 Useful God (RED/auspicious): ${result.usefulGod}`);
    console.log(`⬜ Harmful God (WHITE/inauspicious): ${result.harmfulGod}`);
    
    // Show 10 years of annual luck coloring
    console.log(`\n  Annual Luck Preview (2025-2034):`);
    for (let y = 2025; y <= 2034; y++) {
      const annSolar = Solar.fromYmdHms(y, 7, 1, 0, 0, 0);
      const annBazi = annSolar.getLunar().getEightChar();
      const annStem = annBazi.getYear().charAt(0);
      const annBranch = annBazi.getYear().charAt(1);
      const annElement = STEM_ELEMENT[annStem];
      
      let color = '  ';
      if (annElement === result.usefulGod) color = '🟥';
      else if (annElement === result.harmfulGod) color = '⬜';
      else color = '🔸';
      
      console.log(`    ${color} ${y}: ${annStem}${annBranch} (${annElement})`);
    }
  } else {
    console.log(`\n  Balanced chart → no red/white differentiation (all neutral)`);
  }
});
