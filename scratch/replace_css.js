const fs = require('fs');
const cssPath = 'c:/TFP/assets/bazi.css';
let css = fs.readFileSync(cssPath, 'utf8');

const targetStr = \.qmdj-palace {
  background: rgba(15,15,16,0.85);
  padding: 20px 14px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: stretch;
  transition: background 0.3s, box-shadow 0.3s;
  position: relative;
  min-height: 180px;
}
.qmdj-palace:hover {
  background: rgba(28,28,30,0.9);
}

.qmdj-col-left {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-start;
  padding-bottom: 6px;
}
.qmdj-col-center {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
}
.qmdj-col-right {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-end;
  padding-top: 6px;
}\;

const replacement = \.qmdj-palace {
  background: rgba(15,15,16,0.85);
  padding: 16px 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: background 0.3s, box-shadow 0.3s;
  position: relative;
  min-height: 180px;
}
.qmdj-palace:hover {
  background: rgba(28,28,30,0.9);
}

.qmdj-palace-inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  grid-template-rows: auto auto auto;
  gap: 12px 16px;
  width: 100%;
  align-items: center;
}\;

css = css.replace(targetStr.replace(/\r/g, ''), replacement);
fs.writeFileSync(cssPath, css);
console.log('Replaced qmdj-palace');
