'use strict';
const assert = require('assert');
const path = require('path');
const engine = require(path.join(__dirname, '..', 'assets', 'zwds-engine-adapter.js'));
const time = require(path.join(__dirname, '..', 'assets', 'zwds-time-state.js'));

const ROLE_RING = ['life', 'siblings', 'spouse', 'children', 'wealth', 'health', 'travel', 'friends', 'career', 'property', 'fortune', 'parents'];

for (const branch of engine.BRANCHES) {
  const targets = engine.getTrineSlots(branch.id);
  assert.strictEqual(targets.length, 3, `${branch.id} must return exactly three targets`);
  assert.strictEqual(new Set(targets).size, 3, `${branch.id} targets must be unique`);
  assert(!targets.includes(branch.id), `${branch.id} must not target itself`);
}

const lifeIndex = 0;
const lifeTargets = [4, 6, 8].map((offset) => ROLE_RING[(lifeIndex + offset) % 12]);
assert.deepStrictEqual(lifeTargets, ['wealth', 'travel', 'career'], 'Life Palace must point to Money, Travel and Career');

const lifeSlot = engine.BRANCHES[0].id;
assert.deepStrictEqual(
  engine.getTrineSlots(lifeSlot),
  [engine.BRANCHES[4].id, engine.BRANCHES[6].id, engine.BRANCHES[8].id],
  'Physical relationship must be +4, +6 and +8'
);

const decades = Array.from({ length: 12 }, (_, index) => ({
  id: `d${index}`,
  startYear: 2020 + index * 10,
  endYear: 2029 + index * 10
}));
let state = time.createState(decades);
assert.strictEqual(time.deepestScope(state), 'natal');
state = time.selectDecade(state, decades, 'd0');
assert.strictEqual(time.deepestScope(state), 'decadal');
state = time.selectYear(state, decades, 2024);
assert.strictEqual(time.deepestScope(state), 'yearly');
state = time.selectMonth(state, 7);
assert.strictEqual(time.deepestScope(state), 'monthly');
state = time.selectDay(state, 15);
assert.strictEqual(time.deepestScope(state), 'daily');
state = time.selectTime(state, 6, engine.TIME_OPTIONS.map((item) => item.index));
assert.strictEqual(time.deepestScope(state), 'hourly');

console.log('relationship tests: PASS');
