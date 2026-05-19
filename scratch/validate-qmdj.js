const qimen = require('qimen-dunjia');
const chartRaw = qimen.generateChartByDatetime('2023122200'); // Dec 22, 2023, Midnight (Jia Zi hour perhaps?)
const chart = qimen.chartToObject(chartRaw);
console.log(JSON.stringify({
  ju: chart['局數'],
  zhifu: chart['值符'],
  zhishi: chart['值使'],
  stars: chart['九星'],
  doors: chart['天門']
}, null, 2));
