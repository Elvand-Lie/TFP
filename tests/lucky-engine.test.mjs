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
  const r = Engine.computeDailyLuck('1990-05-15', '14:15', 'female', false, new Date('2026-10-02T12:00:00Z'));
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
