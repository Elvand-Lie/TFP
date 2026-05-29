const fs = require('fs');
const cssPath = 'c:/TFP/assets/bazi.css';
let css = fs.readFileSync(cssPath, 'utf8');

// I will just append the needed CSS at the end and make sure they are highly specific to override anything.
// But first I should restore the deleted zhifu highlight and direction label text.
const restoreCSS = \
.qmdj-direction {
  letter-spacing: 0.1em;
  color: var(--muted);
  text-transform: uppercase;
}
.qmdj-palace.zhifu-palace {
  background: rgba(113,1,1,0.18);
  box-shadow: inset 0 0 0 1px rgba(229,57,57,0.35);
}

.qmdj-star {
  grid-column: 1;
  grid-row: 3;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--beige);
  justify-self: flex-start;
}

.qmdj-god {
  grid-column: 3;
  grid-row: 1;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--gold);
  justify-self: flex-end;
}

/* Center Column Elements */
.qmdj-heaven {
  grid-column: 2;
  grid-row: 1;
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1;
  justify-self: center;
}

.qmdj-door-box {
  grid-column: 2;
  grid-row: 2;
  font-size: 1.2rem;
  font-weight: 700;
  border: 1px solid rgba(198,169,107,0.4);
  padding: 6px 8px;
  background: rgba(198,169,107,0.05);
  border-radius: 2px;
  line-height: 1;
  justify-self: center;
}

.qmdj-earth {
  grid-column: 2;
  grid-row: 3;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1;
  opacity: 0.8;
  justify-self: center;
}
\;

fs.appendFileSync(cssPath, restoreCSS);
console.log('Appended layout grid CSS');
