'use strict';
const assert = require('assert');
const path = require('path');
const router = require(path.join(__dirname, '..', 'assets', 'relationship-routing.js'));

const grid = { left: 0, top: 0, right: 1200, bottom: 600, width: 1200, height: 600 };
const center = { left: 300, top: 150, right: 900, bottom: 450, width: 600, height: 300 };
const palaces = {
  topLeft: { left: 0, top: 0, right: 300, bottom: 150, width: 300, height: 150 },
  topRight: { left: 900, top: 0, right: 1200, bottom: 150, width: 300, height: 150 },
  rightMid: { left: 900, top: 150, right: 1200, bottom: 300, width: 300, height: 150 },
  bottomRight: { left: 900, top: 450, right: 1200, bottom: 600, width: 300, height: 150 },
  bottomLeft: { left: 0, top: 450, right: 300, bottom: 600, width: 300, height: 150 },
  leftMid: { left: 0, top: 150, right: 300, bottom: 300, width: 300, height: 150 }
};

const targets = [palaces.topRight, palaces.rightMid, palaces.bottomRight];
const routes = targets.map((target, index) => router.route(palaces.bottomLeft, target, center, grid, index, {
  baseInset: 10,
  laneSpacing: 8,
  fanSpacing: 10,
  cornerRadius: 10,
  protectedInset: 24
}));

routes.forEach((route, index) => {
  assert(route.d.startsWith('M '), `route ${index} must be an SVG path`);
  assert(route.d.includes('Q '), `route ${index} must use rounded corners`);
  assert(route.points.length >= 4, `route ${index} must include anchors and rail points`);
  route.points.forEach((point) => {
    assert(!router.pointInsideRect(point, route.protectedRect), `route ${index} must avoid protected centre content`);
  });
});

assert.notStrictEqual(routes[0].rail.top, routes[1].rail.top, 'routes must use separate lanes');
assert.notStrictEqual(routes[1].rail.top, routes[2].rail.top, 'routes must use separate lanes');
assert.strictEqual(router.facingSide(palaces.bottomLeft, center), 'right');
assert.strictEqual(router.facingSide(palaces.rightMid, center), 'left');

console.log('subtle inner-rail routing tests: PASS');
