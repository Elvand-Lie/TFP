const qimen = require('qimen-dunjia');
const chartRaw = qimen.generateQimenChart(new Date(2024, 0, 1), ['??', '??', '??', '??', 2, '?']);
const chart = qimen.chartToObject(chartRaw);
console.log('Doors:', chart['??'] || chart['??'] || chart['??']);
