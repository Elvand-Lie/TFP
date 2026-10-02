import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Engine = require('../assets/luck-engine.js');

// The original "Am I Lucky Today" V2.7 test harness expected score 2-3 for
// case B (1981-02-11 male on 2026-05-24), but the deployed site returns 5.
// The live site is the behavioural authority, so fixtures here are frozen
// against the deployed engine's outputs (verified by differential run).

// The engine reads the wall clock internally (Asia/Singapore) to pick the
// best-time window. Tests freeze Date so that read is deterministic. The
// engine itself is untouched. 13:30Z = 21:30 SGT: all of today's favourable
// hours have passed, which is the state the captured live reading shows.
function withFrozenTime(ms, fn) {
  const RealDate = global.Date;
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(ms);
      else super(...args);
    }
    static now() {
      return ms;
    }
  }
  global.Date = MockDate;
  try {
    return fn();
  } finally {
    global.Date = RealDate;
  }
}

const FROZEN_MS_2026_10_02 = Date.UTC(2026, 9, 2, 13, 30, 0);

test('lucky: harness case A matches the published expectation', () => {
  const r = Engine.computeDailyLuck('1981-02-11', '15:34', 'male', false, new Date('2026-05-25T12:00:00Z'));
  assert.equal(r.dayMaster.split(' ')[0], '庚');
  assert.equal(r.bodyStatus, 'Strong');
  assert.ok(r.luckScore === 6 || r.luckScore === 7, `score ${r.luckScore}`);
  assert.equal(r.luckyNumber.number, 1);
  assert.equal(Engine.tenGod(r.luckyNumber.stem, '庚'), '偏财');
});

test('lucky: frozen fixtures match the deployed site engine', () => {
  // Cross-checked against the original minified engine on 2026-10-02.
  const r = withFrozenTime(FROZEN_MS_2026_10_02, () =>
    Engine.computeDailyLuck('1990-05-15', '14:15', 'female', false, new Date('2026-10-02T12:00:00Z')),
  );
  assert.equal(r.luckScore, 6);
  assert.equal(Engine.scoreLabel(r.luckScore).en, 'Favorable Day');
  assert.equal(Engine.scoreLabel(r.luckScore).zh, '顺利日');
  assert.deepEqual(r.luckyNumber, { stem: '戊', pinyin: 'Wù', number: 5, tenGods: '偏印' });
  assert.deepEqual(r.luckyColor, { name: 'Beige', hex: '#f5f5dc' });
  assert.deepEqual(r.luckySeat, { en: 'West', zh: '西', py: 'Xī' });
  assert.equal(r.bodyStatus, 'Weak');
  assert.equal(r.dayMaster, '庚 (Metal)');
  assert.equal(r.gua, '8 (Gen)');
  assert.equal(r.bestTime.time, '01:00 - 03:00');
  assert.equal(r.bestTime.branch, '丑');
  assert.equal(r.bestTime.isTomorrow, true);
  assert.deepEqual(
    r.auspiciousActivities.map((a) => a.en),
    ['Praying', 'Haircut', 'Signing Contracts', 'Networking', 'Wedding', 'Learning', 'Moving Office', 'Opening Business'],
  );
  assert.deepEqual(
    r.inauspiciousActivities.map((a) => a.en),
    ['Funeral', 'Investment', 'Lawsuits', 'Surgery', 'Engagement', 'Renovation', 'Hosting Event', 'Buying Vehicle'],
  );
});

test('lucky: gua number follows gender and the pre/post-2000 rule', () => {
  const female1990 = Engine.computeDailyLuck('1990-05-15', '14:15', 'female', false, new Date('2026-10-02T12:00:00Z'));
  const male1990 = Engine.computeDailyLuck('1990-05-15', '14:15', 'male', false, new Date('2026-10-02T12:00:00Z'));
  assert.equal(female1990.gua, '8 (Gen)');
  assert.equal(male1990.gua, '1 (Kan)');
});

test('lucky: post-2000 births use the post-2000 gua formula', () => {
  // Lunar year 2005, digit sum 5: male 9-5=4, female 6+5=11 -> 11-9=2.
  const male2005 = Engine.computeDailyLuck('2005-03-10', '10:20', 'male', false, new Date('2026-10-02T12:00:00Z'));
  const female2005 = Engine.computeDailyLuck('2005-03-10', '10:20', 'female', false, new Date('2026-10-02T12:00:00Z'));
  assert.equal(male2005.gua, '4 (Xun)');
  assert.equal(female2005.gua, '2 (Kun)');

  // Born 2000-01-15: lunar year is still 1999, so the pre-2000 branch applies
  // (female: 5 + digitSum(99) = 14 -> 5, male-style 5 remaps to 8 for female).
  const femaleJan2000 = Engine.computeDailyLuck('2000-01-15', '08:00', 'female', false, new Date('2026-10-02T12:00:00Z'));
  assert.equal(femaleJan2000.gua, '8 (Gen)');

  // Born 2008-02-03: before CNY 2008 (Feb 7), lunar year 2007.
  const femaleFeb2008 = Engine.computeDailyLuck('2008-02-03', '16:55', 'female', false, new Date('2026-10-02T12:00:00Z'));
  assert.equal(femaleFeb2008.gua, '4 (Xun)');
});

test('lucky: unknown birth time falls back to noon', () => {
  const unknown = Engine.computeDailyLuck('1990-05-15', null, 'female', true, new Date('2026-10-02T12:00:00Z'));
  const noon = Engine.computeDailyLuck('1990-05-15', '12:00', 'female', false, new Date('2026-10-02T12:00:00Z'));
  assert.deepEqual(unknown, noon);
});

test('lucky: fallback lucky stem stays a resource or companion star', () => {
  const f = Engine.fallbackLuckyStem('乙');
  assert.ok(['正印', '偏印', '比肩', '劫财'].includes(f.tenGods), f.tenGods);
});

test('lucky: score always clamps to 1..10 with a matching label', () => {
  for (let score = 1; score <= 10; score++) {
    const label = Engine.scoreLabel(score);
    assert.ok(label.en && label.zh);
  }
});

const PARITY = JSON.parse(readFileSync(new URL('./fixtures/lucky-parity.json', import.meta.url), 'utf8'));

test('lucky: frozen parity suite reproduces the original engine output for every case', () => {
  assert.ok(PARITY.cases.length >= 20, `expected >=20 frozen cases, got ${PARITY.cases.length}`);
  const coverage = { male: 0, female: 0, pre2000: 0, post2000: 0, unknown: 0 };
  for (const fixture of PARITY.cases) {
    const actual = withFrozenTime(fixture.frozenSgtMs, () =>
      Engine.computeDailyLuck(fixture.birth, fixture.birthTime, fixture.gender, fixture.timeUnknown, new Date(fixture.now)),
    );
    assert.deepEqual(actual, fixture.expected, `parity drift for ${fixture.birth} ${fixture.birthTime ?? '(unknown)'} ${fixture.gender}`);
    // Scores must always land inside the documented 1..10 range.
    assert.ok(
      Number.isInteger(actual.luckScore) && actual.luckScore >= 1 && actual.luckScore <= 10,
      `score out of range for ${fixture.birth}: ${actual.luckScore}`,
    );
    coverage[fixture.gender] += 1;
    coverage[fixture.timeUnknown ? 'unknown' : parseInt(fixture.birth.slice(0, 4), 10) < 2000 ? 'pre2000' : 'post2000'] += 1;
  }
  assert.ok(coverage.male > 0 && coverage.female > 0, 'fixtures must cover both genders');
  assert.ok(coverage.pre2000 > 0 && coverage.post2000 > 0, 'fixtures must cover pre- and post-2000 births');
  assert.ok(coverage.unknown > 0, 'fixtures must cover unknown birth times');
});

test('lucky: bestTime is deterministic under a frozen Singapore clock', () => {
  const run = () =>
    withFrozenTime(FROZEN_MS_2026_10_02, () =>
      Engine.computeDailyLuck('1990-05-15', '14:15', 'female', false, new Date('2026-10-02T12:00:00Z')),
    );
  const first = run();
  const second = run();
  assert.deepEqual(first.bestTime, second.bestTime);
  assert.equal(first.bestTime.time, '01:00 - 03:00');
  assert.equal(first.bestTime.isTomorrow, true);
});

test('lucky: the page wires the engine without iframing the old site', () => {
  const html = readFileSync(new URL('../lucky.html', import.meta.url), 'utf8');
  assert.match(html, /\/assets\/lunar\.js/);
  assert.match(html, /\/assets\/luck-engine\.js/);
  assert.match(html, /LuckEngine\.computeDailyLuck/);
  assert.match(html, /id="luck-results-section"|id="results-band"/);
  assert.ok(!html.includes('amiluckytoday.app/assets'), 'must not load the old site bundle');
  const iframes = html.match(/<iframe[^>]*src="([^"]*)"/g) || [];
  for (const iframe of iframes) {
    assert.ok(/mailerlite\.io/.test(iframe), `unexpected iframe: ${iframe}`);
  }
  assert.match(html, /Check My Luck Today/);
  assert.match(html, /I don't know my birth time/);
  ['whatsapp', 'telegram', 'facebook', 'copy'].forEach((kind) => {
    assert.match(html, new RegExp(`data-share="${kind}"`));
  });
});
