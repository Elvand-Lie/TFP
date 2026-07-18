import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import iztro from 'iztro';

const require = createRequire(import.meta.url);
const adapter = require('../assets/zwds-engine-adapter.js');
const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../zwds-codex-agent-kit/zwds-codex-agent-kit/fixtures/reference_case_jose.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const rawFixtureInput = {
  profileName: fixture.input.name,
  calendarType: fixture.input.calendarType,
  gender: fixture.input.gender,
  birthDate: fixture.input.birthDate,
  birthTime: fixture.input.birthTime,
  birthHourBranch: fixture.input.birthHourBranch,
  isUnknownTime: false,
  isLeapMonth: false
};

function chartSignature(chart) {
  return {
    solarDate: chart.solarDate,
    lunarDate: chart.lunarDate,
    chineseDate: chart.chineseDate,
    soul: chart.soul,
    body: chart.body,
    bureau: chart.fiveElementsClass,
    life: chart.earthlyBranchOfSoulPalace,
    bodyBranch: chart.earthlyBranchOfBodyPalace,
    palaces: chart.palaces.map((palace) => ({
      branch: palace.earthlyBranch,
      name: palace.name,
      decadal: palace.decadal.range,
      major: palace.majorStars.map((star) => [star.name, star.type, star.mutagen]),
      minor: palace.minorStars.map((star) => [star.name, star.type, star.mutagen]),
      adjectiveCount: palace.adjectiveStars.length
    }))
  };
}

test('canonical Jose input normalizes without losing exact display time', () => {
  const normalized = adapter.normalizeInput(rawFixtureInput);
  assert.equal(normalized.profileName, 'Jose');
  assert.equal(normalized.sourceDate, '1981-02-11');
  assert.equal(normalized.exactBirthTime, '15:34');
  assert.equal(normalized.birthHourBranch, 'shen');
  assert.equal(normalized.iztroTimeIndex, 8);
  assert.equal(normalized.gender, 'male');
  assert.equal(normalized.timezone, 'Asia/Shanghai');
  assert.equal(normalized.timeStandard, 'beijing');
  assert.equal(normalized.trueSolarTimeCorrection, false);
});

test('canonical Jose formula-sensitive anchors match the supplied reference', () => {
  const raw = adapter.createChartSession(iztro, rawFixtureInput).raw;
  assert.equal(raw.solarDate, '1981-2-11');
  assert.equal(raw.lunarDate, '一九八一年正月初七');
  assert.deepEqual(raw.chineseDate.split(' '), fixture.visibleReferenceAnchors.fourPillars);
  assert.equal(raw.bureauLabel, fixture.visibleReferenceAnchors.fiveElementBureau);
  assert.equal(raw.lifeMasterLabel, fixture.visibleReferenceAnchors.lifeMaster);
  assert.equal(raw.bodyMasterLabel, fixture.visibleReferenceAnchors.bodyMaster);
  assert.equal(raw.lifePalaceBranch, 'wu');
  assert.equal(raw.bodyPalaceBranch, 'xu');
});

test('solar and equivalent lunar Jose calls produce the same structural chart', () => {
  adapter.configureIztro(iztro);
  const solar = iztro.astro.bySolar('1981-2-11', 8, '男', true, 'zh-TW');
  const lunar = iztro.astro.byLunar('1981-1-7', 8, '男', false, true, 'zh-TW');
  assert.deepEqual(chartSignature(solar), chartSignature(lunar));
});

test('twelve unique branch slots remain in characterized engine order', () => {
  const slots = adapter.createChartSession(iztro, rawFixtureInput).raw.palaces.map((palace) => palace.slotId);
  assert.deepEqual(slots, ['yin', 'mao', 'chen', 'si', 'wu', 'wei', 'shen', 'you', 'xu', 'hai', 'zi', 'chou']);
  assert.equal(new Set(slots).size, 12);
});

test('visible Jose palace and major-star anchors remain stable', () => {
  const raw = adapter.createChartSession(iztro, rawFixtureInput).raw;
  const at = (slot) => raw.palaces.find((palace) => palace.slotId === slot);
  assert.deepEqual(at('si').majorStars.map((star) => star.name), ['巨門']);
  assert.deepEqual(at('wu').majorStars.map((star) => star.name), ['廉貞', '天相']);
  assert.deepEqual(at('wei').majorStars.map((star) => star.name), ['天梁']);
  assert.deepEqual(at('shen').majorStars.map((star) => star.name), ['七殺']);
});

test('every engine-provided natal star collection is retained, including 祿存 and 天馬', () => {
  const raw = adapter.createChartSession(iztro, rawFixtureInput).raw;
  const all = raw.palaces.flatMap((palace) => [
    ...palace.majorStars.map((star) => ({ ...star, slotId: palace.slotId, collection: 'major' })),
    ...palace.minorStars.map((star) => ({ ...star, slotId: palace.slotId, collection: 'minor' })),
    ...palace.adjectiveStars.map((star) => ({ ...star, slotId: palace.slotId, collection: 'adjective' }))
  ]);
  assert.equal(new Set(all.map((star) => star.collection)).size, 3);
  assert.ok(new Set(all.map((star) => star.type)).has('major'));
  const lucun = all.find((star) => star.type === 'lucun');
  const tianma = all.find((star) => star.type === 'tianma');
  assert.deepEqual({ label: lucun.name, slotId: lucun.slotId, collection: lucun.collection }, { label: '祿存', slotId: 'you', collection: 'major' });
  assert.deepEqual({ label: tianma.name, slotId: tianma.slotId, collection: tianma.collection }, { label: '天馬', slotId: 'hai', collection: 'major' });
});

test('all ten configured stem transformations match the approved table', () => {
  const configured = adapter.configureIztro(iztro).getConfig().mutagens;
  assert.deepEqual(configured, {
    jiaHeavenly: ['lianzhenMaj', 'pojunMaj', 'wuquMaj', 'taiyangMaj'],
    yiHeavenly: ['tianjiMaj', 'tianliangMaj', 'ziweiMaj', 'taiyinMaj'],
    bingHeavenly: ['tiantongMaj', 'tianjiMaj', 'wenchangMin', 'lianzhenMaj'],
    dingHeavenly: ['taiyinMaj', 'tiantongMaj', 'tianjiMaj', 'jumenMaj'],
    wuHeavenly: ['tanlangMaj', 'taiyinMaj', 'youbiMin', 'tianjiMaj'],
    jiHeavenly: ['wuquMaj', 'tanlangMaj', 'tianliangMaj', 'wenquMin'],
    gengHeavenly: ['taiyangMaj', 'wuquMaj', 'taiyinMaj', 'tiantongMaj'],
    xinHeavenly: ['jumenMaj', 'taiyangMaj', 'wenquMin', 'wenchangMin'],
    renHeavenly: ['tianliangMaj', 'ziweiMaj', 'zuofuMin', 'wuquMaj'],
    guiHeavenly: ['pojunMaj', 'jumenMaj', 'taiyinMaj', 'tanlangMaj']
  });
});

test('Jose decade and 2026 annual state match characterized reference values', () => {
  const session = adapter.createChartSession(iztro, rawFixtureInput);
  const decadePalace = session.raw.palaces.find((palace) => palace.slotId === 'yin');
  assert.deepEqual(decadePalace.decadal.range, [44, 53]);
  assert.equal(1981 + decadePalace.decadal.range[0] - 1, 2024);
  const horoscope = session.getHoroscope(2026);
  assert.equal(horoscope.age.nominalAge, 46);
  assert.equal(horoscope.decadal.index, decadePalace.engineIndex);
  assert.equal(`${horoscope.yearly.heavenlyStem}${horoscope.yearly.earthlyBranch}`, '丙午');
  assert.equal(horoscope.yearly.mutagenStars.length, 4);
  assert.equal(Object.keys(horoscope.yearly.rolesBySlot).length, 12);
});

test('yin/yang and gender produce characterized decade directions', () => {
  adapter.configureIztro(iztro);
  function secondDecadeDelta(date, gender) {
    const chart = iztro.astro.bySolar(date, 8, gender, true, 'zh-TW');
    const lifeIndex = chart.palaces.findIndex((palace) => palace.name === '命宮');
    const ranges = chart.palaces.map((palace) => palace.decadal.range[0]);
    const firstAge = Math.min(...ranges);
    return (ranges.indexOf(firstAge + 10) - lifeIndex + 12) % 12;
  }
  assert.equal(secondDecadeDelta('1981-2-11', '男'), 11, '陰男逆行');
  assert.equal(secondDecadeDelta('1981-2-11', '女'), 1, '陰女順行');
  assert.equal(secondDecadeDelta('1990-6-15', '男'), 1, '陽男順行');
  assert.equal(secondDecadeDelta('1990-6-15', '女'), 11, '陽女逆行');
});

test('birth-time boundaries normalize early 子, 申, late 子, and unknown fallback', () => {
  assert.equal(adapter.timeToIndex('00:00'), 0);
  assert.equal(adapter.timeToIndex('00:59'), 0);
  assert.equal(adapter.timeToIndex('15:00'), 8);
  assert.equal(adapter.timeToIndex('16:59'), 8);
  assert.equal(adapter.timeToIndex('23:00'), 12);
  assert.equal(adapter.timeToIndex('23:59'), 12);
  const unknown = adapter.normalizeInput({ ...rawFixtureInput, birthTime: '', birthHourBranch: undefined, isUnknownTime: true });
  assert.equal(unknown.iztroTimeIndex, 6);
  assert.equal(unknown.birthHourBranch, 'wu');
  assert.equal(unknown.exactBirthTime, null);
});

test('Gregorian validation rejects impossible days and accepts real boundaries', () => {
  assert.equal(adapter.isValidGregorianDate('2000-02-29'), true);
  assert.equal(adapter.isValidGregorianDate('1900-02-29'), false);
  assert.equal(adapter.isValidGregorianDate('1981-02-28'), true);
  assert.equal(adapter.isValidGregorianDate('1981-02-29'), false);
  assert.equal(adapter.isValidGregorianDate('1981-04-30'), true);
  assert.equal(adapter.isValidGregorianDate('1981-04-31'), false);
  assert.throws(() => adapter.normalizeInput({ ...rawFixtureInput, birthDate: '1981-02-31' }), /公曆日期無效/);
});

test('lunar input accepts valid leap month and rejects nonexistent leap selection', () => {
  const valid = adapter.createChartSession(iztro, {
    profileName: 'Leap', calendarType: 'lunar', gender: 'male', birthDate: '1984-10-01',
    birthTime: '12:00', isUnknownTime: false, isLeapMonth: true
  });
  assert.equal(valid.raw.rawDates.lunarDate.isLeap, true);
  assert.throws(() => adapter.createChartSession(iztro, {
    ...rawFixtureInput, calendarType: 'lunar', birthDate: '1981-01-07', isLeapMonth: true
  }), /不是閏月/);
});

test('zh-CN and zh-TW outputs are structurally equivalent', () => {
  const astro = adapter.configureIztro(iztro);
  const structural = (chart) => chart.palaces.map((palace) => ({
    branch: palace.earthlyBranch,
    counts: [palace.majorStars.length, palace.minorStars.length, palace.adjectiveStars.length],
    types: [...palace.majorStars, ...palace.minorStars, ...palace.adjectiveStars].map((star) => star.type),
    range: palace.decadal.range
  }));
  const cn = astro.bySolar('1981-2-11', 8, '男', true, 'zh-CN');
  const cnStructure = structural(cn);
  const tw = astro.bySolar('1981-2-11', 8, '男', true, 'zh-TW');
  assert.deepEqual(structural(tw), cnStructure);
  assert.equal(cn.soul, '破军');
  assert.equal(tw.soul, '破軍');
});
