'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'zwds.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets', 'zwds.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'zwds-addon.css'), 'utf8');
const routing = fs.readFileSync(path.join(root, 'assets', 'relationship-routing.js'), 'utf8');

assert(!html.includes('id="zwds-scope-selector"'), 'independent relationship scope selector must be removed');
assert(html.includes('Return to Natal · 返回本命'), 'natal reset must be clearly named');
assert(html.includes('follows the currently displayed decade/year/month/day/hour automatically'), 'automatic scope behavior must be explained');
assert(js.includes('engine.getTrineSlots(selectedRelationshipSourceSlotId)'), 'production UI must use engine trine geometry');
assert(js.includes("marker-end', 'url(#zwds-trine-arrowhead)'"), 'arrows must use actual SVG arrowheads');
assert(html.includes('assets/relationship-routing.js'), 'production page must load the inner-rail router');
assert(js.includes("data-route', 'inner-rail-subtle'"), 'production paths must identify subtle inner-rail routing');
assert(routing.includes('pointsAlongPerimeter'), 'router must follow the centre perimeter');
assert(css.includes('.zwds-center::before'), 'centre must include an opaque protected content card');
assert(!js.includes('relationshipScope ='), 'no independent relationship scope state should remain');
assert(css.includes('.zwds-palace.is-trine-source'), 'source highlight style must exist');
assert(css.includes('.zwds-palace.is-trine-target'), 'trine target highlight style must exist');
assert(css.includes('.zwds-palace.is-trine-opposite'), 'opposite target highlight style must exist');
console.log('static contract tests: PASS');

assert(js.includes('appendRouteGradient'), 'production routes must use source-to-target opacity gradients');
assert(js.includes("markerUnits', 'userSpaceOnUse'"), 'arrowheads must remain tiny regardless of path stroke width');
assert(css.includes('REFERENCE-STYLE SUBTLE DESTINATION ARROWS'), 'subtle arrow visual override must exist');
