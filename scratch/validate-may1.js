const { getQimen } = require('../api/qimen-bridge.js');
const { Solar } = require('lunar-javascript');

const qimen = getQimen();

// May 1, 2026, Hour 00 (子時 Zi hour)
const chart = qimen.generateChartByDatetime('2026050100');
const obj = qimen.chartToObject(chart);

console.log('=== QMDJ Validation: 2026-05-01 00:00 ===\n');
console.log('Solar Term (節氣):', obj['節氣']);
console.log('San Yuan (三元):', obj['三元']);
console.log('Yin/Yang (陰陽):', obj['陰陽']);
console.log('Ju (局數):', obj['局數']);
console.log('Xun Head (旬首):', obj['旬首']);
console.log('Fu Head (符首):', obj['符首']);
console.log('Zhi Fu (值符):', obj['值符'], '→ falls in:', obj['值符落宮']);
console.log('Zhi Shi (值使):', obj['值使'], '→ falls in:', obj['值使落宮']);
console.log('Time Stem (時干):', obj['時干']);
console.log('Fly Step (飛步):', obj['飛步']);

console.log('\n--- GanZhi Pillars ---');
console.log('Year:', obj['年柱']);
console.log('Month:', obj['月柱']);
console.log('Day:', obj['日柱']);
console.log('Hour:', obj['時柱']);

console.log('\n--- 9 Palaces (Luo Shu order: 4,9,2 / 3,5,7 / 8,1,6) ---');
const names = ['巽(SE/4)', '離(S/9)', '坤(SW/2)', '震(E/3)', '中(C/5)', '兌(W/7)', '艮(NE/8)', '坎(N/1)', '乾(NW/6)'];
for (let i = 0; i < 9; i++) {
  console.log(`  ${names[i]}:`);
  console.log(`    Star: ${obj['九星'][i]}  |  Door: ${obj['天門'][i] || obj['地門'][i]}  |  God: ${obj['八神'][i]}`);
  console.log(`    Earth: ${obj['地盤'][i]}  |  Heaven: ${obj['天盤'][i]}`);
}

// Cross-check: Verify Solar Term from lunar-javascript
const solar = Solar.fromYmdHms(2026, 5, 1, 0, 0, 0);
const lunar = solar.getLunar();
console.log('\n--- Cross-check (lunar-javascript) ---');
console.log('JieQi:', lunar.getJieQi());
console.log('Day GanZhi:', lunar.getDayInGanZhi());
console.log('Hour GanZhi:', lunar.getTimeInGanZhi());
