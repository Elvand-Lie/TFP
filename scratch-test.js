const { Solar } = require('lunar-javascript');
const solar = Solar.fromYmdHms(2026, 5, 1, 12, 0, 0);
const lunar = solar.getLunar();

try {
  // Let's check how QMDJ is available
  console.log("Keys on lunar.getEightChar():", Object.keys(Object.getPrototypeOf(lunar.getEightChar())));
  
  const lunarJS = require('lunar-javascript');
  console.log("Exports of lunar-javascript:", Object.keys(lunarJS));
  
  // Try to use QiMen
  const LunarUtil = lunarJS.LunarUtil;
  console.log("LunarUtil keys:", Object.keys(LunarUtil).filter(k => k.toLowerCase().includes('qi')));
  
  // In 6tail/lunar-javascript, it's usually `const qimen = QiMen.fromSolar(solar)` or similar?
  // Let's check lunarJS for QiMen classes
  const classes = Object.keys(lunarJS).filter(k => typeof lunarJS[k] === 'function');
  console.log("Classes:", classes);

} catch (e) {
  console.error(e);
}
