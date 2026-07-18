// @ts-check

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).ZwdsTimeState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function assertDecades(decades) {
    if (!Array.isArray(decades) || decades.length !== 12) throw new Error('大限選項必須包含十二個宮位。');
    const ids = new Set(decades.map((item) => item.id));
    if (ids.size !== decades.length) throw new Error('大限識別碼不得重複。');
  }

  function yearsForDecade(decade) {
    const years = [];
    for (let year = decade.startYear; year <= decade.endYear; year += 1) years.push(year);
    return years;
  }

  function createState(decades, referenceYear) {
    assertDecades(decades);
    const ordered = [...decades].sort((a, b) => a.startAge - b.startAge);
    const preferred = ordered.find((item) => referenceYear >= item.startYear && referenceYear <= item.endYear) || ordered[0];
    const selectedYear = referenceYear >= preferred.startYear && referenceYear <= preferred.endYear ? referenceYear : preferred.startYear;
    return { activeDecadeId: preferred.id, selectedYear };
  }

  function selectDecade(state, decades, decadeId, referenceYear) {
    assertDecades(decades);
    const decade = decades.find((item) => item.id === decadeId);
    if (!decade) throw new Error('找不到所選大限。');
    const selectedYear = referenceYear >= decade.startYear && referenceYear <= decade.endYear ? referenceYear : decade.startYear;
    return { activeDecadeId: decade.id, selectedYear };
  }

  function selectYear(state, decades, year) {
    assertDecades(decades);
    const decade = decades.find((item) => item.id === state.activeDecadeId);
    if (!decade) throw new Error('目前沒有有效的大限。');
    if (!Number.isInteger(year) || year < decade.startYear || year > decade.endYear) throw new Error('所選流年不在目前大限內。');
    return { activeDecadeId: decade.id, selectedYear: year };
  }

  function activeDecade(state, decades) {
    const decade = decades.find((item) => item.id === state.activeDecadeId);
    if (!decade) throw new Error('目前沒有有效的大限。');
    return decade;
  }

  return Object.freeze({ createState, selectDecade, selectYear, activeDecade, yearsForDecade });
});
