const { Solar } = require('lunar-javascript');
const { getQimen } = require('./api/qimen-bridge.js');

const qimen = getQimen();

function getProperChaiBuJu(solar) {
  const lunar = solar.getLunar();
  const dayGanZhi = lunar.getDayInGanZhi();
  const dayGan = dayGanZhi.charAt(0);
  const dayZhi = dayGanZhi.charAt(1);

  // 1. Find the offset to the nearest previous Jia or Ji day
  const ganArr = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const zhiArr = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  
  const ganIndex = ganArr.indexOf(dayGan);
  const zhiIndex = zhiArr.indexOf(dayZhi);
  
  let offsetToFuTou = 0;
  if (ganIndex >= 0 && ganIndex <= 4) {
    offsetToFuTou = ganIndex; // offset to Jia
  } else {
    offsetToFuTou = ganIndex - 5; // offset to Ji
  }

  // 2. Find the Fu Tou branch
  let fuTouZhiIndex = (zhiIndex - offsetToFuTou) % 12;
  if (fuTouZhiIndex < 0) fuTouZhiIndex += 12;
  const fuTouZhi = zhiArr[fuTouZhiIndex];

  // 3. Determine Yuan (Upper, Middle, Lower)
  let yuan = 0; // 0 = Upper, 1 = Middle, 2 = Lower
  if (['子', '午', '卯', '酉'].includes(fuTouZhi)) yuan = 0;
  else if (['寅', '申', '巳', '亥'].includes(fuTouZhi)) yuan = 1;
  else if (['辰', '戌', '丑', '未'].includes(fuTouZhi)) yuan = 2;

  // 4. Get Solar Term and its Ju numbers
  const prevJieQi = lunar.getPrevJieQi(true);
  const jieQiName = prevJieQi.getName();
  const jqData = qimen.JIEQI_JUSHU[jieQiName];
  
  const juNumber = jqData.ju[yuan];
  const yinYang = jqData.yang ? '陽' : '陰';
  
  return {
    jieQiName,
    yuanName: qimen.YUAN_NAMES[yuan],
    yuan,
    juNumber,
    yinYang,
    fuTouZhi,
    dayGanZhi
  };
}

const solarObj = Solar.fromYmdHms(1981, 2, 11, 15, 34, 0);
const lunarObj = solarObj.getLunar();
const bazi = lunarObj.getEightChar();
const yearGz = bazi.getYear();
const monthGz = bazi.getMonth();
const dayGz = bazi.getDay();
const hourGz = bazi.getTime();

const chaiBu = getProperChaiBuJu(solarObj);
console.log('Proper Chai Bu:', chaiBu);

const chart = qimen.generateQimenChart(new Date(1981, 1, 11, 15, 34), [yearGz, monthGz, dayGz, hourGz, chaiBu.juNumber, chaiBu.yinYang]);
const obj = qimen.chartToObject(chart);

// Log to see if it matches the reference chart!
console.log('QMDJ Chart Palaces:');
const luoShuOrder = [4, 9, 2, 3, 5, 7, 8, 1, 6];
luoShuOrder.forEach(id => {
  const pName = ['?', '坎/N', '坤/SW', '震/E', '巽/SE', '中/C', '乾/NW', '兌/W', '艮/NE', '離/S'][id];
  const earth = obj['地盤'][id-1];
  const heaven = obj['天盤'][id-1];
  const star = obj['九星'][id-1];
  const door = obj['天門'][id-1];
  const god = obj['八神'][id-1];
  console.log(`  ${pName} (${id}): God: ${god}, Heaven: ${heaven}, Earth: ${earth}, Star: ${star}, Door: ${door}`);
});
