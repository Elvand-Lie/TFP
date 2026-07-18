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
    const birthYear = Number(String(raw.solarDate).split('-')[0]);
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
    const index = mutagenStarIds.indexOf(stableId);
    return index >= 0 ? ['lu', 'quan', 'ke', 'ji'][index] : null;
  }

  function mapStar(star, slotId, category, decadalMutagens, yearlyMutagens) {
    return {
      id: `${slotId}-${category}-${star.stableId}`,
      engineStarId: star.stableId,
      label: star.name,
      category,
      engineType: star.type,
      brightness: star.brightness,
      natalTransformation: star.mutagen,
      decadalTransformation: transformationForStar(star.stableId, decadalMutagens || []),
      yearlyTransformation: transformationForStar(star.stableId, yearlyMutagens || []),
      scopeTransformation: transformationForStar(star.stableId, yearlyMutagens || []),
      scope: star.scope || null
    };
  }

  function mapTransientStars(scope, slotId, prefix, decadalMutagens, yearlyMutagens) {
    if (!scope || !scope.starsBySlot || !Array.isArray(scope.starsBySlot[slotId])) return [];
    return scope.starsBySlot[slotId].map((star) => ({
      ...mapStar(star, slotId, 'transient', decadalMutagens, yearlyMutagens),
      id: `${slotId}-${prefix}-${star.stableId}`,
      scope: prefix
    }));
  }

  function buildViewModel(raw, state, horoscope, yearSummaries, engineApi, stateApi) {
    const { engine, timeState } = dependencies(engineApi, stateApi);
    const decades = buildDecadeOptions(raw);
    const decade = timeState.activeDecade(state, decades);
    const annualYears = timeState.yearsForDecade(decade);
    const identity = yinYangIdentity(raw);
    const yearly = horoscope ? horoscope.yearly : null;
    const decadal = horoscope ? horoscope.decadal : null;
    const yearlyMutagens = yearly ? yearly.mutagenStarIds : [];
    const decadalMutagens = decadal ? decadal.mutagenStarIds : [];

    const palacesBySlot = {};
    raw.palaces.forEach((palace) => {
      const natalStars = [];
      palace.majorStars.forEach((star) => natalStars.push(mapStar(star, palace.slotId, 'major', decadalMutagens, yearlyMutagens)));
      palace.minorStars.forEach((star) => natalStars.push(mapStar(star, palace.slotId, 'minor', decadalMutagens, yearlyMutagens)));
      palace.adjectiveStars.forEach((star) => natalStars.push(mapStar(star, palace.slotId, 'adjective', decadalMutagens, yearlyMutagens)));

      const decadalRole = decadal && decadal.rolesBySlot[palace.slotId];
      const yearlyRole = yearly && yearly.rolesBySlot[palace.slotId];
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
        decadalRoleLabel: decadalRole ? decadalRole.label : null,
        yearlyRoleLabel: yearlyRole ? yearlyRole.label : null,
        decadalTransformations: natalStars.filter((star) => star.decadalTransformation).map((star) => ({ id: star.decadalTransformation, label: star.label })),
        yearlyTransformations: natalStars.filter((star) => star.yearlyTransformation).map((star) => ({ id: star.yearlyTransformation, label: star.label })),
        activeScopeStars: [
          ...mapTransientStars(decadal, palace.slotId, 'decadal', decadalMutagens, yearlyMutagens),
          ...mapTransientStars(yearly, palace.slotId, 'yearly', decadalMutagens, yearlyMutagens)
        ]
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

    const exactTime = raw.input.exactBirthTime || '時間不詳';
    const pillars = String(raw.chineseDate || '').trim().split(/\s+/).filter(Boolean);
    const selectedYearSummary = yearSummaries && yearSummaries[state.selectedYear];

    return {
      schemaVersion: 1,
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
        pillars
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
      selection: {
        scope: 'yearly',
        decadeId: state.activeDecadeId,
        year: state.selectedYear,
        nominalAge: horoscope && horoscope.age ? horoscope.age.nominalAge : selectedYearSummary ? selectedYearSummary.age : null,
        decadeStemBranch: decadal ? `${decadal.heavenlyStem}${decadal.earthlyBranch}` : '',
        yearStemBranch: yearly ? `${yearly.heavenlyStem}${yearly.earthlyBranch}` : ''
      },
      warnings: raw.input.isUnknownTime ? ['出生時間不詳，目前以午時作近似排盤。'] : [],
      supportedMode: '三合'
    };
  }

  function makeYearSummaries(session, years) {
    const result = {};
    years.forEach((year) => {
      const horoscope = session.getHoroscope(year);
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

  return Object.freeze({ buildDecadeOptions, yinYangIdentity, buildViewModel, makeYearSummaries, isPlainSerializable });
});
