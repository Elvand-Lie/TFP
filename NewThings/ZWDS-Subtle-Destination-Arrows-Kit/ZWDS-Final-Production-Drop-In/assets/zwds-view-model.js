// @ts-check

(function (root, factory) {
  const api = factory(
    root && /** @type {any} */ (root).ZwdsEngineAdapter,
    root && /** @type {any} */ (root).ZwdsTimeState
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).ZwdsViewModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (engineGlobal, stateGlobal) {
  'use strict';

  const MONTH_NAMES = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
  const SCOPE_KEYS = Object.freeze(['decadal', 'yearly', 'monthly', 'daily', 'hourly']);

  function dependencies(engineApi, stateApi) {
    const engine = engineApi || engineGlobal;
    const timeState = stateApi || stateGlobal;
    if (!engine || !timeState) throw new Error('ZWDS view-model dependencies are missing.');
    return { engine, timeState };
  }

  function padDate(value) {
    const parts = String(value || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return String(value || '');
    return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
  }

  function buildDecadeOptions(raw) {
    const engineLunarYear = raw.rawDates && raw.rawDates.lunarDate && Number(raw.rawDates.lunarDate.lunarYear);
    const birthYear = Number.isInteger(engineLunarYear) ? engineLunarYear : Number(String(raw.solarDate).split('-')[0]);
    return raw.palaces.map((palace) => {
      const startAge = palace.decadal.range[0];
      const endAge = palace.decadal.range[1];
      return {
        id: `decade-${palace.slotId}-${startAge}`,
        slotId: palace.slotId,
        roleId: palace.roleId,
        startAge,
        endAge,
        startYear: birthYear + startAge - 1,
        endYear: birthYear + endAge - 1,
        heavenlyStem: palace.decadal.heavenlyStem,
        earthlyBranch: palace.decadal.earthlyBranch
      };
    }).sort((a, b) => a.startAge - b.startAge);
  }

  function yinYangIdentity(raw) {
    const polarity = ['yi', 'ding', 'ji', 'xin', 'gui'].includes(raw.yearHeavenlyStemId) ? 'yin' : 'yang';
    const genderLabel = raw.input.gender === 'male' ? '男' : '女';
    return { polarity, gender: raw.input.gender, label: `${polarity === 'yin' ? '陰' : '陽'}${genderLabel}` };
  }

  function transformationForStar(stableId, mutagenStarIds) {
    const index = (mutagenStarIds || []).indexOf(stableId);
    return index >= 0 ? ['lu', 'quan', 'ke', 'ji'][index] : null;
  }

  function mapStar(star, slotId, category, mutagens) {
    return {
      id: `${slotId}-${category}-${star.stableId}`,
      engineStarId: star.stableId,
      label: star.name,
      category,
      engineType: star.type,
      brightness: star.brightness,
      natalTransformation: star.mutagen,
      decadalTransformation: transformationForStar(star.stableId, mutagens.decadal),
      yearlyTransformation: transformationForStar(star.stableId, mutagens.yearly),
      monthlyTransformation: transformationForStar(star.stableId, mutagens.monthly),
      dailyTransformation: transformationForStar(star.stableId, mutagens.daily),
      hourlyTransformation: transformationForStar(star.stableId, mutagens.hourly),
      scope: star.scope || null
    };
  }

  function mapTransientStars(scope, slotId, prefix, mutagens) {
    if (!scope || !scope.starsBySlot || !Array.isArray(scope.starsBySlot[slotId])) return [];
    return scope.starsBySlot[slotId].map((star) => ({
      ...mapStar(star, slotId, 'transient', mutagens),
      id: `${slotId}-${prefix}-${star.stableId}`,
      scope: prefix
    }));
  }

  function scopeEnabled(state, scope) {
    const order = { decadal: 1, yearly: 2, monthly: 3, daily: 4, hourly: 5 };
    const current = state.selectedTimeIndex != null ? 5 : state.selectedDay != null ? 4 : state.selectedMonth != null ? 3 : state.selectedYear != null ? 2 : state.activeDecadeId ? 1 : 0;
    return current >= order[scope];
  }

  function roleLabel(scope, slotId) {
    const role = scope && scope.rolesBySlot ? scope.rolesBySlot[slotId] : null;
    return role ? role.label : null;
  }

  function scopeStemBranch(scope) {
    return scope ? `${scope.heavenlyStem || ''}${scope.earthlyBranch || ''}` : '';
  }

  function buildViewModel(raw, state, horoscope, yearSummaries, engineApi, stateApi) {
    const { engine, timeState } = dependencies(engineApi, stateApi);
    const decades = buildDecadeOptions(raw);
    const decade = state.activeDecadeId ? timeState.activeDecade(state, decades) : null;
    const annualYears = decade ? timeState.yearsForDecade(decade) : [];
    const identity = yinYangIdentity(raw);
    const scopes = {};
    SCOPE_KEYS.forEach((key) => { scopes[key] = scopeEnabled(state, key) && horoscope ? horoscope[key] : null; });

    const mutagens = {};
    SCOPE_KEYS.forEach((key) => { mutagens[key] = scopes[key] ? scopes[key].mutagenStarIds : []; });

    const palacesBySlot = {};
    raw.palaces.forEach((palace) => {
      const natalStars = [];
      palace.majorStars.forEach((star) => natalStars.push(mapStar(star, palace.slotId, 'major', mutagens)));
      palace.minorStars.forEach((star) => natalStars.push(mapStar(star, palace.slotId, 'minor', mutagens)));
      palace.adjectiveStars.forEach((star) => natalStars.push(mapStar(star, palace.slotId, 'adjective', mutagens)));

      const activeScopeStars = [];
      SCOPE_KEYS.forEach((key) => {
        if (scopes[key]) activeScopeStars.push(...mapTransientStars(scopes[key], palace.slotId, key, mutagens));
      });

      palacesBySlot[palace.slotId] = {
        slotId: palace.slotId,
        roleId: palace.roleId,
        label: engine.PALACE_ROLE_LABELS[palace.roleId],
        stemLabel: palace.heavenlyStem,
        branchLabel: palace.earthlyBranch,
        isLifePalace: raw.lifePalaceBranch === palace.slotId,
        isBodyPalace: raw.bodyPalaceBranch === palace.slotId,
        stars: natalStars,
        auxiliaryLabels: [...palace.auxiliaryLabels],
        decadeAgeRange: [...palace.decadal.range],
        nominalAges: [...palace.ages],
        scopeRoles: {
          decadal: roleLabel(scopes.decadal, palace.slotId),
          yearly: roleLabel(scopes.yearly, palace.slotId),
          monthly: roleLabel(scopes.monthly, palace.slotId),
          daily: roleLabel(scopes.daily, palace.slotId),
          hourly: roleLabel(scopes.hourly, palace.slotId)
        },
        activeScopeStars
      };
    });

    const annualOptions = annualYears.map((year) => {
      const summary = yearSummaries && yearSummaries[year];
      return {
        year,
        age: summary && summary.age != null ? summary.age : year - Number(raw.solarDate.split('-')[0]) + 1,
        heavenlyStem: summary ? summary.heavenlyStem : '',
        earthlyBranch: summary ? summary.earthlyBranch : '',
        selected: year === state.selectedYear
      };
    });

    const monthOptions = state.selectedYear == null ? [] : MONTH_NAMES.map((label, index) => ({
      month: index + 1,
      label,
      selected: state.selectedMonth === index + 1
    }));

    const dayOptions = state.selectedYear == null || state.selectedMonth == null ? [] : Array.from(
      { length: timeState.daysInMonth(state.selectedYear, state.selectedMonth) },
      (_, index) => ({ day: index + 1, selected: state.selectedDay === index + 1 })
    );

    const timeOptions = state.selectedDay == null ? [] : engine.TIME_OPTIONS.map((item) => ({
      ...item,
      selected: state.selectedTimeIndex === item.index
    }));

    const exactTime = raw.input.exactBirthTime || 'Unknown time';
    const pillars = String(raw.chineseDate || '').trim().split(/\s+/).filter(Boolean);
    const selectedYearSummary = state.selectedYear != null && yearSummaries ? yearSummaries[state.selectedYear] : null;
    const deepest = timeState.deepestScope(state);

    return {
      schemaVersion: 2,
      locale: 'zh-TW',
      input: JSON.parse(JSON.stringify(raw.input)),
      identity: {
        name: raw.input.profileName,
        polarity: identity.polarity,
        gender: identity.gender,
        yinYangGenderLabel: identity.label
      },
      dates: {
        solarDateTimeLabel: `${padDate(raw.solarDate)} ${exactTime}`,
        lunarDateTimeLabel: `${raw.lunarDate}${raw.timeLabel}`,
        pillars,
        selectedSolarDate: horoscope ? padDate(horoscope.solarDate) : null,
        selectedLunarDate: horoscope ? horoscope.lunarDate : null
      },
      core: {
        bureauLabel: raw.bureauLabel,
        lifeMasterLabel: raw.lifeMasterLabel,
        bodyMasterLabel: raw.bodyMasterLabel,
        zodiacLabel: raw.zodiacLabel,
        ziDouLabel: null,
        decadeStartDetailLabel: null
      },
      transformationLegend: { lu: '祿', quan: '權', ke: '科', ji: '忌' },
      palaces: engine.GRID_SLOT_ORDER.map((slotId) => palacesBySlot[slotId]),
      palacesBySlot,
      decadeOptions: decades.map((item) => ({ ...item, selected: item.id === state.activeDecadeId })),
      annualOptions,
      monthOptions,
      dayOptions,
      timeOptions,
      selection: {
        scope: deepest,
        decadeId: state.activeDecadeId,
        year: state.selectedYear,
        month: state.selectedMonth,
        day: state.selectedDay,
        timeIndex: state.selectedTimeIndex,
        nominalAge: scopes.yearly && horoscope && horoscope.age ? horoscope.age.nominalAge : selectedYearSummary ? selectedYearSummary.age : null,
        decadeStemBranch: scopeStemBranch(scopes.decadal),
        yearStemBranch: scopeStemBranch(scopes.yearly),
        monthStemBranch: scopeStemBranch(scopes.monthly),
        dayStemBranch: scopeStemBranch(scopes.daily),
        hourStemBranch: scopeStemBranch(scopes.hourly),
        decadeStartYear: decade ? decade.startYear : null,
        decadeEndYear: decade ? decade.endYear : null,
        decadeStartAge: decade ? decade.startAge : null,
        decadeEndAge: decade ? decade.endAge : null
      },
      warnings: [
        ...(raw.input.isUnknownTime ? ['Birth time is unknown; the natal chart currently uses 午時 / Wu hour as an approximation.'] : []),
        ...(deepest === 'monthly' ? ['Month selection uses the 15th day as a representative solar date until a specific day is selected.'] : [])
      ],
      supportedMode: '三合'
    };
  }

  function makeYearSummaries(session, years) {
    const result = {};
    years.forEach((year) => {
      const horoscope = session.getHoroscope({ year, month: 7, day: 1, timeIndex: 6 });
      result[year] = {
        age: horoscope.age.nominalAge,
        heavenlyStem: horoscope.yearly.heavenlyStem,
        earthlyBranch: horoscope.yearly.earthlyBranch,
        decadalIndex: horoscope.decadal.index,
        yearlyIndex: horoscope.yearly.index
      };
    });
    return result;
  }

  function isPlainSerializable(value) {
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.every(isPlainSerializable);
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
    return Object.values(value).every(isPlainSerializable);
  }

  return Object.freeze({
    MONTH_NAMES,
    buildDecadeOptions,
    yinYangIdentity,
    buildViewModel,
    makeYearSummaries,
    isPlainSerializable
  });
});
