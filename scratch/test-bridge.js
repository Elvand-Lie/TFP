const { getQimen } = require('../api/qimen-bridge.js');

const qimen = getQimen();
console.log('Bridge loaded. Has generateChartByDatetime:', typeof qimen.generateChartByDatetime);

const chart = qimen.generateChartByDatetime('1990123106');
const obj = qimen.chartToObject(chart);
console.log('Solar Term:', obj['節氣']);
console.log('Ju:', obj['陰陽'], obj['局數']);
console.log('Zhi Fu:', obj['值符']);
console.log('Zhi Shi:', obj['值使']);
console.log('Stars:', obj['九星']);
