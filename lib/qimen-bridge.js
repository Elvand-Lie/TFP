// CJS bridge for qimen-dunjia
// The qimen-dunjia package is ESM-only, which causes ERR_REQUIRE_ESM
// in Vercel's production Node.js runtime. This bridge loads the
// pre-bundled standalone IIFE build instead, which is CJS-compatible.
const fs = require('fs');
const path = require('path');

let _qimen = null;

function getQimen() {
  if (_qimen) return _qimen;
  const standaloneFile = path.join(
    __dirname, '..', 'node_modules', 'qimen-dunjia', 'dist', 'qimen.standalone.min.js'
  );
  const code = fs.readFileSync(standaloneFile, 'utf-8');
  // The standalone build is: var Qimen = (() => { ... })();
  // We evaluate it and capture the Qimen global.
  const fn = new Function(code + '\nreturn typeof Qimen !== "undefined" ? Qimen : null;');
  _qimen = fn();
  return _qimen;
}

module.exports = { getQimen };
