/**
 * ZWDS Calculator — assets/zwds.js
 * Zi Wei Dou Shu (紫微斗数) chart calculator using iztro library.
 * Phase 1-2: natal chart + time views + flying-star interaction.
 */

(function () {
  'use strict';

  // ── IZTRO REFERENCES ──
  const iztroLib = window.iztro;
  if (!iztroLib || !iztroLib.astro) {
    console.error('iztro library not loaded');
    return;
  }
  const astro = iztroLib.astro;

  // ── NORTH-SCHOOL MUTAGEN CONFIG (北派四化) ──
  astro.config({
    mutagens: {
      甲: ['廉贞', '破军', '武曲', '太阳'],
      乙: ['天机', '天梁', '紫微', '太阴'],
      丙: ['天同', '天机', '文昌', '廉贞'],
      丁: ['太阴', '天同', '天机', '巨门'],
      戊: ['贪狼', '太阴', '右弼', '天机'],
      己: ['武曲', '贪狼', '天梁', '文曲'],
      庚: ['太阳', '武曲', '太阴', '天同'],
      辛: ['巨门', '太阳', '文曲', '文昌'],
      壬: ['天梁', '紫微', '左辅', '武曲'],
      癸: ['破军', '巨门', '太阴', '贪狼']
    }
  });

  // ── TIME INDEX MAP ──
  const TIME_OPTIONS = [
    { idx: 0, label: '早子时 (00:00–00:59)', short: '早子' },
    { idx: 1, label: '丑时 (01:00–02:59)', short: '丑' },
    { idx: 2, label: '寅时 (03:00–04:59)', short: '寅' },
    { idx: 3, label: '卯时 (05:00–06:59)', short: '卯' },
    { idx: 4, label: '辰时 (07:00–08:59)', short: '辰' },
    { idx: 5, label: '巳时 (09:00–10:59)', short: '巳' },
    { idx: 6, label: '午时 (11:00–12:59)', short: '午' },
    { idx: 7, label: '未时 (13:00–14:59)', short: '未' },
    { idx: 8, label: '申时 (15:00–16:59)', short: '申' },
    { idx: 9, label: '酉时 (17:00–18:59)', short: '酉' },
    { idx: 10, label: '戌时 (19:00–20:59)', short: '戌' },
    { idx: 11, label: '亥时 (21:00–22:59)', short: '亥' },
    { idx: 12, label: '晚子时 (23:00–23:59)', short: '晚子' }
  ];

  const UNKNOWN_TIME_INDEX = 6; // noon 午时

  // ── PALACE LAYOUT ORDER (4×4 grid, matching traditional ZWDS layout) ──
  // The earthly branches go: 寅(0) 卯(1) 辰(2) 巳(3) 午(4) 未(5) 申(6) 酉(7) 戌(8) 亥(9) 子(10) 丑(11)
  // Grid positions (row, col) for 4×4:
  //   Row 0: 巳(3) 午(4) 未(5) 申(6)
  //   Row 1: 辰(2) [center ] [center] 酉(7)
  //   Row 2: 卯(1) [center ] [center] 戌(8)
  //   Row 3: 寅(0) 丑(11) 子(10) 亥(9)
  const GRID_POSITIONS = [
    { palaceIdx: 3, row: 0, col: 0 },  // 巳
    { palaceIdx: 4, row: 0, col: 1 },  // 午
    { palaceIdx: 5, row: 0, col: 2 },  // 未
    { palaceIdx: 6, row: 0, col: 3 },  // 申
    { palaceIdx: 2, row: 1, col: 0 },  // 辰
    { palaceIdx: 7, row: 1, col: 3 },  // 酉
    { palaceIdx: 1, row: 2, col: 0 },  // 卯
    { palaceIdx: 8, row: 2, col: 3 },  // 戌
    { palaceIdx: 0, row: 3, col: 0 },  // 寅
    { palaceIdx: 11, row: 3, col: 1 }, // 丑
    { palaceIdx: 10, row: 3, col: 2 }, // 子
    { palaceIdx: 9, row: 3, col: 3 }   // 亥
  ];

  // ── DOM ELEMENTS ──
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const form = $('#zwds-input-form');
  const calSolarRadio = $('#cal-solar');
  const calLunarRadio = $('#cal-lunar');
  const leapMonthRow = $('#leap-month-row');
  const leapMonthCheck = $('#leap-month');
  const birthYear = $('#zwds-year');
  const birthMonth = $('#zwds-month');
  const birthDay = $('#zwds-day');
  const birthTime = $('#zwds-time');
  const unknownTime = $('#zwds-time-unknown');
  const chartSection = $('#zwds-chart');
  const loadingEl = $('#zwds-loading');
  const errorEl = $('#zwds-error');
  const metaEl = $('#zwds-meta');
  const gridEl = $('#zwds-grid');
  const centerEl = $('#zwds-center');
  const svgOverlay = $('#zwds-svg-overlay');
  const flightInfo = $('#zwds-flight-info');
  const horoscopePicker = $('#zwds-horoscope-picker');
  const horoscopeDate = $('#zwds-horo-date');
  const horoscopeHour = $('#zwds-horo-hour');

  // ── STATE ──
  let currentAstrolabe = null;
  let currentHoroscope = null;
  let activeTimeView = '本命';
  let selectedPalaceIdx = -1;
  let isUnknownTime = false;

  // ── INIT FORM FIELDS ──
  function initFormFields() {
    // Years
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1900; y--) {
      const opt = new Option(y, y);
      birthYear.appendChild(opt);
    }
    birthYear.value = 1990;

    // Months
    for (let m = 1; m <= 12; m++) {
      birthMonth.appendChild(new Option(m, m));
    }

    // Days
    for (let d = 1; d <= 31; d++) {
      birthDay.appendChild(new Option(d, d));
    }

    // Time
    TIME_OPTIONS.forEach(t => {
      birthTime.appendChild(new Option(t.label, t.idx));
    });
    birthTime.value = 6;

    // Horoscope hour selector
    if (horoscopeHour) {
      TIME_OPTIONS.forEach(t => {
        horoscopeHour.appendChild(new Option(t.label, t.idx));
      });
      horoscopeHour.value = 6;
    }

    // Horoscope date default
    if (horoscopeDate) {
      const today = new Date();
      horoscopeDate.value = today.toISOString().split('T')[0];
    }
  }

  // ── CALENDAR TOGGLE ──
  function setupCalendarToggle() {
    calSolarRadio.addEventListener('change', () => {
      leapMonthRow.style.display = 'none';
    });
    calLunarRadio.addEventListener('change', () => {
      leapMonthRow.style.display = 'flex';
    });
  }

  // ── UNKNOWN TIME ──
  function setupUnknownTime() {
    unknownTime.addEventListener('change', () => {
      isUnknownTime = unknownTime.checked;
      birthTime.disabled = isUnknownTime;
      if (isUnknownTime) {
        birthTime.value = UNKNOWN_TIME_INDEX;
      }
    });
  }

  // ── SHOW/HIDE HELPERS ──
  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('active');
  }
  function hideError() {
    errorEl.classList.remove('active');
    errorEl.textContent = '';
  }
  function showLoading() {
    loadingEl.classList.add('active');
  }
  function hideLoading() {
    loadingEl.classList.remove('active');
  }

  // ── GENERATE CHART ──
  function generateChart(e) {
    e.preventDefault();
    hideError();

    const year = parseInt(birthYear.value);
    const month = parseInt(birthMonth.value);
    const day = parseInt(birthDay.value);
    const timeIdx = parseInt(birthTime.value);
    const gender = document.querySelector('input[name="zwds-gender"]:checked').value;
    const genderStr = gender === '1' ? '男' : '女';
    const isLunar = calLunarRadio.checked;
    const isLeap = isLunar && leapMonthCheck.checked;

    const dateStr = `${year}-${month}-${day}`;

    showLoading();

    try {
      let result;
      if (isLunar) {
        result = astro.byLunar(dateStr, timeIdx, genderStr, isLeap, true, 'zh-CN');
      } else {
        result = astro.bySolar(dateStr, timeIdx, genderStr, true, 'zh-CN');
      }

      currentAstrolabe = result;
      activeTimeView = '本命';
      selectedPalaceIdx = -1;
      currentHoroscope = null;

      hideLoading();
      renderChart();
      chartSection.classList.add('active');
      chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      hideLoading();
      showError('计算错误: ' + (err.message || err));
      console.error(err);
    }
  }

  // ── RENDER CHART ──
  function renderChart() {
    if (!currentAstrolabe) return;

    renderMeta();
    renderGrid();
    renderTimeControls();
    clearFlightOverlay();
  }

  // ── RENDER METADATA ──
  function renderMeta() {
    const a = currentAstrolabe;
    let html = '';

    html += metaItem('阳历', a.solarDate || '');
    html += metaItem('农历', a.lunarDate || '');
    html += metaItem('四柱', a.chineseDate || '');
    html += metaItem('时辰', a.time || '');
    html += metaItem('时间段', a.timeRange || '');
    html += metaItem('星座', a.sign || '');
    html += metaItem('生肖', a.zodiac || '');
    html += metaItem('命主', a.soul || '');
    html += metaItem('身主', a.body || '');
    html += metaItem('五行局', a.fiveElementsClass || '');

    if (isUnknownTime) {
      html += '<div class="zwds-approx-badge">⚠ 未知时辰 — 取午时近似</div>';
    }

    metaEl.innerHTML = html;
  }

  function metaItem(label, value) {
    return `<div class="zwds-meta-item"><span class="zwds-meta-label">${label}</span><span class="zwds-meta-value">${value}</span></div>`;
  }

  // ── RENDER PALACE GRID ──
  function renderGrid() {
    const palaces = currentAstrolabe.palaces;
    if (!palaces || palaces.length < 12) return;

    // Find soul palace and body palace earthly branches
    const soulEB = currentAstrolabe.earthlyBranchOfSoulPalace || '';
    const bodyEB = currentAstrolabe.earthlyBranchOfBodyPalace || '';

    const earthlyBranches = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];

    let gridHTML = '';

    GRID_POSITIONS.forEach((pos, i) => {
      const palace = palaces[pos.palaceIdx];
      if (!palace) return;

      const eb = earthlyBranches[pos.palaceIdx] || '';
      const isSoul = eb === soulEB;
      const isBody = eb === bodyEB;

      gridHTML += renderPalaceCell(palace, pos.palaceIdx, isSoul, isBody);

      // Insert center cell after position 4 (酉, row1 col3)
      if (i === 4) {
        gridHTML += renderCenterCell();
      }
    });

    gridEl.innerHTML = gridHTML;

    // Attach click handlers
    $$('.zwds-palace').forEach(cell => {
      cell.addEventListener('click', () => {
        const idx = parseInt(cell.dataset.palaceIdx);
        selectPalace(idx);
      });
    });
  }

  function renderPalaceCell(palace, palaceIdx, isSoul, isBody) {
    let markers = '';
    if (isSoul) markers += '<span class="zwds-marker zwds-marker-soul">命</span>';
    if (isBody) markers += '<span class="zwds-marker zwds-marker-body">身</span>';

    // Stars
    let starsHTML = '';

    // Major stars
    if (palace.majorStars) {
      palace.majorStars.forEach(star => {
        if (star.type === 'major' || star.type === 'soft' || star.type === 'tough') {
          const mutagenBadge = getMutagenBadge(star.mutagen);
          const brightness = star.brightness ? `<span class="zwds-brightness">${star.brightness}</span>` : '';
          starsHTML += `<div class="zwds-star zwds-star-major">${star.name}${brightness}${mutagenBadge}</div>`;
        }
      });
    }

    // Minor stars
    if (palace.minorStars) {
      palace.minorStars.forEach(star => {
        const mutagenBadge = getMutagenBadge(star.mutagen);
        const brightness = star.brightness ? `<span class="zwds-brightness">${star.brightness}</span>` : '';
        starsHTML += `<div class="zwds-star zwds-star-minor">${star.name}${brightness}${mutagenBadge}</div>`;
      });
    }

    // Adjective stars (collapsed)
    if (palace.adjectiveStars && palace.adjectiveStars.length > 0) {
      const adjNames = palace.adjectiveStars.map(s => s.name).join(' ');
      starsHTML += `<div class="zwds-star zwds-star-adj">${adjNames}</div>`;
    }

    // Horoscope overlay
    let horoscopeHTML = '';
    if (currentHoroscope && activeTimeView !== '本命') {
      horoscopeHTML = renderHoroscopeOverlay(palaceIdx);
    }

    // Decadal range
    let decadalHTML = '';
    if (palace.decadal && palace.decadal.range) {
      decadalHTML = `<div class="zwds-palace-decadal">${palace.decadal.range.join('-')}</div>`;
    }

    // Ages
    let agesHTML = '';
    if (palace.ages && palace.ages.length > 0) {
      agesHTML = `<div class="zwds-palace-ages">${palace.ages.join(', ')}</div>`;
    }

    // Auxiliary star series
    let auxHTML = '';
    const auxSeries = [
      { key: 'changsheng12', label: '长生' },
      { key: 'boshi12', label: '博士' },
      { key: 'jiangqian12', label: '将前' },
      { key: 'suiqian12', label: '岁前' }
    ];
    auxSeries.forEach(s => {
      if (palace[s.key]) {
        auxHTML += `<span class="zwds-aux-tag">${palace[s.key]}</span> `;
      }
    });
    if (auxHTML) {
      auxHTML = `<div class="zwds-palace-aux">${auxHTML.trim()}</div>`;
    }

    const palaceName = palace.name || '';
    const heavenlyStem = palace.heavenlyStem || '';
    const earthlyBranch = palace.earthlyBranch || '';

    return `<div class="zwds-palace" data-palace-idx="${palaceIdx}" data-palace-name="${palaceName}">
      <div class="zwds-palace-header">
        <span class="zwds-palace-name">${palaceName}</span>
        <span class="zwds-palace-stem-branch">${heavenlyStem}${earthlyBranch}</span>
      </div>
      <div class="zwds-palace-markers">${markers}</div>
      <div class="zwds-stars">${starsHTML}</div>
      ${horoscopeHTML}
      <div class="zwds-palace-footer">
        ${decadalHTML}
        ${agesHTML}
        ${auxHTML}
      </div>
    </div>`;
  }

  function renderCenterCell() {
    if (!currentAstrolabe) return '<div class="zwds-center"></div>';
    const a = currentAstrolabe;
    return `<div class="zwds-center" id="zwds-center">
      <div class="zwds-center-title">紫微斗数</div>
      <div class="zwds-center-info">
        <div>五行局: ${a.fiveElementsClass || ''}</div>
        <div>命主: ${a.soul || ''} · 身主: ${a.body || ''}</div>
        <div style="margin-top:8px;font-size:0.7rem;color:var(--muted);">${a.chineseDate || ''}</div>
      </div>
    </div>`;
  }

  function getMutagenBadge(mutagen) {
    if (!mutagen) return '';
    const map = {
      '禄': '<span class="zwds-mutagen zwds-mutagen-lu">禄</span>',
      '权': '<span class="zwds-mutagen zwds-mutagen-quan">权</span>',
      '科': '<span class="zwds-mutagen zwds-mutagen-ke">科</span>',
      '忌': '<span class="zwds-mutagen zwds-mutagen-ji">忌</span>'
    };
    return map[mutagen] || '';
  }

  // ── HOROSCOPE OVERLAY ──
  function renderHoroscopeOverlay(palaceIdx) {
    if (!currentHoroscope) return '';

    const viewKey = getHoroscopeViewKey();
    if (!viewKey) return '';

    const scope = currentHoroscope[viewKey];
    if (!scope) return '';

    const palaceName = currentAstrolabe.palaces[palaceIdx]?.name;
    if (!palaceName) return '';

    // 小限 (age) has no .stars — it has .palaceNames and .mutagen instead
    if (viewKey === 'age') {
      return renderAgeOverlay(scope, palaceIdx);
    }

    // All other scopes (decadal, yearly, monthly, daily, hourly) use .stars
    let overlayStars = [];
    if (scope.stars) {
      const hPalace = scope.stars[palaceIdx];
      if (hPalace && Array.isArray(hPalace)) {
        overlayStars = hPalace;
      }
    }

    if (overlayStars.length === 0) return '';

    let html = '<div class="zwds-horoscope-stars">';
    html += `<div class="zwds-horoscope-label">${activeTimeView}</div>`;
    overlayStars.forEach(star => {
      const mb = getMutagenBadge(star.mutagen);
      html += `<div class="zwds-star zwds-star-minor" style="color:var(--gold);">${star.name}${mb}</div>`;
    });
    html += '</div>';
    return html;
  }

  // ── 小限 SPECIAL RENDERING ──
  // h.age exposes: palaceNames (string[], 12 reassigned palace names by position)
  //                mutagen (string[], the four 化 star names [禄,权,科,忌])
  function renderAgeOverlay(ageScope, palaceIdx) {
    let html = '';

    // Show reassigned palace name for this position
    if (ageScope.palaceNames && ageScope.palaceNames[palaceIdx]) {
      const reassigned = ageScope.palaceNames[palaceIdx];
      html += '<div class="zwds-horoscope-stars">';
      html += '<div class="zwds-horoscope-label">小限</div>';
      html += `<div class="zwds-star zwds-star-minor" style="color:var(--gold);">⇒ ${reassigned}</div>`;

      // Show mutagen badges if this position's reassigned name matches the natal palace
      // that carries one of the age mutagens
      if (ageScope.mutagen && Array.isArray(ageScope.mutagen)) {
        const mutagenLabels = ['禄', '权', '科', '忌'];
        ageScope.mutagen.forEach((starName, i) => {
          if (starName) {
            // Check if this star exists in the current natal palace
            const natalPalace = currentAstrolabe.palaces[palaceIdx];
            const allStars = [
              ...(natalPalace.majorStars || []),
              ...(natalPalace.minorStars || [])
            ];
            const found = allStars.find(s => s.name === starName);
            if (found) {
              const label = mutagenLabels[i];
              html += `<div class="zwds-star zwds-star-minor" style="color:var(--gold);">${starName} ${getMutagenBadge(label)}</div>`;
            }
          }
        });
      }

      html += '</div>';
    }

    return html;
  }


  function getHoroscopeViewKey() {
    const map = {
      '大限': 'decadal',
      '小限': 'age',
      '流年': 'yearly',
      '流月': 'monthly',
      '流日': 'daily',
      '流时': 'hourly'
    };
    return map[activeTimeView] || null;
  }

  // ── TIME VIEW CONTROLS ──
  function renderTimeControls() {
    const views = ['本命', '大限', '小限', '流年', '流月', '流日', '流时'];
    const controlsEl = $('#zwds-time-controls');
    if (!controlsEl) return;

    controlsEl.innerHTML = views.map(v =>
      `<button class="zwds-time-btn${v === activeTimeView ? ' active' : ''}" data-view="${v}">${v}</button>`
    ).join('');

    controlsEl.querySelectorAll('.zwds-time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTimeView = btn.dataset.view;
        controlsEl.querySelectorAll('.zwds-time-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onTimeViewChange();
      });
    });
  }

  function onTimeViewChange() {
    if (activeTimeView === '本命') {
      currentHoroscope = null;
      horoscopePicker.classList.remove('active');
      renderGrid();
      clearFlightOverlay();
      return;
    }

    horoscopePicker.classList.add('active');
    updateHoroscope();
  }

  function updateHoroscope() {
    if (!currentAstrolabe || activeTimeView === '本命') return;

    try {
      const dateStr = horoscopeDate.value;
      const hourIdx = parseInt(horoscopeHour.value);

      if (!dateStr) return;

      currentHoroscope = currentAstrolabe.horoscope(dateStr, hourIdx);
      renderGrid();
      clearFlightOverlay();
    } catch (err) {
      console.error('Horoscope error:', err);
    }
  }

  // ── PALACE SELECTION & FLYING STARS ──
  function selectPalace(palaceIdx) {
    // Clear previous selection
    $$('.zwds-palace').forEach(c => {
      c.classList.remove('selected', 'flight-dest');
    });
    clearFlightOverlay();

    if (selectedPalaceIdx === palaceIdx) {
      selectedPalaceIdx = -1;
      return;
    }

    selectedPalaceIdx = palaceIdx;
    const palaceEl = $(`.zwds-palace[data-palace-idx="${palaceIdx}"]`);
    if (palaceEl) palaceEl.classList.add('selected');

    // Get palace from astrolabe
    const palace = currentAstrolabe.palace(palaceIdx);
    if (!palace) return;

    const palaceName = palace.name;

    // 福德 has no outgoing flights
    if (palaceName === '福德') {
      showNoFlightsState(palaceName);
      return;
    }

    // Get mutaged places (destinations for 禄/权/科/忌)
    try {
      const destinations = palace.mutagedPlaces();
      if (!destinations || destinations.length === 0) {
        showNoFlightsState(palaceName);
        return;
      }

      const mutagenOrder = ['禄', '权', '科', '忌'];
      const flightLines = [];
      let infoRows = '';

      destinations.forEach((dest, i) => {
        if (!dest) return;
        const mutagen = mutagenOrder[i];
        if (!mutagen) return;

        // Verify with fliesTo
        const verified = palace.fliesTo(dest.name, mutagen);
        if (!verified) return;

        // Highlight destination palace
        const destEl = $(`.zwds-palace[data-palace-name="${dest.name}"]`);
        if (destEl) {
          destEl.classList.add('flight-dest');
          const destIdx = parseInt(destEl.dataset.palaceIdx);
          flightLines.push({
            from: palaceIdx,
            to: destIdx,
            mutagen: mutagen,
            destName: dest.name
          });
        }

        const colorClass = getMutagenFlightColor(mutagen);
        infoRows += `<div class="zwds-flight-info-item">
          <span class="zwds-flight-dot-indicator" style="background:${getFlightColor(mutagen)};"></span>
          <span>${mutagen} → ${dest.name}</span>
        </div>`;
      });

      // Draw SVG lines
      drawFlightLines(flightLines);

      // Show info
      if (infoRows) {
        flightInfo.innerHTML = `<div class="zwds-flight-info-title">${palaceName} 飞星</div>
          <div class="zwds-flight-info-row">${infoRows}</div>`;
        flightInfo.classList.add('active');
      }
    } catch (err) {
      console.error('Flying star error:', err);
      showNoFlightsState(palaceName);
    }
  }

  function showNoFlightsState(palaceName) {
    flightInfo.innerHTML = `<div class="zwds-flight-info-title">${palaceName}</div>
      <div class="zwds-no-flights">此宫无外飞四化</div>`;
    flightInfo.classList.add('active');
  }

  function clearFlightOverlay() {
    if (svgOverlay) svgOverlay.innerHTML = '';
    flightInfo.classList.remove('active');
    flightInfo.innerHTML = '';
  }

  function getMutagenFlightColor(mutagen) {
    const map = { '禄': 'zwds-flight-lu', '权': 'zwds-flight-quan', '科': 'zwds-flight-ke', '忌': 'zwds-flight-ji' };
    return map[mutagen] || '';
  }

  function getFlightColor(mutagen) {
    const map = { '禄': '#4CAF50', '权': '#FF9800', '科': '#42A5F5', '忌': '#EF5350' };
    return map[mutagen] || '#888';
  }

  // ── DRAW FLIGHT LINES (SVG) ──
  function drawFlightLines(flights) {
    if (!svgOverlay || !gridEl) return;

    const gridRect = gridEl.getBoundingClientRect();
    svgOverlay.setAttribute('viewBox', `0 0 ${gridRect.width} ${gridRect.height}`);

    let svgHTML = '';

    flights.forEach(flight => {
      const fromEl = $(`.zwds-palace[data-palace-idx="${flight.from}"]`);
      const toEl = $(`.zwds-palace[data-palace-idx="${flight.to}"]`);
      if (!fromEl || !toEl) return;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      const x1 = fromRect.left - gridRect.left + fromRect.width / 2;
      const y1 = fromRect.top - gridRect.top + fromRect.height / 2;
      const x2 = toRect.left - gridRect.left + toRect.width / 2;
      const y2 = toRect.top - gridRect.top + toRect.height / 2;

      const color = getFlightColor(flight.mutagen);

      svgHTML += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="zwds-flight-line" stroke="${color}" />`;
      svgHTML += `<circle cx="${x2}" cy="${y2}" r="4" fill="${color}" class="zwds-flight-dot" />`;
    });

    svgOverlay.innerHTML = svgHTML;
  }

  // ── RECOMPUTE FLIGHT LINES ON RESIZE ──
  function handleResize() {
    if (selectedPalaceIdx >= 0 && currentAstrolabe) {
      // Re-select to redraw lines
      const idx = selectedPalaceIdx;
      selectedPalaceIdx = -1;
      selectPalace(idx);
    }
  }

  // ── RESET ──
  function resetForm() {
    form.reset();
    chartSection.classList.remove('active');
    currentAstrolabe = null;
    currentHoroscope = null;
    activeTimeView = '本命';
    selectedPalaceIdx = -1;
    hideError();
    hideLoading();
    clearFlightOverlay();
    birthTime.disabled = false;
    isUnknownTime = false;
    leapMonthRow.style.display = 'none';
    horoscopePicker.classList.remove('active');
    birthYear.value = 1990;
    birthTime.value = 6;
  }

  // ── INITIALIZE ──
  function init() {
    initFormFields();
    setupCalendarToggle();
    setupUnknownTime();

    form.addEventListener('submit', generateChart);
    $('#zwds-btn-reset').addEventListener('click', resetForm);

    // Horoscope date/hour change
    if (horoscopeDate) {
      horoscopeDate.addEventListener('change', updateHoroscope);
    }
    if (horoscopeHour) {
      horoscopeHour.addEventListener('change', updateHoroscope);
    }

    // Resize handler (debounced)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(handleResize, 200);
    });
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
