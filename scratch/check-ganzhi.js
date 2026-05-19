const { Solar } = require('lunar-javascript');
const d = Solar.fromYmdHms(2024, 1, 15, 10, 0, 0);
const lunar = d.getLunar();
const bazi = lunar.getEightChar();
console.log(bazi.getYear(), bazi.getMonth(), bazi.getDay(), bazi.getTime());
