import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import iztro from 'iztro';

const require = createRequire(import.meta.url);
const adapter = require('../assets/zwds-engine-adapter.js');
const timeState = require('../assets/zwds-time-state.js');
const viewModel = require('../assets/zwds-view-model.js');
const renderer = require('../assets/zwds.js');

const joseInput = {
  profileName: 'Jose', calendarType: 'solar', gender: 'male', birthDate: '1981-02-11',
  birthTime: '15:34', birthHourBranch: '申', isUnknownTime: false, isLeapMonth: false
};

function createJoseScopeModel(scope = 'natal', year = 2026) {
  const session = adapter.createChartSession(iztro, joseInput);
  const decades = viewModel.buildDecadeOptions(session.raw);
  let state = timeState.createState(decades);
  let summaries = {};
  let horoscope = null;
  if (scope !== 'natal') {
    const active = decades.find((item) => year >= item.startYear && year <= item.endYear);
    assert.ok(active, `No decade contains ${year}`);
    state = timeState.selectDecade(state, decades, active.id);
    summaries = viewModel.makeYearSummaries(session, timeState.yearsForDecade(active));
    horoscope = session.getHoroscope(year);
    if (scope === 'yearly') state = timeState.selectYear(state, decades, year);
  }
  const model = viewModel.buildViewModel(session.raw, state, horoscope, summaries, adapter, timeState);
  return { session, decades, state, summaries, horoscope, model };
}

function createJoseModel(year = 2026) {
  return createJoseScopeModel('yearly', year);
}

function scopeStars(model, scope) {
  return model.palaces.flatMap((palace) => palace.activeScopeStars).filter((star) => star.scope === scope);
}

function transformationCount(model, scope) {
  return model.palaces.flatMap((palace) => palace[`${scope}Transformations`]).length;
}

test('renderer-facing model is plain, serializable, and method-free', () => {
  const { model } = createJoseModel();
  assert.equal(viewModel.isPlainSerializable(model), true);
  const json = JSON.stringify(model);
  assert.ok(json.includes('Jose'));
  assert.equal(json.includes('function'), false);
});

test('Traditional center data uses characterized supported fields only', () => {
  const { model } = createJoseModel();
  assert.equal(model.identity.yinYangGenderLabel, '陰男');
  assert.equal(model.core.bureauLabel, '金四局');
  assert.equal(model.core.lifeMasterLabel, '破軍');
  assert.equal(model.core.bodyMasterLabel, '天同');
  assert.equal(model.dates.solarDateTimeLabel, '1981-02-11 15:34');
  assert.equal(model.dates.lunarDateTimeLabel, '一九八一年正月初七申時');
  assert.deepEqual(model.dates.pillars, ['辛酉', '庚寅', '庚申', '甲申']);
  assert.equal(model.core.ziDouLabel, null);
  assert.equal(model.core.decadeStartDetailLabel, null);
});

test('view model exposes twelve unique stable grid slots', () => {
  const { model } = createJoseModel();
  assert.equal(model.palaces.length, 12);
  assert.equal(new Set(model.palaces.map((palace) => palace.slotId)).size, 12);
  assert.deepEqual(model.palaces.map((palace) => palace.slotId), adapter.GRID_SLOT_ORDER);
});

test('view mapping preserves every natal star exactly once, including 祿存 and 天馬', () => {
  const { session, model } = createJoseModel();
  session.raw.palaces.forEach((rawPalace) => {
    const expected = rawPalace.majorStars.length + rawPalace.minorStars.length + rawPalace.adjectiveStars.length;
    assert.equal(model.palacesBySlot[rawPalace.slotId].stars.length, expected, rawPalace.slotId);
  });
  const all = model.palaces.flatMap((palace) => palace.stars.map((star) => ({ ...star, slotId: palace.slotId })));
  assert.equal(new Set(all.map((star) => star.id)).size, all.length);
  assert.ok(all.every((star) => star.engineStarId && !star.engineStarId.startsWith('unmapped-')));
  assert.ok(all.every((star) => !/-\d+$/.test(star.id)), 'renderer identity must not contain an engine array ordinal');
  const lucun = all.find((star) => star.engineType === 'lucun');
  const tianma = all.find((star) => star.engineType === 'tianma');
  assert.deepEqual({ label: lucun.label, slotId: lucun.slotId }, { label: '祿存', slotId: 'you' });
  assert.deepEqual({ label: tianma.label, slotId: tianma.slotId }, { label: '天馬', slotId: 'hai' });
});

test('active annual mapping includes roles, transformations, and transient stars', () => {
  const { model } = createJoseModel();
  assert.ok(model.palaces.every((palace) => palace.decadalRoleLabel));
  assert.ok(model.palaces.every((palace) => palace.yearlyRoleLabel));
  assert.ok(model.palaces.some((palace) => palace.stars.some((star) => star.scopeTransformation)));
  assert.equal(model.palaces.flatMap((palace) => palace.decadalTransformations).length, 4);
  assert.equal(model.palaces.flatMap((palace) => palace.yearlyTransformations).length, 4);
  assert.ok(model.palaces.some((palace) => palace.activeScopeStars.some((star) => star.scope === 'decadal')));
  assert.ok(model.palaces.some((palace) => palace.activeScopeStars.some((star) => star.scope === 'yearly')));
  const transient = model.palaces.flatMap((palace) => palace.activeScopeStars);
  assert.ok(transient.every((star) => star.engineStarId && !star.engineStarId.startsWith('unmapped-')));
  assert.equal(new Set(transient.map((star) => star.id)).size, transient.length);
});

test('renderer emits twelve accessible branch-identified palace controls and a center panel', () => {
  const { model } = createJoseModel();
  const markup = renderer.renderChartMarkup(model);
  assert.equal((markup.match(/class="zwds-palace"/g) || []).length, 12);
  adapter.GRID_SLOT_ORDER.forEach((slotId) => assert.ok(markup.includes(`data-slot="${slotId}"`)));
  assert.ok(markup.includes('type="button" class="zwds-palace"'));
  assert.ok(markup.includes('aria-pressed="false"'));
  assert.ok(markup.includes('class="zwds-center"'));
  assert.ok(markup.includes('金四局'));
  assert.ok(markup.includes('祿存'));
  assert.ok(markup.includes('天馬'));
  assert.ok(markup.includes("Life palace (命宮)"));
  assert.ok(markup.includes("Bureau · 五行局"));
  assert.ok(markup.includes("Prosperity"));
});

test('renderer escapes transient profile data and exposes real selected semantics', () => {
  const { model } = createJoseModel();
  model.identity.name = '<img src=x onerror=alert(1)>';
  const center = renderer.renderCenterMarkup(model);
  assert.equal(center.includes('<img'), false);
  assert.ok(center.includes('&lt;img src=x onerror=alert(1)&gt;'));
  const decades = renderer.renderDecadesMarkup(model);
  const annuals = renderer.renderAnnualsMarkup(model);
  assert.equal((decades.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((annuals.match(/aria-pressed="true"/g) || []).length, 1);
  assert.ok(annuals.includes('data-year="2026" aria-pressed="true"'));
});

test('Jose decade and annual options drive real characterized calculations', () => {
  const { session, decades, state, model } = createJoseModel();
  const active = timeState.activeDecade(state, decades);
  assert.deepEqual([active.startAge, active.endAge, active.startYear, active.endYear], [44, 53, 2024, 2033]);
  assert.equal(model.annualOptions.length, 10);
  assert.equal(model.selection.year, 2026);
  assert.equal(model.selection.nominalAge, 46);
  const engineIndex = session.raw.palaces.find((palace) => palace.slotId === active.slotId).engineIndex;
  assert.equal(session.getHoroscope(2026).decadal.index, engineIndex);
});

test('pre-Lunar-New-Year decade labels follow iztro nominal age', () => {
  const session = adapter.createChartSession(iztro, {
    profileName: 'Boundary', calendarType: 'solar', gender: 'male', birthDate: '1990-01-01',
    birthTime: '', isUnknownTime: true, isLeapMonth: false
  });
  const decades = viewModel.buildDecadeOptions(session.raw);
  const decade = decades.find((item) => item.startAge === 35);
  const horoscope = session.getHoroscope(2023);
  const expectedIndex = session.raw.palaces.find((palace) => palace.slotId === decade.slotId).engineIndex;
  assert.deepEqual([decade.startYear, decade.endYear], [2023, 2032]);
  assert.equal(horoscope.age.nominalAge, 35);
  assert.equal(horoscope.decadal.index, expectedIndex);
});

test('decade boundary selection changes the real active engine decade', () => {
  const { session, decades, state } = createJoseModel();
  const next = decades.find((decade) => decade.startYear === 2034);
  const nextState = timeState.selectDecade(state, decades, next.id);
  assert.equal(nextState.selectedYear, null);
  const horoscope = session.getHoroscope(next.startYear);
  const expectedIndex = session.raw.palaces.find((palace) => palace.slotId === next.slotId).engineIndex;
  assert.equal(horoscope.decadal.index, expectedIndex);
});

test('two annual selections change real calculated yearly data', () => {
  const { session } = createJoseModel();
  const signature = (h) => JSON.stringify({
    stem: h.yearly.heavenlyStem,
    branch: h.yearly.earthlyBranch,
    roles: h.yearly.rolesBySlot,
    mutagens: h.yearly.mutagenStars,
    stars: h.yearly.starsBySlot
  });
  assert.notEqual(signature(session.getHoroscope(2025)), signature(session.getHoroscope(2026)));
});

test('flying-star policy uses stable role identity and applies the 福德 source exception', () => {
  const { session } = createJoseModel();
  const fortune = session.raw.palaces.find((palace) => palace.roleId === 'fortune');
  const blocked = session.getFlights(fortune.slotId);
  assert.equal(blocked.blocked, true);
  assert.deepEqual(blocked.destinations, []);
  const allFlights = session.raw.palaces.filter((palace) => palace.roleId !== 'fortune').map((palace) => session.getFlights(palace.slotId));
  assert.ok(allFlights.every((flight) => flight.destinations.length === 4));
});

test('Default Life opens as natal data without decade or annual overlays', () => {
  const { state, model } = createJoseScopeModel('natal');
  assert.equal(state.activeDecadeId, null);
  assert.equal(state.selectedYear, null);
  assert.equal(model.selection.scope, 'natal');
  assert.equal(model.annualOptions.length, 0);
  assert.equal(model.decadeOptions.some((item) => item.selected), false);
  assert.ok(model.palaces.every((palace) => palace.decadalRoleLabel === null));
  assert.ok(model.palaces.every((palace) => palace.yearlyRoleLabel === null));
  assert.equal(transformationCount(model, 'decadal'), 0);
  assert.equal(transformationCount(model, 'yearly'), 0);
  assert.equal(scopeStars(model, 'decadal').length, 0);
  assert.equal(scopeStars(model, 'yearly').length, 0);
  assert.match(renderer.renderSelectionSummary(model), /Default Life/);
  assert.match(renderer.renderAnnualsMarkup(model), /Select a decade cycle/);
});

test('selecting a decade applies only the real decade overlay', () => {
  const { state, model } = createJoseScopeModel('decadal', 2026);
  assert.ok(state.activeDecadeId);
  assert.equal(state.selectedYear, null);
  assert.equal(model.selection.scope, 'decadal');
  assert.equal(model.annualOptions.length, 10);
  assert.equal(model.annualOptions.some((item) => item.selected), false);
  assert.ok(model.palaces.every((palace) => palace.decadalRoleLabel));
  assert.ok(model.palaces.every((palace) => palace.yearlyRoleLabel === null));
  assert.equal(transformationCount(model, 'decadal'), 4);
  assert.equal(transformationCount(model, 'yearly'), 0);
  assert.ok(scopeStars(model, 'decadal').length > 0);
  assert.equal(scopeStars(model, 'yearly').length, 0);
  assert.match(renderer.renderSelectionSummary(model), /Current Decade/);
});
