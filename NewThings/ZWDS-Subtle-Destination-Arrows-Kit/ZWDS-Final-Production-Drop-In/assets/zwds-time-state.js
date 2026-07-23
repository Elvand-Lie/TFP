// @ts-check
// Progressive time-selection state for natal → decade → year → month → day → two-hour period.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).ZwdsTimeState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function assertDecades(decades) {
    if (!Array.isArray(decades) || decades.length !== 12) throw new Error('Decade options must contain all twelve palaces.');
    const ids = new Set(decades.map((item) => item.id));
    if (ids.size !== decades.length) throw new Error('Decade option IDs must be unique.');
  }

  function yearsForDecade(decade) {
    const years = [];
    for (let year = decade.startYear; year <= decade.endYear; year += 1) years.push(year);
    return years;
  }

  function daysInMonth(year, month) {
    if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error('The selected year is invalid.');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('The selected month is invalid.');
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function createState(decades) {
    assertDecades(decades);
    return {
      activeDecadeId: null,
      selectedYear: null,
      selectedMonth: null,
      selectedDay: null,
      selectedTimeIndex: null
    };
  }

  function selectDecade(state, decades, decadeId) {
    assertDecades(decades);
    const decade = decades.find((item) => item.id === decadeId);
    if (!decade) throw new Error('The selected decade cycle could not be found.');
    return {
      activeDecadeId: decade.id,
      selectedYear: null,
      selectedMonth: null,
      selectedDay: null,
      selectedTimeIndex: null
    };
  }

  function selectYear(state, decades, year) {
    assertDecades(decades);
    const decade = decades.find((item) => item.id === state.activeDecadeId);
    if (!decade) throw new Error('There is no active decade cycle.');
    if (!Number.isInteger(year) || year < decade.startYear || year > decade.endYear) throw new Error('The selected year is outside the active decade cycle.');
    return {
      activeDecadeId: decade.id,
      selectedYear: year,
      selectedMonth: null,
      selectedDay: null,
      selectedTimeIndex: null
    };
  }

  function selectMonth(state, month) {
    if (!Number.isInteger(state.selectedYear)) throw new Error('Select an annual year first.');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('The selected month is invalid.');
    return {
      ...state,
      selectedMonth: month,
      selectedDay: null,
      selectedTimeIndex: null
    };
  }

  function selectDay(state, day) {
    if (!Number.isInteger(state.selectedYear) || !Number.isInteger(state.selectedMonth)) throw new Error('Select a month first.');
    const max = daysInMonth(state.selectedYear, state.selectedMonth);
    if (!Number.isInteger(day) || day < 1 || day > max) throw new Error('The selected day is invalid.');
    return {
      ...state,
      selectedDay: day,
      selectedTimeIndex: null
    };
  }

  function selectTime(state, timeIndex, validIndexes) {
    if (!Number.isInteger(state.selectedDay)) throw new Error('Select a day first.');
    const allowed = Array.isArray(validIndexes) ? validIndexes : Array.from({ length: 13 }, (_, index) => index);
    if (!Number.isInteger(timeIndex) || !allowed.includes(timeIndex)) throw new Error('The selected two-hour period is invalid.');
    return { ...state, selectedTimeIndex: timeIndex };
  }

  function activeDecade(state, decades) {
    const decade = decades.find((item) => item.id === state.activeDecadeId);
    if (!decade) throw new Error('There is no active decade cycle.');
    return decade;
  }

  function deepestScope(state) {
    if (state.selectedTimeIndex != null) return 'hourly';
    if (state.selectedDay != null) return 'daily';
    if (state.selectedMonth != null) return 'monthly';
    if (state.selectedYear != null) return 'yearly';
    if (state.activeDecadeId) return 'decadal';
    return 'natal';
  }

  function representativeSelection(state, decades, defaultTimeIndex) {
    if (!state.activeDecadeId) return null;
    const decade = activeDecade(state, decades);
    const year = state.selectedYear != null ? state.selectedYear : decade.startYear;
    const month = state.selectedMonth != null ? state.selectedMonth : 7;
    const day = state.selectedDay != null ? state.selectedDay : state.selectedMonth != null ? Math.min(15, daysInMonth(year, month)) : 1;
    const timeIndex = state.selectedTimeIndex != null ? state.selectedTimeIndex : Number.isInteger(defaultTimeIndex) ? defaultTimeIndex : 6;
    return { year, month, day, timeIndex };
  }

  return Object.freeze({
    createState,
    selectDecade,
    selectYear,
    selectMonth,
    selectDay,
    selectTime,
    activeDecade,
    yearsForDecade,
    daysInMonth,
    deepestScope,
    representativeSelection
  });
});
