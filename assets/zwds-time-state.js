// @ts-check

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

  function createState(decades) {
    assertDecades(decades);
    return { activeDecadeId: null, selectedYear: null };
  }

  function selectDecade(state, decades, decadeId) {
    assertDecades(decades);
    const decade = decades.find((item) => item.id === decadeId);
    if (!decade) throw new Error('The selected decade cycle could not be found.');
    return { activeDecadeId: decade.id, selectedYear: null };
  }

  function selectYear(state, decades, year) {
    assertDecades(decades);
    const decade = decades.find((item) => item.id === state.activeDecadeId);
    if (!decade) throw new Error('There is no active decade cycle.');
    if (!Number.isInteger(year) || year < decade.startYear || year > decade.endYear) throw new Error('The selected year is outside the active decade cycle.');
    return { activeDecadeId: decade.id, selectedYear: year };
  }

  function activeDecade(state, decades) {
    const decade = decades.find((item) => item.id === state.activeDecadeId);
    if (!decade) throw new Error('There is no active decade cycle.');
    return decade;
  }

  return Object.freeze({ createState, selectDecade, selectYear, activeDecade, yearsForDecade });
});
