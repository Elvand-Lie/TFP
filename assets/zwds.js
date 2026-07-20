// @ts-check

(function (root, factory) {
  const host = /** @type {any} */ (root);
  const api = factory(host);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) host.ZwdsApp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (host) {
  'use strict';
  const PALACE_ENGLISH_LABELS = Object.freeze({ life: "Life", siblings: "Siblings", spouse: "Partner", children: "Children", wealth: "Wealth", health: "Health", travel: "Travel", friends: "Friends", career: "Career", property: "Property", fortune: "Fortune", parents: "Parents" });
  const TRANSFORMATION_ENGLISH_LABELS = Object.freeze({ lu: "Prosperity", quan: "Power", ke: "Recognition", ji: "Obstacle" });


  /** @param {unknown} value */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** @param {string | null | undefined} value */
  function transformationBadge(value) {
    if (!value) return '';
    const labels = { lu: '祿', quan: '權', ke: '科', ji: '忌' };
    const label = labels[value] || value;
    return `<span class="zwds-transform zwds-transform--${escapeHtml(value)}" aria-label="Four Transformation · 化${escapeHtml(label)}">${escapeHtml(label)}</span>`;
  }

  /** @param {any} star */
  function renderStar(star) {
    const classes = [
      'zwds-star',
      `zwds-star--${escapeHtml(star.category)}`,
      star.brightness ? `zwds-star--brightness-${escapeHtml(star.brightness)}` : ''
    ].filter(Boolean).join(' ');
    const scope = star.scope === 'decadal' ? '<small aria-label="Decade cycle">D</small>' : star.scope === 'yearly' ? '<small aria-label="Annual year">Y</small>' : '';
    return `<span class="${classes}" data-star-id="${escapeHtml(star.id)}">${escapeHtml(star.label)}${transformationBadge(star.natalTransformation)}${transformationBadge(star.decadalTransformation)}${transformationBadge(star.yearlyTransformation || star.scopeTransformation)}${scope}</span>`;
  }

  /** @param {any} palace */
  function renderPalaceMarkup(palace) {
    const roles = [
      palace.decadalRoleLabel ? `<span class="zwds-scope-role">Decade · ${escapeHtml(palace.decadalRoleLabel)}</span>` : '',
      palace.yearlyRoleLabel ? `<span class="zwds-scope-role zwds-scope-role--year">Year · ${escapeHtml(palace.yearlyRoleLabel)}</span>` : ''
    ].filter(Boolean).join('');
    const markers = [
      palace.isLifePalace ? '<span class="zwds-palace-marker">命</span>' : '',
      palace.isBodyPalace ? '<span class="zwds-palace-marker">身</span>' : ''
    ].filter(Boolean).join('');
    const stars = palace.stars.map(renderStar).join('');
    const transient = palace.activeScopeStars.map(renderStar).join('');
    const auxiliary = palace.auxiliaryLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join('');
    const range = `${palace.decadeAgeRange[0]}–${palace.decadeAgeRange[1]}`;
    const palaceEnglishLabel = PALACE_ENGLISH_LABELS[palace.roleId] || "Palace";
    const aria = `${palaceEnglishLabel} palace (${palace.label}), ${palace.branchLabel} branch, decade ages ${range} years`;

    return `<button type="button" class="zwds-palace" data-slot="${escapeHtml(palace.slotId)}" data-role-id="${escapeHtml(palace.roleId)}" aria-label="${escapeHtml(aria)}" aria-pressed="false">
      <span class="zwds-palace__heading"><strong>${escapeHtml(palace.label)}</strong><span>${markers}</span><b>${escapeHtml(palace.stemLabel + palace.branchLabel)}</b></span>
      <span class="zwds-palace__roles">${roles}</span>
      <span class="zwds-palace__stars">${stars}</span>
      <span class="zwds-palace__transient">${transient}</span>
      <span class="zwds-palace__aux">${auxiliary}</span>
      <span class="zwds-palace__footer"><span>${escapeHtml(range)} yrs</span><span>${escapeHtml(palace.nominalAges.slice(0, 4).join(' · '))}</span></span>
    </button>`;
  }

  /** @param {any} model */
  function renderCenterMarkup(model) {
    const name = model.identity.name || 'Unnamed Chart';
    const pillarLabels = ['Year · 年', 'Month · 月', 'Day · 日', 'Hour · 時'];
    const pillars = model.dates.pillars.map((pillar, index) =>
      `<span><small>${escapeHtml(pillarLabels[index] || '')}</small><b>${escapeHtml(pillar)}</b></span>`
    ).join('');
    const legend = Object.entries(model.transformationLegend).map(([id, label]) =>
      `<span>${transformationBadge(id)}${escapeHtml(TRANSFORMATION_ENGLISH_LABELS[id] || label)}</span>`
    ).join('');
    const warnings = model.warnings.map((warning) => `<p class="zwds-center__warning">${escapeHtml(warning)}</p>`).join('');

    return `<section class="zwds-center" aria-label="Chart details">
      <header><span class="zwds-center__mode">${escapeHtml(model.supportedMode)}</span><h2>${escapeHtml(name)}</h2><strong>${escapeHtml(model.identity.yinYangGenderLabel)}</strong></header>
      <dl class="zwds-center__facts">
        <div><dt>Solar</dt><dd>${escapeHtml(model.dates.solarDateTimeLabel)}</dd></div>
        <div><dt>Lunar</dt><dd>${escapeHtml(model.dates.lunarDateTimeLabel)}</dd></div>
        <div><dt>Bureau · 五行局</dt><dd>${escapeHtml(model.core.bureauLabel)}</dd></div>
        <div><dt>Life · 命主</dt><dd>${escapeHtml(model.core.lifeMasterLabel)}</dd></div>
        <div><dt>Body · 身主</dt><dd>${escapeHtml(model.core.bodyMasterLabel)}</dd></div>
      </dl>
      <div class="zwds-center__pillars" aria-label="Four Pillars 四柱">${pillars}</div>
      <div class="zwds-center__legend" aria-label="Four Transformations legend">${legend}</div>
      ${warnings}
    </section>`;
  }

  /** @param {any} model */
  function renderChartMarkup(model) {
    return model.palaces.map(renderPalaceMarkup).join('') + renderCenterMarkup(model);
  }

  /** @param {any} model */
  function renderDecadesMarkup(model) {
    return model.decadeOptions.map((item) => {
      const label = `${item.startYear}–${item.endYear}`;
      const detail = `${item.startAge}–${item.endAge} yrs · ${item.heavenlyStem}${item.earthlyBranch}`;
      return `<button type="button" class="zwds-period-button" data-decade-id="${escapeHtml(item.id)}" aria-pressed="${item.selected ? 'true' : 'false'}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></button>`;
    }).join('');
  }

  /** @param {any} model */
  function renderAnnualsMarkup(model) {
    return model.annualOptions.map((item) =>
      `<button type="button" class="zwds-year-button" data-year="${item.year}" aria-pressed="${item.selected ? 'true' : 'false'}"><strong>${item.year}</strong><span>${escapeHtml(item.heavenlyStem + item.earthlyBranch)} · ${item.age} yrs</span></button>`
    ).join('');
  }

  /** @param {any} model */
  function renderSelectionSummary(model) {
    const age = model.selection.nominalAge == null ? 'Not available' : `${model.selection.nominalAge} yrs`;
    return `<strong>${escapeHtml(String(model.selection.year))} ${escapeHtml(model.selection.yearStemBranch)}</strong><span>Decade ${escapeHtml(model.selection.decadeStemBranch)} · Nominal age ${escapeHtml(age)}</span>`;
  }

  /** @param {any} flight */
  function renderFlightInfoMarkup(flight) {
    if (!flight) return '<span>Select a palace to view its natal Four Transformations (四化) paths.</span>';
    if (flight.blocked) return '<span>The Fortune palace (福德宮) has no outgoing transformations under the current method.</span>';
    return flight.destinations.map((destination) =>
      `<span class="zwds-flight-item"><b class="zwds-transform zwds-transform--${escapeHtml(destination.transformationId)}">${escapeHtml(destination.transformationLabel)}</b> → ${escapeHtml(destination.roleLabel)}</span>`
    ).join('');
  }

  function browserController() {
    const doc = host.document;
    if (!doc) return null;
    const engine = host.ZwdsEngineAdapter;
    const viewModel = host.ZwdsViewModel;
    const timeState = host.ZwdsTimeState;
    const iztroLib = host.iztro;
    if (!engine || !viewModel || !timeState || !iztroLib) return null;

    /** @type {any} */
    let session = null;
    /** @type {any} */
    let state = null;
    /** @type {any} */
    let model = null;
    /** @type {any} */
    let selectedFlight = null;

    const byId = (id) => /** @type {HTMLElement | null} */ (doc.getElementById(id));
    const form = /** @type {HTMLFormElement | null} */ (byId('zwds-form'));
    const chart = byId('zwds-chart');
    const grid = byId('zwds-grid');
    const decadesNode = byId('zwds-decade-options');
    const annualsNode = byId('zwds-annual-options');
    const summaryNode = byId('zwds-selection-summary');
    const errorNode = byId('zwds-form-error');
    const flightNode = byId('zwds-flight-info');
    const leapRow = byId('zwds-leap-row');
    const timeInput = /** @type {HTMLInputElement | null} */ (byId('zwds-birth-time'));
    const unknownInput = /** @type {HTMLInputElement | null} */ (byId('zwds-time-unknown'));
    const timeBranch = byId('zwds-time-branch');
    const yearSelect = /** @type {HTMLSelectElement | null} */ (byId('zwds-year'));
    const monthSelect = /** @type {HTMLSelectElement | null} */ (byId('zwds-month'));
    const daySelect = /** @type {HTMLSelectElement | null} */ (byId('zwds-day'));
    const svg = /** @type {SVGSVGElement | null} */ (doc.getElementById('zwds-flight-overlay'));
    if (!form || !chart || !grid || !decadesNode || !annualsNode || !summaryNode || !errorNode || !flightNode || !yearSelect || !monthSelect || !daySelect) return null;

    function selectedCalendar() {
      const selected = /** @type {HTMLInputElement | null} */ (form.querySelector('input[name="calendar-type"]:checked'));
      return selected ? selected.value : 'solar';
    }

    function updateDays() {
      const year = Number(yearSelect.value);
      const month = Number(monthSelect.value);
      const prior = Number(daySelect.value) || 1;
      const count = selectedCalendar() === 'solar' ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 30;
      daySelect.replaceChildren();
      for (let day = 1; day <= count; day += 1) {
        const option = doc.createElement('option');
        option.value = String(day);
        option.textContent = String(day);
        daySelect.append(option);
      }
      daySelect.value = String(Math.min(prior, count));
    }

    function updateCalendarControls() {
      const isLunar = selectedCalendar() === 'lunar';
      if (leapRow) leapRow.hidden = !isLunar;
      updateDays();
    }

    function updateTimePreview() {
      const unknown = Boolean(unknownInput && unknownInput.checked);
      if (timeInput) timeInput.disabled = unknown;
      const index = unknown ? engine.TIME_OPTIONS.find((item) => item.index === 6).index : engine.timeToIndex(timeInput && timeInput.value ? timeInput.value : '12:00');
      const option = engine.TIME_OPTIONS.find((item) => item.index === index);
      if (timeBranch) timeBranch.textContent = unknown ? 'Unknown time · approximated as 午時 / Wu hour' : `${option.branchLabel} · ${option.range}`;
    }

    function readInput() {
      const data = new host.FormData(form);
      const year = String(data.get('year') || '');
      const month = String(data.get('month') || '').padStart(2, '0');
      const day = String(data.get('day') || '').padStart(2, '0');
      return {
        profileName: String(data.get('profile-name') || '').trim(),
        calendarType: selectedCalendar(),
        birthDate: `${year}-${month}-${day}`,
        gender: String(data.get('gender') || 'male'),
        birthTime: timeInput ? timeInput.value : '12:00',
        isUnknownTime: Boolean(unknownInput && unknownInput.checked),
        isLeapMonth: Boolean(data.get('is-leap-month'))
      };
    }

    /** @param {string | null} focusSelector */
    function refresh(focusSelector) {
      if (!session || !state) return;
      const decades = viewModel.buildDecadeOptions(session.raw);
      const active = timeState.activeDecade(state, decades);
      const years = timeState.yearsForDecade(active);
      const summaries = viewModel.makeYearSummaries(session, years);
      const horoscope = session.getHoroscope(state.selectedYear);
      model = viewModel.buildViewModel(session.raw, state, horoscope, summaries, engine, timeState);
      if (!viewModel.isPlainSerializable(model)) throw new Error('The chart view data could not be rendered safely.');

      grid.innerHTML = renderChartMarkup(model);
      decadesNode.innerHTML = renderDecadesMarkup(model);
      annualsNode.innerHTML = renderAnnualsMarkup(model);
      summaryNode.innerHTML = renderSelectionSummary(model);
      selectedFlight = null;
      flightNode.innerHTML = renderFlightInfoMarkup(null);
      chart.hidden = false;
      chart.classList.add('is-active');
      drawFlights(null);
      if (focusSelector) {
        const target = /** @type {HTMLElement | null} */ (doc.querySelector(focusSelector));
        if (target) target.focus({ preventScroll: true });
      }
    }

    /** @param {any} flight */
    function drawFlights(flight) {
      if (!svg || !grid) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      grid.querySelectorAll('.is-flight-source, .is-flight-destination').forEach((node) => {
        node.classList.remove('is-flight-source', 'is-flight-destination');
        node.setAttribute('aria-pressed', 'false');
      });
      if (!flight) return;
      const source = /** @type {HTMLElement | null} */ (grid.querySelector(`[data-slot="${flight.sourceSlotId}"]`));
      if (!source) return;
      source.classList.add('is-flight-source');
      source.setAttribute('aria-pressed', 'true');
      if (flight.blocked) return;
      const gridRect = grid.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${gridRect.width} ${gridRect.height}`);
      flight.destinations.forEach((destination) => {
        const target = /** @type {HTMLElement | null} */ (grid.querySelector(`[data-slot="${destination.slotId}"]`));
        if (!target) return;
        target.classList.add('is-flight-destination');
        const sourceRect = source.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const x1 = sourceRect.left - gridRect.left + sourceRect.width / 2;
        const y1 = sourceRect.top - gridRect.top + sourceRect.height / 2;
        const x2 = targetRect.left - gridRect.left + targetRect.width / 2;
        const y2 = targetRect.top - gridRect.top + targetRect.height / 2;
        const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x2));
        line.setAttribute('y2', String(y2));
        line.setAttribute('class', `zwds-flight-line zwds-flight-line--${destination.transformationId}`);
        svg.append(line);
      });
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      errorNode.textContent = '';
      try {
        session = engine.createChartSession(iztroLib, readInput());
        const decades = viewModel.buildDecadeOptions(session.raw);
        state = timeState.createState(decades, new Date().getFullYear());
        refresh(null);
        chart.scrollIntoView({ behavior: host.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      } catch (error) {
        chart.hidden = true;
        errorNode.textContent = error instanceof Error ? error.message : 'Unable to calculate the chart. Please check your entries.';
        errorNode.focus();
      }
    });

    form.addEventListener('reset', () => {
      host.setTimeout(() => {
        updateCalendarControls();
        updateTimePreview();
        errorNode.textContent = '';
        session = null;
        state = null;
        model = null;
        selectedFlight = null;
        chart.hidden = true;
        chart.classList.remove('is-active');
        grid.replaceChildren();
        decadesNode.replaceChildren();
        annualsNode.replaceChildren();
      }, 0);
    });

    form.querySelectorAll('input[name="calendar-type"]').forEach((input) => input.addEventListener('change', updateCalendarControls));
    yearSelect.addEventListener('change', updateDays);
    monthSelect.addEventListener('change', updateDays);
    if (timeInput) timeInput.addEventListener('input', updateTimePreview);
    if (unknownInput) unknownInput.addEventListener('change', updateTimePreview);

    decadesNode.addEventListener('click', (event) => {
      const target = /** @type {any} */ (event.target);
      const button = /** @type {HTMLElement | null} */ (target && typeof target.closest === 'function' ? target.closest('[data-decade-id]') : null);
      if (!button || !state || !session) return;
      const id = button.getAttribute('data-decade-id');
      const decades = viewModel.buildDecadeOptions(session.raw);
      state = timeState.selectDecade(state, decades, id, new Date().getFullYear());
      refresh(`[data-decade-id="${id}"]`);
    });

    annualsNode.addEventListener('click', (event) => {
      const target = /** @type {any} */ (event.target);
      const button = /** @type {HTMLElement | null} */ (target && typeof target.closest === 'function' ? target.closest('[data-year]') : null);
      if (!button || !state || !session) return;
      const year = Number(button.getAttribute('data-year'));
      const decades = viewModel.buildDecadeOptions(session.raw);
      state = timeState.selectYear(state, decades, year);
      refresh(`[data-year="${year}"]`);
    });

    grid.addEventListener('click', (event) => {
      const target = /** @type {any} */ (event.target);
      const button = /** @type {HTMLElement | null} */ (target && typeof target.closest === 'function' ? target.closest('.zwds-palace') : null);
      if (!button || !session) return;
      const slotId = button.getAttribute('data-slot');
      selectedFlight = session.getFlights(slotId);
      flightNode.innerHTML = renderFlightInfoMarkup(selectedFlight);
      drawFlights(selectedFlight);
    });

    host.addEventListener('resize', () => drawFlights(selectedFlight), { passive: true });

    for (let year = new Date().getFullYear(); year >= 1900; year -= 1) {
      const option = doc.createElement('option');
      option.value = String(year);
      option.textContent = String(year);
      yearSelect.append(option);
    }
    for (let month = 1; month <= 12; month += 1) {
      const option = doc.createElement('option');
      option.value = String(month);
      option.textContent = String(month);
      monthSelect.append(option);
    }
    yearSelect.value = '1990';
    monthSelect.value = '1';
    updateCalendarControls();
    daySelect.value = '1';
    updateTimePreview();
    form.requestSubmit();
    return Object.freeze({ refresh });
  }

  if (host.document) {
    if (host.document.readyState === 'loading') host.document.addEventListener('DOMContentLoaded', browserController, { once: true });
    else browserController();
  }

  return Object.freeze({
    escapeHtml,
    transformationBadge,
    renderStar,
    renderPalaceMarkup,
    renderCenterMarkup,
    renderChartMarkup,
    renderDecadesMarkup,
    renderAnnualsMarkup,
    renderSelectionSummary,
    renderFlightInfoMarkup,
    browserController
  });
});
