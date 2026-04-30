// ─── BAZI CALCULATOR JS ───────────────────────
const HIDDEN_STEMS = {
  '子': [{char:'癸',name:'Gui',el:'Water'}],
  '丑': [{char:'己',name:'Ji',el:'Earth'},{char:'癸',name:'Gui',el:'Water'},{char:'辛',name:'Xin',el:'Metal'}],
  '寅': [{char:'甲',name:'Jia',el:'Wood'},{char:'丙',name:'Bing',el:'Fire'},{char:'戊',name:'Wu',el:'Earth'}],
  '卯': [{char:'乙',name:'Yi',el:'Wood'}],
  '辰': [{char:'戊',name:'Wu',el:'Earth'},{char:'乙',name:'Yi',el:'Wood'},{char:'癸',name:'Gui',el:'Water'}],
  '巳': [{char:'丙',name:'Bing',el:'Fire'},{char:'庚',name:'Geng',el:'Metal'},{char:'戊',name:'Wu',el:'Earth'}],
  '午': [{char:'丁',name:'Ding',el:'Fire'},{char:'己',name:'Ji',el:'Earth'}],
  '未': [{char:'己',name:'Ji',el:'Earth'},{char:'丁',name:'Ding',el:'Fire'},{char:'乙',name:'Yi',el:'Wood'}],
  '申': [{char:'庚',name:'Geng',el:'Metal'},{char:'壬',name:'Ren',el:'Water'},{char:'戊',name:'Wu',el:'Earth'}],
  '酉': [{char:'辛',name:'Xin',el:'Metal'}],
  '戌': [{char:'戊',name:'Wu',el:'Earth'},{char:'辛',name:'Xin',el:'Metal'},{char:'丁',name:'Ding',el:'Fire'}],
  '亥': [{char:'壬',name:'Ren',el:'Water'},{char:'甲',name:'Jia',el:'Wood'}]
};

function getElementClass(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('wood')) return 'el-wood';
  if (n.includes('fire')) return 'el-fire';
  if (n.includes('earth')) return 'el-earth';
  if (n.includes('metal')) return 'el-metal';
  if (n.includes('water')) return 'el-water';
  return '';
}

function getElementBgClass(name) {
  return getElementClass(name).replace('el-', 'el-bg-');
}

function getHiddenElement(char) {
  const map = {'甲':'Wood','乙':'Wood','丙':'Fire','丁':'Fire','戊':'Earth','己':'Earth','庚':'Metal','辛':'Metal','壬':'Water','癸':'Water'};
  return map[char] || '';
}

function extractElement(stemName) {
  if (!stemName) return '';
  const parts = stemName.split(' ');
  return parts.length > 1 ? parts[1] : parts[0];
}

function populateForm() {
  const yearSel = document.getElementById('birth-year');
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= 1900; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  }
  yearSel.value = currentYear;

  const monthSel = document.getElementById('birth-month');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  months.forEach((m,i) => {
    const o = document.createElement('option');
    o.value = i+1; o.textContent = m;
    monthSel.appendChild(o);
  });
  monthSel.value = new Date().getMonth() + 1;

  const daySel = document.getElementById('birth-day');
  for (let d = 1; d <= 31; d++) {
    const o = document.createElement('option');
    o.value = d; o.textContent = d;
    daySel.appendChild(o);
  }
  daySel.value = new Date().getDate();

  const hourSel = document.getElementById('birth-hour');
  for (let h = 0; h < 24; h++) {
    const o = document.createElement('option');
    o.value = h; o.textContent = h.toString().padStart(2,'0');
    hourSel.appendChild(o);
  }

  const minSel = document.getElementById('birth-minute');
  for (let m = 0; m < 60; m++) {
    const o = document.createElement('option');
    o.value = m; o.textContent = m.toString().padStart(2,'0');
    minSel.appendChild(o);
  }
}

function setupEventListeners() {
  const unknownTime = document.getElementById('time-unknown');
  unknownTime.addEventListener('change', function() {
    document.getElementById('birth-hour').disabled = this.checked;
    document.getElementById('birth-minute').disabled = this.checked;
  });

  document.getElementById('btn-reset').addEventListener('click', resetForm);
  document.getElementById('bazi-input-form').addEventListener('submit', handleSubmit);
}

function resetForm() {
  document.getElementById('bazi-input-form').reset();
  document.getElementById('birth-hour').disabled = false;
  document.getElementById('birth-minute').disabled = false;
  document.getElementById('bazi-chart').classList.remove('active');
  document.getElementById('error-msg').classList.remove('active');
  window.scrollTo({ top: document.getElementById('bazi-form-section').offsetTop - 100, behavior: 'smooth' });
}

async function handleSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('error-msg');
  const loader = document.getElementById('loading');
  const chartEl = document.getElementById('bazi-chart');

  errEl.classList.remove('active');
  chartEl.classList.remove('active');
  loader.classList.add('active');
  document.getElementById('btn-submit').disabled = true;

  const timeUnknown = document.getElementById('time-unknown').checked;
  const targetYearEl = document.getElementById('target-year');
  const payload = {
    year: parseInt(document.getElementById('birth-year').value),
    month: parseInt(document.getElementById('birth-month').value),
    day: parseInt(document.getElementById('birth-day').value),
    hour: timeUnknown ? 12 : parseInt(document.getElementById('birth-hour').value),
    minute: timeUnknown ? 0 : parseInt(document.getElementById('birth-minute').value),
    gender: parseInt(document.querySelector('input[name="gender"]:checked')?.value || '1'),
    target_year: targetYearEl ? parseInt(targetYearEl.value) : new Date().getFullYear()
  };

  try {
    const resp = await fetch('/api/bazi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Calculation failed');
    renderChart(data, payload);
  } catch (err) {
    errEl.textContent = 'Error: ' + err.message;
    errEl.classList.add('active');
  } finally {
    loader.classList.remove('active');
    document.getElementById('btn-submit').disabled = false;
  }
}

function renderChart(data, input) {
  const fp = data.four_pillars;
  const name = document.getElementById('client-name').value || 'Client';
  const genderText = input.gender === 1 ? 'Male' : 'Female';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateStr = `${input.day} ${months[input.month-1]} ${input.year} (${input.hour.toString().padStart(2,'0')}:${input.minute.toString().padStart(2,'0')})`;

  // Day Master
  const dm = fp.day_pillar.heavenly_stem;
  document.getElementById('summary-name').textContent = name;
  document.getElementById('summary-info').textContent = `${dateStr}  |  ${genderText}`;
  document.getElementById('dm-char').textContent = dm.character;
  document.getElementById('dm-char').className = 'day-master-char ' + getElementClass(dm.name);
  
  // Display Day Master Name and Main Structure
  const mainStructStr = data.analysis && data.analysis.main_structure ? `  |  Structure: ${data.analysis.main_structure}` : '';
  document.getElementById('dm-name').textContent = `${dm.spelling.charAt(0).toUpperCase()+dm.spelling.slice(1)} · ${dm.name}${mainStructStr}`;

  // Auxiliary Info
  const aux = data.analysis ? data.analysis.auxiliary : null;
  const auxEl = document.getElementById('auxiliary-info');
  if (auxEl && aux) {
    auxEl.innerHTML = `Tai Yuan (Conception): <span style="color:var(--gold)">${aux.tai_yuan}</span> | Ming Gong (Life Palace): <span style="color:var(--gold)">${aux.ming_gong}</span><br>
                       Death & Emptiness (Kong Wang): Day <span style="color:var(--gold)">${aux.kong_wang_day}</span>, Year <span style="color:var(--gold)">${aux.kong_wang_year}</span>`;
  }

  // Four Pillars
  const pillars = [
    { key: 'hour_pillar', data: fp.hour_pillar },
    { key: 'day_pillar', data: fp.day_pillar },
    { key: 'month_pillar', data: fp.month_pillar },
    { key: 'year_pillar', data: fp.year_pillar }
  ];

  pillars.forEach(p => {
    const hs = p.data.heavenly_stem;
    const eb = p.data.earthly_branch;
    const prefix = p.key.replace('_pillar','');
    const naYin = p.data.na_yin || '';

    // Stem
    const stemEl = document.getElementById(`${prefix}-stem`);
    let tenGodHtml = '';
    // Don't show Ten God for Day Master stem (Day Pillar)
    if (prefix !== 'day' && hs.ten_god) {
      tenGodHtml = `<div class="fp-ten-god" style="font-size: 0.7rem; color: var(--gold); letter-spacing: 0.05em; margin-bottom: 4px;">${hs.ten_god.chinese} ${hs.ten_god.short}</div>`;
    }
    
    stemEl.innerHTML = `
      ${tenGodHtml}
      <div class="fp-char ${getElementClass(hs.name)}">${hs.character}</div>
      <div class="fp-pinyin">${hs.spelling.charAt(0).toUpperCase()+hs.spelling.slice(1)}</div>
      <div class="fp-element ${getElementBgClass(hs.name)}">${hs.name}</div>
    `;

    // Branch
    const branchEl = document.getElementById(`${prefix}-branch`);
    branchEl.innerHTML = `
      <div class="fp-char ${getElementClass(eb.name)}">${eb.character}</div>
      <div class="fp-pinyin">${eb.spelling.charAt(0).toUpperCase()+eb.spelling.slice(1)}</div>
      <div class="fp-animal">${eb.name}</div>
      <div class="fp-element ${getElementBgClass(eb.name)}">${extractElement(eb.name)}</div>
    `;

    // Hidden Stems
    const hiddenEl = document.getElementById(`${prefix}-hidden`);
    const hStems = p.data.hidden_stems || [];
    hiddenEl.innerHTML = '<div class="fp-hidden">' + hStems.map(h => {
      const tg = h.ten_god ? `<div style="font-size: 0.6rem; color: var(--muted); margin-bottom: 2px;">${h.ten_god.chinese} ${h.ten_god.short}</div>` : '';
      return `<div class="fp-hidden-stem">${tg}<span class="mini-char ${getElementClass(h.element)}">${h.character}</span><span class="mini-name">${h.spelling.charAt(0).toUpperCase()+h.spelling.slice(1)}</span></div>`;
    }).join('') + '</div>';

    // Life Cycle & Na Yin & Shen Sha
    const lcEl = document.getElementById(`${prefix}-lifecycle`);
    let bottomHtml = '';
    if (p.data.life_cycle) {
      bottomHtml += `<div class="fp-lifecycle" style="color: var(--beige); font-size: 0.85rem;">${p.data.life_cycle_chinese}<br><span style="font-size: 0.7rem; color: var(--muted);">${p.data.life_cycle}</span></div>`;
    }
    if (naYin) {
      bottomHtml += `<div class="fp-nayin" style="margin-top: 6px; font-size: 0.75rem; color: var(--gold); border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">Na Yin:<br>${naYin}</div>`;
    }
    const shenSha = eb.shen_sha || [];
    if (shenSha.length > 0) {
      bottomHtml += `<div class="fp-shensha" style="margin-top: 6px; font-size: 0.7rem; color: #fff; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;"><b>Stars:</b><br>${shenSha.join('<br>')}</div>`;
    }
    lcEl.innerHTML = bottomHtml;
  });

  // Luck Pillars
  const luckContainer = document.getElementById('luck-timeline');
  luckContainer.innerHTML = '';
  const currentYear = new Date().getFullYear();
  const birthYear = input.year;

  if (data.luck_pillars && data.luck_pillars.luck_pillars) {
    data.luck_pillars.luck_pillars.forEach(lp => {
      const age = lp.age;
      const isCurrent = currentYear >= lp.year_start && currentYear <= lp.year_end;
      const card = document.createElement('div');
      card.className = 'luck-card' + (isCurrent ? ' current' : '');
      
      const hsTg = lp.heavenly_stem.ten_god ? lp.heavenly_stem.ten_god.short : '';
      const lc = lp.life_cycle ? lp.life_cycle.chinese : '';
      const hStemsHtml = (lp.hidden_stems || []).map(h => `<div style="font-size:0.75rem; letter-spacing:1px;">${h.character} <span style="color:#888; font-size:0.65rem;">${h.ten_god ? h.ten_god.short : ''}</span></div>`).join('');

      card.innerHTML = `
        <div style="font-size:0.7rem; color:var(--gold); margin-bottom:5px; min-height:14px;">${hsTg}</div>
        <div class="luck-stem-cell" style="margin-bottom:0;">
          <div class="luck-char ${getElementClass(lp.heavenly_stem.name)}">${lp.heavenly_stem.character}</div>
        </div>
        <div class="luck-branch-cell" style="margin-bottom:5px;">
          <div class="luck-char ${getElementClass(lp.earthly_branch.element)}">${lp.earthly_branch.character}</div>
        </div>
        <div style="font-size:0.65rem; color:#aaa; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; margin-bottom:4px;">${lp.na_yin || ''}</div>
        <div style="display:flex; flex-direction:column; gap:2px; height:50px; justify-content:center;">${hStemsHtml}</div>
        <div style="font-size:0.8rem; margin-top:5px; color:var(--beige);">${lc}</div>
        <div class="luck-years" style="margin-top:auto; font-size:0.75rem; color:#888; padding-top:8px;">${lp.year_start}–${lp.year_end}</div>
        <div class="luck-age" style="margin-top:2px; font-size:0.85rem; color:#fff; font-weight:600;">${isCurrent ? '▸ ' : ''}Age ${age}</div>
      `;
      luckContainer.appendChild(card);
    });
  }

  // Element Analysis
  const elements = { Wood: 0, Fire: 0, Earth: 0, Metal: 0, Water: 0 };
  if (data.analysis && data.analysis.five_factors) {
    elements.Wood = data.analysis.five_factors.WOOD || 0;
    elements.Fire = data.analysis.five_factors.FIRE || 0;
    elements.Earth = data.analysis.five_factors.EARTH || 0;
    elements.Metal = data.analysis.five_factors.METAL || 0;
    elements.Water = data.analysis.five_factors.WATER || 0;
  } else {
    // Fallback manual count if API analysis missing
    pillars.forEach(p => {
      const stemEl2 = extractElement(p.data.heavenly_stem.name);
      const branchEl2 = extractElement(p.data.earthly_branch.element);
      if (stemEl2 && elements[stemEl2] !== undefined) elements[stemEl2]++;
      const hStems = p.data.hidden_stems || [];
      hStems.forEach(h => { if (elements[h.element] !== undefined) elements[h.element]++; });
    });
  }

  // Also extract element from earthly branch name (the animal's element)
  // The branch name is like "Tiger" but the element info is in the hidden stems, already counted above

  const total = Object.values(elements).reduce((a,b) => a+b, 1);
  const icons = { Wood: '🌿', Fire: '🔥', Earth: '⛰️', Metal: '⚔️', Water: '💧' };
  const elGrid = document.getElementById('element-grid');
  if (elGrid) {
    elGrid.innerHTML = '';
    Object.entries(elements).forEach(([el, count]) => {
      const pct = Math.round((count / total) * 100);
      const card = document.createElement('div');
      card.className = 'element-card';
      card.innerHTML = `
        <div class="element-icon">${icons[el]}</div>
        <div class="element-name ${getElementClass(el)}">${el}</div>
        <div class="element-count">${count}</div>
        <div class="element-bar"><div class="element-bar-fill" style="width:${pct}%;background:var(--${el === 'Wood' ? 'forest' : el === 'Fire' ? 'crimson-text' : el === 'Earth' ? 'gold' : el === 'Metal' ? 'beige' : 'blue'})"></div></div>
      `;
      elGrid.appendChild(card);
    });
  }

  // Ten Gods Chart
  const tgGrid = document.getElementById('tengods-grid');
  if (tgGrid && data.analysis && data.analysis.ten_gods_scores) {
    tgGrid.innerHTML = '';
    const scores = data.analysis.ten_gods_scores;
    const maxScore = Math.max(...Object.values(scores), 1);
    
    // Sort gods by score descending
    const sortedGods = Object.entries(scores).sort((a,b) => b[1] - a[1]);
    
    sortedGods.forEach(([god, score]) => {
      if(score === 0) return; // Hide zero scores for cleaner UI like Louis Loh (or keep them? let's keep all to match reference but maybe gray out)
      const pct = Math.round((score / maxScore) * 100);
      tgGrid.innerHTML += `
        <div style="display:flex; align-items:center; gap:10px; font-size:0.85rem;">
          <div style="width:140px; color:var(--beige);">${god}</div>
          <div style="flex:1; background:rgba(0,0,0,0.2); height:14px; border-radius:4px; overflow:hidden;">
            <div style="height:100%; width:${pct}%; background:var(--gold);"></div>
          </div>
          <div style="width:40px; text-align:right; font-weight:600; color:#fff;">${score.toFixed(1)}</div>
        </div>
      `;
    });
  }

  // Annual Luck Matrix
  const amGrid = document.getElementById('annual-luck-matrix');
  if (amGrid && data.luck_pillars && data.luck_pillars.luck_pillars) {
    let html = '<div style="display:flex; flex-direction:column; gap:12px; min-width:800px;">';
    data.luck_pillars.luck_pillars.forEach(lp => {
      if (lp.annual_pillars && lp.annual_pillars.length > 0) {
        html += `<div style="display:flex; gap:15px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:12px;">`;
        html += `<div style="width:70px; font-size:0.85rem; color:var(--gold); display:flex; flex-direction:column; justify-content:center; align-items:center; border-right:1px solid rgba(255,255,255,0.1); padding-right:15px;">
                   <div style="color:#888;">${lp.year_start}</div>
                   <div style="font-size:1.4rem; color:white; letter-spacing:2px;">${lp.heavenly_stem.character}${lp.earthly_branch.character}</div>
                   <div>Age ${lp.age}</div>
                 </div>`;
        html += `<div style="display:flex; gap:8px; flex:1; justify-content:space-between;">`;
        lp.annual_pillars.forEach(ap => {
          const tg = ap.ten_god ? ap.ten_god.short : '';
          html += `<div style="display:flex; flex-direction:column; align-items:center; width:45px; font-size:0.85rem; background:rgba(0,0,0,0.2); padding:6px 2px; border-radius:6px;">
                     <div style="color:#aaa; font-size:0.75rem;">${ap.age}</div>
                     <div style="color:var(--gold); font-size:0.7rem; margin-bottom:4px; min-height:14px;">${tg}</div>
                     <div style="font-size:1.1rem; line-height:1.2;" class="${getElementClass(ap.ten_god ? ap.ten_god.english : '')}">${ap.stem}</div>
                     <div style="font-size:1.1rem; line-height:1.2;">${ap.branch}</div>
                     <div style="color:#666; font-size:0.7rem; margin-top:4px;">${ap.year}</div>
                   </div>`;
        });
        html += `</div></div>`;
      }
    });
    html += '</div>';
    amGrid.innerHTML = html;
  }

  // ─── JOEY YAP DESTINY METRICS RENDERING ───
  // Branch character → Animal name lookup
  const BRANCH_ANIMAL = {
    '子':'Rat','丑':'Ox','寅':'Tiger','卯':'Rabbit','辰':'Dragon','巳':'Snake',
    '午':'Horse','未':'Goat','申':'Monkey','酉':'Rooster','戌':'Dog','亥':'Pig'
  };
  const toAnimal = (ch) => BRANCH_ANIMAL[ch] || ch;
  const toAnimals = (arr) => arr ? arr.map(toAnimal).join(', ') : '';

  if (data.analysis) {
    // 1. Personal Chart Details
    const pcGrid = document.getElementById('personal-chart-details');
    if (pcGrid) {
      const yearAnimal = data.four_pillars.year_pillar.earthly_branch.name;
      const ls = data.analysis.life_star || {color:'', element:'', chinese:''};
      pcGrid.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Celestial Animal</td><td style="padding:10px 15px; color:#fff;">${yearAnimal}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Noble People</td><td style="padding:10px 15px; color:#fff;">${toAnimals(data.analysis.nobleman)}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Intelligence</td><td style="padding:10px 15px; color:#fff;">${toAnimal(data.analysis.intelligence || '')}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Peach Blossom</td><td style="padding:10px 15px; color:#fff;">${toAnimal(data.analysis.peach_blossom || '')}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Sky Horse</td><td style="padding:10px 15px; color:#fff;">${toAnimal(data.analysis.sky_horse || '')}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Solitary (Gu Chen)</td><td style="padding:10px 15px; color:#fff;">${toAnimal(data.analysis.solitary || '')}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Life Palace</td><td style="padding:10px 15px; color:#fff;">${data.analysis.auxiliary ? data.analysis.auxiliary.ming_gong : ''}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Conception</td><td style="padding:10px 15px; color:#fff;">${data.analysis.auxiliary ? data.analysis.auxiliary.tai_yuan : ''}</td></tr>
          <tr><td style="padding:10px 15px; color:var(--muted);">Life Star / Gua</td><td style="padding:10px 15px; color:#fff;">${data.analysis.life_gua} ${ls.color} ${ls.element} (${ls.chinese})</td></tr>
        </table>
      `;
    }

    // 2. 8 Mansions Directions
    const emFavorable = document.getElementById('eight-mansions-favorable');
    const emUnfavorable = document.getElementById('eight-mansions-unfavorable');
    if (emFavorable && emUnfavorable && data.analysis.eight_mansions) {
      const em = data.analysis.eight_mansions;
      // lucky: [wealth=ShengQi, health=TianYi, romance=YanNian, career=FuWei]
      // unlucky: [obstacles=HuoHai, quarrels=WuGui, setbacks=LiuSha, totalLoss=JueMing]
      const lucky = em.lucky || {};
      const unlucky = em.unlucky || {};
      emFavorable.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Sheng Qi (Life Generating)</td><td style="padding:10px 15px; color:var(--gold); font-weight:bold;">${lucky.wealth || '—'}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Tian Yi (Heavenly Doctor)</td><td style="padding:10px 15px; color:var(--gold); font-weight:bold;">${lucky.health || '—'}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Yan Nian (Longevity)</td><td style="padding:10px 15px; color:var(--gold); font-weight:bold;">${lucky.romance || '—'}</td></tr>
          <tr><td style="padding:10px 15px; color:var(--muted);">Fu Wei (Stability)</td><td style="padding:10px 15px; color:var(--gold); font-weight:bold;">${lucky.career || '—'}</td></tr>
        </table>
      `;
      emUnfavorable.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Huo Hai (Mishaps)</td><td style="padding:10px 15px; color:var(--crimson-text); font-weight:bold;">${unlucky.obstacles || '—'}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Wu Gui (Five Ghosts)</td><td style="padding:10px 15px; color:var(--crimson-text); font-weight:bold;">${unlucky.quarrels || '—'}</td></tr>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:10px 15px; color:var(--muted);">Liu Sha (Six Killings)</td><td style="padding:10px 15px; color:var(--crimson-text); font-weight:bold;">${unlucky.setbacks || '—'}</td></tr>
          <tr><td style="padding:10px 15px; color:var(--muted);">Jue Ming (Life Threatening)</td><td style="padding:10px 15px; color:var(--crimson-text); font-weight:bold;">${unlucky.totalLoss || '—'}</td></tr>
        </table>
      `;
    }

    // 3. Annual Stars
    const asTable = document.getElementById('annual-stars-table');
    if (asTable && data.analysis.annual_stars) {
      const ast = data.analysis.annual_stars;
      const renderBranchStars = (label, starData) => {
        const ausp = (starData.auspicious || []).map(s => `<div style="color:var(--gold); font-size:0.8rem; margin-bottom:3px;">★ ${s}</div>`).join('');
        const inausp = (starData.inauspicious || []).map(s => `<div style="color:var(--crimson-text, #ff6b6b); font-size:0.8rem; margin-bottom:3px;">✦ ${s}</div>`).join('');
        return `
          <div style="background:var(--card-bg); padding:15px;">
            <div style="color:var(--gold); font-size:0.75rem; margin-bottom:10px; font-weight:bold; text-transform:uppercase;">${label}</div>
            ${ausp || ''}
            ${inausp ? (ausp ? '<div style="border-top:1px solid rgba(255,255,255,0.05); margin:8px 0;"></div>' : '') + inausp : ''}
            ${!ausp && !inausp ? '<div style="font-size:0.85rem; color:var(--muted);">None</div>' : ''}
          </div>
        `;
      };
      asTable.innerHTML = `
        <div style="padding:15px; background:var(--crimson); color:#fff; font-weight:bold; text-align:center;">
          ${ast.year} (${ast.pillar}) Annual Stars
        </div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:1px; background:rgba(255,255,255,0.1);">
          ${renderBranchStars('Hour Branch', ast.hour_branch_stars)}
          ${renderBranchStars('Day Branch', ast.day_branch_stars)}
          ${renderBranchStars('Month Branch', ast.month_branch_stars)}
          ${renderBranchStars('Year Branch', ast.year_branch_stars)}
        </div>
      `;
    }

    // 4. Monthly Influence
    const miGrid = document.getElementById('monthly-influence-grid');
    if (miGrid && data.analysis.monthly_influence) {
      const monthsStr = data.analysis.monthly_influence.map(m => `
        <div style="background:var(--card-bg); padding:15px 10px; text-align:center;">
          <div style="font-size:0.7rem; color:var(--muted); margin-bottom:10px; font-weight:bold;">${new Date(m.gregorian_year, m.gregorian_month-1).toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
          <div style="font-size:0.7rem; color:var(--gold); margin-bottom:4px; min-height:14px;">${m.stem.ten_god ? m.stem.ten_god.short : ''}</div>
          <div style="font-size:1.8rem; font-weight:bold; color:#fff; line-height:1;">${m.stem.character}</div>
          <div style="font-size:1.8rem; font-weight:bold; color:var(--beige); line-height:1; margin-bottom:10px;">${m.branch.character}</div>
          <div style="display:flex; flex-direction:column; gap:4px; min-height:60px;">
            ${m.hidden_stems.map(h => `<div style="font-size:0.85rem; color:#fff;">${h.character} <span style="font-size:0.65rem; color:var(--muted);">${h.ten_god ? h.ten_god.short : ''}</span></div>`).join('')}
          </div>
        </div>
      `).join('');
      miGrid.innerHTML = monthsStr;
    }

    // 5. Profiling System
    if (data.analysis.profiling) {
      // Dominant structure group = the 5-structure with highest natal score
      const structNatal = data.analysis.profiling.structures_natal;
      const dominantStructure = Object.entries(structNatal).sort((a,b) => b[1]-a[1])[0]?.[0] || '';
      const structureEl = document.getElementById('main-structure-text');
      if (structureEl) structureEl.innerText = dominantStructure;
      
      const proGrid = document.getElementById('profiling-bars');
      if (proGrid) {
        proGrid.innerHTML = '';
        const sortedNatal = Object.entries(data.analysis.profiling.natal_percentages).sort((a,b) => b[1] - a[1]);
        sortedNatal.forEach(([god, pct]) => {
          if (pct === 0) return;
          const annPct = data.analysis.profiling.annual_percentages[god] || 0;
          proGrid.innerHTML += `
            <div style="display:flex; align-items:center; gap:10px; font-size:0.8rem;">
              <div style="width:120px; color:var(--beige);">${god}</div>
              <div style="width:30px; text-align:right; color:var(--gold);">${pct}%</div>
              <div style="flex:1; background:rgba(255,255,255,0.05); height:12px; border-radius:4px; overflow:hidden;">
                <div style="height:100%; width:${pct}%; background:var(--gold);"></div>
              </div>
              <div style="width:30px; text-align:right; color:var(--crimson-text);">${annPct}%</div>
              <div style="flex:1; background:rgba(255,255,255,0.05); height:12px; border-radius:4px; overflow:hidden;">
                <div style="height:100%; width:${annPct}%; background:var(--crimson);"></div>
              </div>
            </div>
          `;
        });
      }

      // Render Radar Chart
      const ctx = document.getElementById('profiling-radar');
      if (ctx && window.Chart) {
        // Destroy existing chart if any
        if (window.profilingChartInstance) window.profilingChartInstance.destroy();
        
        const labels = ['Creators (Output)', 'Thinkers (Resource)', 'Supporters (Influence)', 'Connectors (Companion)', 'Managers (Wealth)'];
        const pNatal = data.analysis.profiling.structures_natal;
        const pAnnual = data.analysis.profiling.structures_annual;
        
        const dataNatal = [pNatal.Creators||0, pNatal.Thinkers||0, pNatal.Supporters||0, pNatal.Connectors||0, pNatal.Managers||0];
        const dataAnnual = [pAnnual.Creators||0, pAnnual.Thinkers||0, pAnnual.Supporters||0, pAnnual.Connectors||0, pAnnual.Managers||0];

        window.profilingChartInstance = new Chart(ctx, {
          type: 'radar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Natal Chart',
              data: dataNatal,
              fill: true,
              backgroundColor: 'rgba(198, 169, 107, 0.2)',
              borderColor: 'rgba(198, 169, 107, 1)',
              pointBackgroundColor: 'rgba(198, 169, 107, 1)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgba(198, 169, 107, 1)'
            }, {
              label: 'Annual Influence',
              data: dataAnnual,
              fill: true,
              backgroundColor: 'rgba(229, 57, 57, 0.2)',
              borderColor: 'rgba(229, 57, 57, 1)',
              pointBackgroundColor: 'rgba(229, 57, 57, 1)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgba(229, 57, 57, 1)'
            }]
          },
          options: {
            scales: {
              r: {
                angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                pointLabels: { color: '#D8CFC4', font: { family: 'DM Sans', size: 11 } },
                ticks: { display: false, min: 0, max: 100 }
              }
            },
            plugins: {
              legend: { labels: { color: '#D8CFC4', font: { family: 'DM Sans' } } }
            }
          }
        });
      }
    }
  }

  // Show chart
  const chartSection = document.getElementById('bazi-chart');
  chartSection.classList.add('active');
  setTimeout(() => {
    chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  populateForm();
  setupEventListeners();
});
