const qimen = require('qimen-dunjia');
console.log('Keys:', Object.keys(qimen));

if (qimen.generateChartByDatetime) {
    const chart = qimen.generateChartByDatetime('2024011510');
    console.log(JSON.stringify(qimen.chartToObject(chart), null, 2));
} else {
    // maybe try to see what's in default
    console.log(qimen);
}
