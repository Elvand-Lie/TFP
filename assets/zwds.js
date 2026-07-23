// @ts-check

(function (root, factory) {
  const host = /** @type {any} */ (root);
  const api = factory(host);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) host.ZwdsApp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (host) {
  'use strict';

  const PALACE_ENGLISH_LABELS = Object.freeze({ life: 'Life', siblings: 'Siblings', spouse: 'Partner', children: 'Children', wealth: 'Wealth', health: 'Health', travel: 'Travel', friends: 'Friends', career: 'Career', property: 'Property', fortune: 'Fortune', parents: 'Parents' });
  const TRANSFORMATION_ENGLISH_LABELS = Object.freeze({ lu: 'Prosperity', quan: 'Power', ke: 'Recognition', ji: 'Obstacle' });
  const SCOPE_LABELS = Object.freeze({ decadal: 'Decade', yearly: 'Year', monthly: 'Month', daily: 'Day', hourly: 'Hour' });
  const SCOPE_MARKERS = Object.freeze({ decadal: 'D', yearly: 'Y', monthly: 'M', daily: '日', hourly: '時' });

  /** @param {unknown} value */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** @param {string | null | undefined} value @param {string=} scope */
  function transformationBadge(value, scope) {
    if (!value) return '';
    const labels = { lu: '祿', quan: '權', ke: '科', ji: '忌' };
    const label = labels[value] || value;
    const scopeLabel = scope ? `${scope} ` : '';
    return `<span class="zwds-transform zwds-transform--${escapeHtml(value)}" title="${escapeHtml(scopeLabel)}Four Transformation · 化${escapeHtml(label)}" aria-label="${escapeHtml(scopeLabel)}Four Transformation · 化${escapeHtml(label)}">${escapeHtml(label)}</span>`;
  }

  /** @param {any} star */
  function renderStar(star) {
    const classes = [
      'zwds-star',
      `zwds-star--${escapeHtml(star.category)}`,
      star.brightness ? `zwds-star--brightness-${escapeHtml(star.brightness)}` : ''
    ].filter(Boolean).join(' ');
    const knownScope = star.scope && Object.prototype.hasOwnProperty.call(SCOPE_MARKERS, star.scope) ? star.scope : null;
    const scope = knownScope ? `<small class="zwds-scope-marker" aria-label="${escapeHtml(SCOPE_LABELS[knownScope] || knownScope)}">${escapeHtml(SCOPE_MARKERS[knownScope])}</small>` : '';
    const badges = [
      transformationBadge(star.natalTransformation, 'Natal'),
      transformationBadge(star.decadalTransformation, 'Decade'),
      transformationBadge(star.yearlyTransformation, 'Year'),
      transformationBadge(star.monthlyTransformation, 'Month'),
      transformationBadge(star.dailyTransformation, 'Day'),
      transformationBadge(star.hourlyTransformation, 'Hour')
    ].join('');
    return `<span class="${classes}" data-star-id="${escapeHtml(star.id)}">${escapeHtml(star.label)}${badges}${scope}</span>`;
  }

  /** @param {any} palace */
  function renderPalaceMarkup(palace) {
    const roles = Object.entries(palace.scopeRoles || {}).map(([scope, label]) => label
      ? `<span class="zwds-scope-role zwds-scope-role--${escapeHtml(scope)}">${escapeHtml(SCOPE_LABELS[scope] || scope)} · ${escapeHtml(label)}</span>`
      : '').filter(Boolean).join('');
    const markers = [
      palace.isLifePalace ? '<span class="zwds-palace-marker">命</span>' : '',
      palace.isBodyPalace ? '<span class="zwds-palace-marker">身</span>' : ''
    ].filter(Boolean).join('');
    const stars = palace.stars.map(renderStar).join('');
    const transient = palace.activeScopeStars.map(renderStar).join('');
    const auxiliary = palace.auxiliaryLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join('');
    const range = `${palace.decadeAgeRange[0]}–${palace.decadeAgeRange[1]}`;
    const palaceEnglishLabel = PALACE_ENGLISH_LABELS[palace.roleId] || 'Palace';
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
    const selectedDate = model.dates.selectedSolarDate
      ? `<div><dt>Selected</dt><dd>${escapeHtml(model.dates.selectedSolarDate)}${model.dates.selectedLunarDate ? ` · ${escapeHtml(model.dates.selectedLunarDate)}` : ''}</dd></div>`
      : '';

    return `<section class="zwds-center" aria-label="Chart details">
      <header><span class="zwds-center__mode">${escapeHtml(model.supportedMode)}</span><h2>${escapeHtml(name)}</h2><strong>${escapeHtml(model.identity.yinYangGenderLabel)}</strong></header>
      <dl class="zwds-center__facts">
        <div><dt>Solar</dt><dd>${escapeHtml(model.dates.solarDateTimeLabel)}</dd></div>
        <div><dt>Lunar</dt><dd>${escapeHtml(model.dates.lunarDateTimeLabel)}</dd></div>
        <div><dt>Bureau · 五行局</dt><dd>${escapeHtml(model.core.bureauLabel)}</dd></div>
        <div><dt>Life · 命主</dt><dd>${escapeHtml(model.core.lifeMasterLabel)}</dd></div>
        <div><dt>Body · 身主</dt><dd>${escapeHtml(model.core.bodyMasterLabel)}</dd></div>
        ${selectedDate}
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
    if (!model.annualOptions.length) return '<p class="zwds-period-empty" role="status">Select a decade cycle to view its annual years.</p>';
    return model.annualOptions.map((item) =>
      `<button type="button" class="zwds-year-button" data-year="${item.year}" aria-pressed="${item.selected ? 'true' : 'false'}"><strong>${item.year}</strong><span>${escapeHtml(item.heavenlyStem + item.earthlyBranch)} · ${item.age} yrs</span></button>`
    ).join('');
  }

  /** @param {any} model */
  function renderMonthsMarkup(model) {
    if (!model.monthOptions.length) return '<p class="zwds-period-empty" role="status">Select an annual year to view its months.</p>';
    return model.monthOptions.map((item) =>
      `<button type="button" class="zwds-month-button" data-month="${item.month}" aria-pressed="${item.selected ? 'true' : 'false'}"><strong>${item.month}</strong><span>${escapeHtml(item.label)}</span></button>`
    ).join('');
  }

  /** @param {any} model */
  function renderDaysMarkup(model) {
    if (!model.dayOptions.length) return '<p class="zwds-period-empty" role="status">Select a month to view its days.</p>';
    return model.dayOptions.map((item) =>
      `<button type="button" class="zwds-day-button" data-day="${item.day}" aria-pressed="${item.selected ? 'true' : 'false'}"><strong>${item.day}</strong></button>`
    ).join('');
  }

  /** @param {any} model */
  function renderTimesMarkup(model) {
    if (!model.timeOptions.length) return '<p class="zwds-period-empty" role="status">Select a day to view its two-hour periods.</p>';
    return model.timeOptions.map((item) =>
      `<button type="button" class="zwds-time-button" data-time-index="${item.index}" aria-pressed="${item.selected ? 'true' : 'false'}"><strong>${escapeHtml(item.branchLabel)}</strong><span>${escapeHtml(item.range)}</span></button>`
    ).join('');
  }

  /** @param {any} model */
  function renderSelectionSummary(model) {
    const selection = model.selection;
    if (selection.scope === 'natal') return '<strong>本命</strong><span>Natal chart</span>';
    if (selection.scope === 'decadal') {
      return `<strong>Decade · 大限 ${escapeHtml(selection.decadeStemBranch)}</strong><span>${selection.decadeStartYear}–${selection.decadeEndYear} · Ages ${selection.decadeStartAge}–${selection.decadeEndAge}</span>`;
    }
    if (selection.scope === 'yearly') {
      return `<strong>Annual ${selection.year} · 流年 ${escapeHtml(selection.yearStemBranch)}</strong><span>Decade ${escapeHtml(selection.decadeStemBranch)} · Nominal age ${escapeHtml(String(selection.nominalAge || '—'))}</span>`;
    }
    if (selection.scope === 'monthly') {
      return `<strong>${selection.year}-${String(selection.month).padStart(2, '0')} · 流月 ${escapeHtml(selection.monthStemBranch)}</strong><span>Representative date: day 15 until a day is selected</span>`;
    }
    if (selection.scope === 'daily') {
      return `<strong>${selection.year}-${String(selection.month).padStart(2, '0')}-${String(selection.day).padStart(2, '0')} · 流日 ${escapeHtml(selection.dayStemBranch)}</strong><span>Select a two-hour period for 流時</span>`;
    }
    const time = model.timeOptions.find((item) => item.index === selection.timeIndex);
    return `<strong>${selection.year}-${String(selection.month).padStart(2, '0')}-${String(selection.day).padStart(2, '0')} · 流時 ${escapeHtml(selection.hourStemBranch)}</strong><span>${escapeHtml(time ? `${time.branchLabel} · ${time.range}` : '')}</span>`;
  }

  /** Resolve palace role label for a given relationship scope.
   *  Does NOT fall back to the natal role for missing time-scope data.
   *  @param {any} palacesBySlot @param {string} slotId @param {string} scope */
  function resolveRoleForScope(palacesBySlot, slotId, scope) {
    var palace = palacesBySlot[slotId];
    if (!palace) return null;
    if (scope === 'natal') return palace.label;
    return (palace.scopeRoles && palace.scopeRoles[scope]) || null;
  }

  /** @param {string | null} sourceSlotId @param {string[]} targetSlotIds @param {string} scope @param {any} palacesBySlot */
  function renderTrineInfoMarkup(sourceSlotId, targetSlotIds, scope, palacesBySlot) {
    if (!sourceSlotId) return '<span>Select a palace to view its 三方四正.</span>';
    var sourceRole = resolveRoleForScope(palacesBySlot, sourceSlotId, scope) || '—';
    var targets = targetSlotIds.map(function (slotId) {
      return resolveRoleForScope(palacesBySlot, slotId, scope) || '—';
    });
    return '<span class="zwds-flight-item">' + escapeHtml(sourceRole) + ' → ' + targets.map(function (r) { return escapeHtml(r); }).join(' · ') + '</span>';
  }

  function browserController() {
    const doc = host.document;
    if (!doc) return null;
    const engine = host.ZwdsEngineAdapter;
    const relationshipRouter = host.ZwdsRelationshipRouter;
    const viewModel = host.ZwdsViewModel;
    const timeState = host.ZwdsTimeState;
    const profileStoreApi = host.ZwdsProfileStore;
    const iztroLib = host.iztro;
    if (!engine || !relationshipRouter || !viewModel || !timeState || !profileStoreApi || !iztroLib) return null;

    let session = null;
    let state = null;
    let model = null;
    /** @type {string | null} Physical slot of the currently selected palace */
    let selectedRelationshipSourceSlotId = null;
    let editingProfileId = null;

    const store = profileStoreApi.createStore(host.localStorage);
    const byId = (id) => /** @type {HTMLElement | null} */(doc.getElementById(id));
    const form = /** @type {HTMLFormElement | null} */ (byId('zwds-form'));
    const chart = byId('zwds-chart');
    const grid = byId('zwds-grid');
    const decadesNode = byId('zwds-decade-options');
    const annualsNode = byId('zwds-annual-options');
    const monthsNode = byId('zwds-month-options');
    const daysNode = byId('zwds-day-options');
    const timesNode = byId('zwds-time-options');
    const natalButton = byId('zwds-return-natal');
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
    const profileSelect = /** @type {HTMLSelectElement | null} */ (byId('zwds-profile-select'));
    const profileStatus = byId('zwds-profile-status');
    const importInput = /** @type {HTMLInputElement | null} */ (byId('zwds-import-input'));
    const svg = /** @type {SVGSVGElement | null} */ (doc.getElementById('zwds-flight-overlay'));

    if (!form || !chart || !grid || !decadesNode || !annualsNode || !monthsNode || !daysNode || !timesNode || !natalButton || !summaryNode || !errorNode || !flightNode || !yearSelect || !monthSelect || !daySelect || !profileSelect) return null;

    function setStatus(message, isError) {
      if (!profileStatus) return;
      profileStatus.textContent = message;
      profileStatus.dataset.kind = isError ? 'error' : 'ok';
    }

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
      if (!isLunar) {
        const leap = /** @type {HTMLInputElement | null} */ (byId('leap-month'));
        if (leap) leap.checked = false;
      }
      updateDays();
    }

    function updateTimePreview() {
      const unknown = Boolean(unknownInput && unknownInput.checked);
      if (timeInput) timeInput.disabled = unknown;
      const index = unknown ? 6 : engine.timeToIndex(timeInput && timeInput.value ? timeInput.value : '12:00');
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
        isLeapMonth: selectedCalendar() === 'lunar' && Boolean(data.get('is-leap-month'))
      };
    }

    /** @param {any} input */
    function fillForm(input) {
      const parts = String(input.birthDate || '1990-01-01').split('-').map(Number);
      const nameInput = /** @type {HTMLInputElement | null} */ (byId('zwds-name'));
      if (nameInput) nameInput.value = input.profileName || '';
      const cal = /** @type {HTMLInputElement | null} */ (form.querySelector(`input[name="calendar-type"][value="${input.calendarType === 'lunar' ? 'lunar' : 'solar'}"]`));
      if (cal) cal.checked = true;
      const gender = /** @type {HTMLInputElement | null} */ (form.querySelector(`input[name="gender"][value="${input.gender === 'female' ? 'female' : 'male'}"]`));
      if (gender) gender.checked = true;
      yearSelect.value = String(parts[0] || 1990);
      monthSelect.value = String(parts[1] || 1);
      updateCalendarControls();
      daySelect.value = String(parts[2] || 1);
      if (timeInput) timeInput.value = input.birthTime || '12:00';
      if (unknownInput) unknownInput.checked = input.isUnknownTime === true;
      const leap = /** @type {HTMLInputElement | null} */ (byId('leap-month'));
      if (leap) leap.checked = input.calendarType === 'lunar' && input.isLeapMonth === true;
      updateTimePreview();
    }

    function refreshProfiles() {
      const profiles = store.list();
      profileSelect.replaceChildren();
      if (!profiles.length) {
        const option = doc.createElement('option');
        option.value = '';
        option.textContent = 'No saved profiles';
        profileSelect.append(option);
        profileSelect.disabled = true;
        return;
      }
      profileSelect.disabled = false;
      profiles.forEach((profile) => {
        const option = doc.createElement('option');
        option.value = profile.id;
        option.textContent = profile.input.profileName;
        profileSelect.append(option);
      });
      const wanted = editingProfileId || store.selectedId();
      const active = profiles.some((item) => item.id === wanted) ? wanted : profiles[0].id;
      profileSelect.value = active;
      editingProfileId = active;
      store.setSelectedId(active);
    }

    /** @param {any} input @param {boolean=} shouldScroll */
    function plot(input, shouldScroll) {
      errorNode.textContent = '';
      session = engine.createChartSession(iztroLib, input);
      const decades = viewModel.buildDecadeOptions(session.raw);
      state = timeState.createState(decades);
      selectedRelationshipSourceSlotId = null;
      refresh(null);
      if (shouldScroll) chart.scrollIntoView({ behavior: host.matchMedia && host.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }

    /** @param {string | null} focusSelector */
    function refresh(focusSelector) {
      if (!session || !state) return;
      const decades = viewModel.buildDecadeOptions(session.raw);
      const active = state.activeDecadeId ? timeState.activeDecade(state, decades) : null;
      const years = active ? timeState.yearsForDecade(active) : [];
      const summaries = active ? viewModel.makeYearSummaries(session, years) : {};
      const selection = timeState.representativeSelection(state, decades, session.input.iztroTimeIndex);
      const horoscope = selection ? session.getHoroscope(selection) : null;
      model = viewModel.buildViewModel(session.raw, state, horoscope, summaries, engine, timeState);
      if (!viewModel.isPlainSerializable(model)) throw new Error('The chart view data could not be rendered safely.');

      grid.innerHTML = renderChartMarkup(model);
      decadesNode.innerHTML = renderDecadesMarkup(model);
      annualsNode.innerHTML = renderAnnualsMarkup(model);
      monthsNode.innerHTML = renderMonthsMarkup(model);
      daysNode.innerHTML = renderDaysMarkup(model);
      timesNode.innerHTML = renderTimesMarkup(model);
      summaryNode.innerHTML = renderSelectionSummary(model);
      var isNatal = model.selection.scope === 'natal';
      natalButton.hidden = isNatal;
      chart.dataset.scope = model.selection.scope;
      recomputeRelationship();
      chart.hidden = false;
      chart.classList.add('is-active');
      if (focusSelector) {
        const target = /** @type {HTMLElement | null} */ (doc.querySelector(focusSelector));
        if (target) target.focus({ preventScroll: true });
      }
    }

    /** Create <defs> with arrowhead marker for trine routes. */
    function appendArrowDefinitions(targetSvg) {
      var defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
      var marker = doc.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'zwds-trine-arrowhead');
      marker.setAttribute('markerWidth', '5');
      marker.setAttribute('markerHeight', '4');
      marker.setAttribute('refX', '4.5');
      marker.setAttribute('refY', '2');
      marker.setAttribute('orient', 'auto');
      marker.setAttribute('markerUnits', 'strokeWidth');
      var shape = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      shape.setAttribute('d', 'M0,0 L5,2 L0,4 Z');
      shape.setAttribute('class', 'zwds-trine-arrowhead');
      marker.appendChild(shape);
      defs.appendChild(marker);
      targetSvg.appendChild(defs);
      return defs;
    }

    /** Create a linearGradient element for a route. */
    function appendRouteGradient(defs, id, src, tgt) {
      var grad = doc.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      grad.setAttribute('id', id);
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', String(src.x)); grad.setAttribute('y1', String(src.y));
      grad.setAttribute('x2', String(tgt.x)); grad.setAttribute('y2', String(tgt.y));
      var stop1 = doc.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', 'rgba(113,1,1,.06)');
      var stop2 = doc.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', 'rgba(113,1,1,.38)');
      grad.appendChild(stop1); grad.appendChild(stop2);
      defs.appendChild(grad);
    }

    /**
     * Draw relationship routes on the SVG overlay using the perimeter router.
     * @param {{ sourceSlotId: string, type: string, targetSlotIds: string[] } | null} relationship
     */
    function drawRelationshipLines(relationship) {
      if (!svg || !grid) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      grid.querySelectorAll('.is-trine-source, .is-trine-target, .is-trine-opposite').forEach(function (node) {
        node.classList.remove('is-trine-source', 'is-trine-target', 'is-trine-opposite');
        node.setAttribute('aria-pressed', 'false');
      });
      if (!relationship) return;
      var source = grid.querySelector('[data-slot="' + relationship.sourceSlotId + '"]');
      if (!source) return;
      source.classList.add('is-trine-source');
      source.setAttribute('aria-pressed', 'true');
      var gridRect = grid.getBoundingClientRect();
      svg.setAttribute('viewBox', '0 0 ' + gridRect.width + ' ' + gridRect.height);
      var defs = appendArrowDefinitions(svg);
      var sourceRect = source.getBoundingClientRect();
      var center = grid.querySelector('.zwds-center');
      var centerRect = center ? center.getBoundingClientRect() : null;
      relationship.targetSlotIds.forEach(function (targetSlotId, index) {
        var target = grid.querySelector('[data-slot="' + targetSlotId + '"]');
        if (!target) return;
        target.classList.add(index === 1 ? 'is-trine-opposite' : 'is-trine-target');
        var targetRect = target.getBoundingClientRect();
        var route = relationshipRouter.route(
          { x: sourceRect.left - gridRect.left, y: sourceRect.top - gridRect.top, w: sourceRect.width, h: sourceRect.height },
          { x: targetRect.left - gridRect.left, y: targetRect.top - gridRect.top, w: targetRect.width, h: targetRect.height },
          centerRect ? { x: centerRect.left - gridRect.left, y: centerRect.top - gridRect.top, w: centerRect.width, h: centerRect.height } : null,
          { fan: relationship.targetSlotIds.length, fanIndex: index, inset: 9 }
        );
        var gradientId = 'zwds-trine-route-' + index;
        appendRouteGradient(defs, gradientId, route.points[0], route.points[route.points.length - 1]);
        var path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', relationshipRouter.roundedPath(route.points, 18));
        path.setAttribute('class', 'zwds-trine-path');
        path.setAttribute('stroke', 'url(#' + gradientId + ')');
        path.setAttribute('marker-end', 'url(#zwds-trine-arrowhead)');
        svg.appendChild(path);
      });
    }

    /** Build the current relationship object from stored source slot, or null. */
    function buildCurrentRelationship() {
      if (!selectedRelationshipSourceSlotId) return null;
      var targetSlotIds = engine.getTrineSlots(selectedRelationshipSourceSlotId);
      return {
        sourceSlotId: selectedRelationshipSourceSlotId,
        type: 'trine',
        targetSlotIds: targetSlotIds
      };
    }

    /** Recompute and redraw the 三方四正 relationship for the current source slot. */
    function recomputeRelationship() {
      var relationship = buildCurrentRelationship();
      var scope = state ? timeState.deepestScope(state) : 'natal';
      var palacesBySlot = model ? model.palacesBySlot : {};
      var targetSlotIds = relationship ? relationship.targetSlotIds : [];
      flightNode.innerHTML = renderTrineInfoMarkup(
        selectedRelationshipSourceSlotId, targetSlotIds, scope, palacesBySlot
      );
      drawRelationshipLines(relationship);
    }

    function loadProfile(id) {
      const profile = store.list().find((item) => item.id === id);
      if (!profile) return;
      editingProfileId = profile.id;
      store.setSelectedId(profile.id);
      fillForm(profile.input);
      plot(profile.input, false);
      refreshProfiles();
      setStatus(`Loaded ${profile.input.profileName}. Profiles stay in this browser.`, false);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      errorNode.textContent = '';
      try {
        const input = readInput();
        const normalizedInput = engine.normalizeInput(input);
        const saved = store.upsert({
          id: editingProfileId || undefined,
          input: {
            ...input,
            profileName: normalizedInput.profileName,
            birthDate: normalizedInput.sourceDate,
            birthTime: normalizedInput.exactBirthTime || input.birthTime
          }
        });
        editingProfileId = saved.id;
        refreshProfiles();
        plot(saved.input, true);
        setStatus(`Saved ${saved.input.profileName} locally.`, false);
      } catch (error) {
        chart.hidden = true;
        errorNode.textContent = error instanceof Error ? error.message : 'Unable to calculate the chart. Please check your entries.';
        errorNode.focus();
      }
    });

    form.querySelectorAll('input[name="calendar-type"]').forEach((input) => input.addEventListener('change', updateCalendarControls));
    yearSelect.addEventListener('change', updateDays);
    monthSelect.addEventListener('change', updateDays);
    if (timeInput) timeInput.addEventListener('input', updateTimePreview);
    if (unknownInput) unknownInput.addEventListener('change', updateTimePreview);

    natalButton.addEventListener('click', () => {
      if (!session) return;
      state = timeState.createState(viewModel.buildDecadeOptions(session.raw));
      refresh(null);
    });

    decadesNode.addEventListener('click', (event) => {
      const target = /** @type {any} */ (event.target);
      const button = /** @type {HTMLElement | null} */ (target && typeof target.closest === 'function' ? target.closest('[data-decade-id]') : null);
      if (!button || !state || !session) return;
      const id = button.getAttribute('data-decade-id');
      state = timeState.selectDecade(state, viewModel.buildDecadeOptions(session.raw), id);
      refresh(`[data-decade-id="${id}"]`);
    });

    annualsNode.addEventListener('click', (event) => {
      const target = /** @type {any} */ (event.target);
      const button = /** @type {HTMLElement | null} */ (target && typeof target.closest === 'function' ? target.closest('[data-year]') : null);
      if (!button || !state || !session) return;
      const year = Number(button.getAttribute('data-year'));
      state = timeState.selectYear(state, viewModel.buildDecadeOptions(session.raw), year);
      refresh(`[data-year="${year}"]`);
    });

    monthsNode.addEventListener('click', (event) => {
      const target = /** @type {any} */ (event.target);
      const button = /** @type {HTMLElement | null} */ (target && typeof target.closest === 'function' ? target.closest('[data-month]') : null);
      if (!button || !state) return;
      const month = Number(button.getAttribute('data-month'));
      state = timeState.selectMonth(state, month);
      refresh(`[data-month="${month}"]`);
    });

    daysNode.addEventListener('click', (event) => {
      const target = /** @type {any} */ (event.target);
      const button = /** @type {HTMLElement | null} */ (target && typeof target.closest === 'function' ? target.closest('[data-day]') : null);
      if (!button || !state) return;
      const day = Number(button.getAttribute('data-day'));
      state = timeState.selectDay(state, day);
      refresh(`[data-day="${day}"]`);
    });

    timesNode.addEventListener('click', (event) => {
      const target = /** @type {any} */ (event.target);
      const button = /** @type {HTMLElement | null} */ (target && typeof target.closest === 'function' ? target.closest('[data-time-index]') : null);
      if (!button || !state) return;
      const index = Number(button.getAttribute('data-time-index'));
      state = timeState.selectTime(state, index, engine.TIME_OPTIONS.map((item) => item.index));
      refresh(`[data-time-index="${index}"]`);
    });

    /* Palace click → 三方四正 trine relationship (not Four Transformations flights) */
    grid.addEventListener('click', (event) => {
      const target = /** @type {any} */ (event.target);
      const button = /** @type {HTMLElement | null} */ (target && typeof target.closest === 'function' ? target.closest('.zwds-palace') : null);
      if (!button || !session) return;
      selectedRelationshipSourceSlotId = button.getAttribute('data-slot');
      recomputeRelationship();
    });



    profileSelect.addEventListener('change', () => loadProfile(profileSelect.value));

    byId('zwds-new-profile')?.addEventListener('click', () => {
      editingProfileId = null;
      form.reset();
      host.setTimeout(() => {
        yearSelect.value = '1990';
        monthSelect.value = '1';
        updateCalendarControls();
        daySelect.value = '1';
        updateTimePreview();
        chart.hidden = true;
        const nameInput = /** @type {HTMLInputElement | null} */ (byId('zwds-name'));
        if (nameInput) nameInput.focus();
        setStatus('Enter birth details, then choose Plot & Save Profile.', false);
      }, 0);
    });

    byId('zwds-delete-profile')?.addEventListener('click', () => {
      if (!editingProfileId) return;
      const profile = store.list().find((item) => item.id === editingProfileId);
      if (!profile || !host.confirm(`Delete ${profile.input.profileName} from this browser?`)) return;
      store.remove(editingProfileId);
      editingProfileId = null;
      refreshProfiles();
      const next = store.selectedId();
      if (next) loadProfile(next);
      else {
        chart.hidden = true;
        setStatus('No saved profiles remain.', false);
      }
    });

    const exportButton = /** @type {HTMLButtonElement | null} */ (byId('zwds-export-profiles'));
    const downloadEmailInput = /** @type {HTMLInputElement | null} */ (byId('zwds-download-email'));

    function isValidEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
    }

    function downloadProfileBackup() {
      const payload = JSON.stringify(store.exportPayload(), null, 2);
      const blob = new host.Blob([payload], { type: 'application/json' });
      const url = host.URL.createObjectURL(blob);
      const anchor = doc.createElement('a');
      anchor.href = url;
      anchor.download = `zwds-profiles-${new Date().toISOString().slice(0, 10)}.json`;
      doc.body.append(anchor);
      anchor.click();
      anchor.remove();
      host.URL.revokeObjectURL(url);
    }

    exportButton?.addEventListener('click', async () => {
      const email = downloadEmailInput ? downloadEmailInput.value.trim() : '';
      if (!isValidEmail(email)) {
        if (downloadEmailInput) {
          downloadEmailInput.setAttribute('aria-invalid', 'true');
          downloadEmailInput.focus();
        }
        setStatus('Enter a valid email address before downloading the backup.', true);
        return;
      }

      if (downloadEmailInput) downloadEmailInput.removeAttribute('aria-invalid');
      if (exportButton) {
        exportButton.disabled = true;
        exportButton.textContent = 'Notifying…';
      }
      setStatus('Sending the download notification to The Full Picture…', false);

      try {
        const response = await host.fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'zwds_download_lead',
            email,
            action: 'ZWDS profile backup download',
            profileCount: store.list().length,
            source: 'ZWDS web app',
            _honey: ''
          })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.error ||
            'The download notification could not be sent.'
          );
        }

        downloadProfileBackup();

        setStatus(
          `Backup downloaded. The Full Picture was notified that ${email} downloaded ZWDS.`,
          false
        );
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'The download notification could not be sent.', true);
      } finally {
        if (exportButton) {
          exportButton.disabled = false;
          exportButton.textContent = 'Download Backup';
        }
      }
    });

    if (importInput) importInput.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const imported = Array.isArray(parsed) ? parsed : parsed.profiles;
        const valid = imported.map((profile) => {
          const normalized = store.normalizeProfile(profile);
          engine.normalizeInput(normalized.input);
          return normalized;
        });
        const merged = store.merge(valid);
        editingProfileId = valid[0] ? valid[0].id : store.selectedId();
        if (editingProfileId) store.setSelectedId(editingProfileId);
        refreshProfiles();
        if (editingProfileId) loadProfile(editingProfileId);
        setStatus(`Imported ${valid.length} profile${valid.length === 1 ? '' : 's'}; ${merged.length} stored in total.`, false);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'The profile backup could not be imported.', true);
      } finally {
        importInput.value = '';
      }
    });

    host.addEventListener('resize', () => drawRelationshipLines(buildCurrentRelationship()), { passive: true });

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

    refreshProfiles();
    const initialId = store.selectedId() || (store.list()[0] && store.list()[0].id);
    if (initialId) {
      loadProfile(initialId);
    } else {
      fillForm({
        profileName: '',
        calendarType: 'solar',
        birthDate: '1990-01-01',
        gender: 'male',
        birthTime: '12:00',
        isUnknownTime: false,
        isLeapMonth: false
      });
      setStatus('Enter your birth details and choose Plot \u0026 Save Profile to create your first chart.', false);
    }
    if (!store.persistent) setStatus('Browser storage is unavailable; profiles will last only until this tab is closed.', true);

    return Object.freeze({ refresh, loadProfile, store });
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
    renderMonthsMarkup,
    renderDaysMarkup,
    renderTimesMarkup,
    renderSelectionSummary,
    renderTrineInfoMarkup,
    browserController
  });
});
