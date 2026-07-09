/**
 * ZWDS Integration Test — validates zwds.js API usage against iztro@2.4.7
 *
 * Tests every iztro API call and data-shape assumption made in assets/zwds.js.
 * Run: node tests/zwds-integration.test.mjs
 */

import iztro from 'iztro';

const { astro } = iztro;

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ── 1. CONFIG ──
section('1. astro.config({ mutagens })');
try {
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
  assert(true, 'astro.config({ mutagens }) does not throw');
} catch (e) {
  assert(false, `astro.config threw: ${e.message}`);
}

// ── 2. SOLAR CHART ──
section('2. astro.bySolar()');
let solarChart;
try {
  solarChart = astro.bySolar('1990-6-15', 6, '男', true, 'zh-CN');
  assert(!!solarChart, 'bySolar returns truthy astrolabe');
} catch (e) {
  assert(false, `bySolar threw: ${e.message}`);
}

// ── 3. LUNAR CHART (with fixLeap=true) ──
section('3. astro.byLunar()');
let lunarChart;
try {
  lunarChart = astro.byLunar('1990-5-15', 6, '男', false, true, 'zh-CN');
  assert(!!lunarChart, 'byLunar(date, time, gender, isLeap, fixLeap, lang) returns truthy');
} catch (e) {
  assert(false, `byLunar threw: ${e.message}`);
}

// ── 4. ASTROLABE TOP-LEVEL PROPERTIES ──
section('4. Astrolabe top-level fields');
const a = solarChart;
assert(typeof a.solarDate === 'string', `solarDate is string: "${a.solarDate}"`);
assert(typeof a.lunarDate === 'string', `lunarDate is string: "${a.lunarDate}"`);
assert(typeof a.chineseDate === 'string', `chineseDate is string: "${a.chineseDate}"`);
assert(typeof a.time === 'string', `time is string: "${a.time}"`);
assert(typeof a.timeRange === 'string', `timeRange is string: "${a.timeRange}"`);
assert(typeof a.sign === 'string', `sign is string: "${a.sign}"`);
assert(typeof a.zodiac === 'string', `zodiac is string: "${a.zodiac}"`);
assert(typeof a.soul === 'string', `soul is string: "${a.soul}"`);
assert(typeof a.body === 'string', `body is string: "${a.body}"`);
assert(typeof a.fiveElementsClass === 'string', `fiveElementsClass is string: "${a.fiveElementsClass}"`);
assert(typeof a.earthlyBranchOfSoulPalace === 'string', `earthlyBranchOfSoulPalace: "${a.earthlyBranchOfSoulPalace}"`);
assert(typeof a.earthlyBranchOfBodyPalace === 'string', `earthlyBranchOfBodyPalace: "${a.earthlyBranchOfBodyPalace}"`);

// ── 5. PALACES ARRAY ──
section('5. Palaces array (12 elements)');
assert(Array.isArray(a.palaces), 'palaces is an array');
assert(a.palaces.length === 12, `palaces.length === 12 (got ${a.palaces.length})`);

// ── 6. PALACE DATA SHAPE ──
section('6. Palace data shape');
const p0 = a.palaces[0];
assert(typeof p0.name === 'string', `palace.name: "${p0.name}"`);
assert(typeof p0.heavenlyStem === 'string', `palace.heavenlyStem: "${p0.heavenlyStem}"`);
assert(typeof p0.earthlyBranch === 'string', `palace.earthlyBranch: "${p0.earthlyBranch}"`);
assert(Array.isArray(p0.majorStars), 'palace.majorStars is array');
assert(Array.isArray(p0.minorStars), 'palace.minorStars is array');
assert(Array.isArray(p0.adjectiveStars), 'palace.adjectiveStars is array (NOT adpiStars)');
assert(p0.adpiStars === undefined, 'palace.adpiStars is undefined (old wrong name)');
assert(Array.isArray(p0.ages), `palace.ages is array (len=${p0.ages.length})`);

// Decadal
assert(p0.decadal !== undefined, 'palace.decadal exists');
assert(Array.isArray(p0.decadal.range), `palace.decadal.range is array: [${p0.decadal.range}]`);

// Auxiliary star series
assert(typeof p0.changsheng12 === 'string', `palace.changsheng12: "${p0.changsheng12}"`);
assert(typeof p0.boshi12 === 'string', `palace.boshi12: "${p0.boshi12}"`);
assert(typeof p0.jiangqian12 === 'string', `palace.jiangqian12: "${p0.jiangqian12}"`);
assert(typeof p0.suiqian12 === 'string', `palace.suiqian12: "${p0.suiqian12}"`);

// Star shape
section('7. Star data shape');
if (p0.majorStars.length > 0) {
  const star = p0.majorStars[0];
  assert(typeof star.name === 'string', `majorStar.name: "${star.name}"`);
  assert('brightness' in star, `majorStar has brightness prop`);
  assert('mutagen' in star, `majorStar has mutagen prop`);
}
if (p0.adjectiveStars.length > 0) {
  const adj = p0.adjectiveStars[0];
  assert(typeof adj.name === 'string', `adjectiveStar.name: "${adj.name}"`);
}

// ── 8. HOROSCOPE ──
section('8. horoscope() method');
let horo;
try {
  horo = a.horoscope('2026-7-10', 6);
  assert(!!horo, 'horoscope() returns truthy');
} catch (e) {
  assert(false, `horoscope() threw: ${e.message}`);
}

// ── 9. HOROSCOPE SCOPES — stars ──
section('9. Horoscope scope.stars (decadal/yearly/monthly/daily/hourly)');
const starScopes = ['decadal', 'yearly', 'monthly', 'daily', 'hourly'];
starScopes.forEach(key => {
  const scope = horo[key];
  assert(scope !== undefined, `horo.${key} exists`);
  if (scope) {
    assert(scope.stars !== undefined, `horo.${key}.stars exists`);
    if (scope.stars) {
      assert(Array.isArray(scope.stars), `horo.${key}.stars is array`);
    }
  }
});

// ── 10. 小限 (age) — NO .stars, HAS .palaceNames and .mutagen ──
section('10. 小限 (age) special data shape');
const age = horo.age;
assert(age !== undefined, 'horo.age exists');
if (age) {
  assert(age.stars === undefined || age.stars === null || (Array.isArray(age.stars) && age.stars.length === 0),
    `horo.age.stars is absent/empty (got: ${JSON.stringify(age.stars)?.substring(0, 60)})`);
  assert(age.palaceNames !== undefined, 'horo.age.palaceNames exists');
  if (age.palaceNames) {
    assert(Array.isArray(age.palaceNames), 'horo.age.palaceNames is array');
    assert(age.palaceNames.length === 12, `horo.age.palaceNames.length === 12 (got ${age.palaceNames.length})`);
    assert(typeof age.palaceNames[0] === 'string', `palaceNames[0]: "${age.palaceNames[0]}"`);
  }
  assert(age.mutagen !== undefined, 'horo.age.mutagen exists');
  if (age.mutagen) {
    assert(Array.isArray(age.mutagen), 'horo.age.mutagen is array');
    assert(age.mutagen.length === 4, `horo.age.mutagen.length === 4 (got ${age.mutagen.length})`);
  }
}

// ── 11. PALACE METHOD: mutagedPlaces ──
section('11. palace.mutagedPlaces()');
const palaceObj = a.palace(0);
assert(typeof palaceObj.mutagedPlaces === 'function', 'palace(0).mutagedPlaces is a function');
let destinations;
try {
  destinations = palaceObj.mutagedPlaces();
  assert(Array.isArray(destinations), `mutagedPlaces() returns array (len=${destinations.length})`);
} catch (e) {
  assert(false, `mutagedPlaces() threw: ${e.message}`);
}

// ── 12. PALACE METHOD: fliesTo ──
section('12. palace.fliesTo()');
assert(typeof palaceObj.fliesTo === 'function', 'palace(0).fliesTo is a function');
if (destinations && destinations.length > 0 && destinations[0]) {
  const dest = destinations[0];
  try {
    const result = palaceObj.fliesTo(dest.name, '禄');
    assert(typeof result === 'boolean' || result === undefined || result === null,
      `fliesTo("${dest.name}", "禄") returns boolean-like: ${result}`);
  } catch (e) {
    assert(false, `fliesTo() threw: ${e.message}`);
  }
}

// ── 13. 福德 PALACE ──
section('13. 福德 palace flying stars');
let fudePalaceIdx = -1;
for (let i = 0; i < 12; i++) {
  if (a.palaces[i].name === '福德') {
    fudePalaceIdx = i;
    break;
  }
}
assert(fudePalaceIdx >= 0, `福德 palace found at index ${fudePalaceIdx}`);
if (fudePalaceIdx >= 0) {
  const fude = a.palace(fudePalaceIdx);
  try {
    const fudeDests = fude.mutagedPlaces();
    // 福德 may or may not have outgoing flights depending on the chart,
    // but mutagedPlaces() should not throw
    assert(Array.isArray(fudeDests), `福德.mutagedPlaces() returns array (len=${fudeDests.length})`);
  } catch (e) {
    assert(false, `福德.mutagedPlaces() threw: ${e.message}`);
  }
}

// ── SUMMARY ──
console.log(`\n${'═'.repeat(50)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
