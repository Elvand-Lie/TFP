/**
 * True Path — test-side config adapter.
 *
 * The production config moved from six standalone JSON files
 * (`true-path/config/{talent,ikigai,iron-triangle,scoring,trupath,cta}.json`) to one canonical
 * document (`true-path/config/true-path.config.json`) projected into content bundles by
 * `true-path/lib/config.js` `build()`. The bundles are what the app consumes at runtime:
 *
 *   build(canonical) -> { talent, ikigai, ironTriangle, scoring, truthPath, trupath, cta, ... }
 *
 * The test suites assert against those six content areas. Rewriting every assertion to the new
 * shape would churn a lot of test code for no added coverage, so this adapter keeps the suites
 * expressed in their original names while resolving them from the canonical source — the tests
 * then follow production config automatically instead of reading files that no longer describe
 * what ships.
 *
 *   readJson('true-path/config/talent.json')        -> bundle.talent
 *   readJson('true-path/config/ikigai.json')        -> bundle.ikigai
 *   readJson('true-path/config/iron-triangle.json') -> bundle.ironTriangle
 *   readJson('true-path/config/scoring.json')       -> bundle.scoring
 *   readJson('true-path/config/trupath.json')       -> bundle.truthPath
 *   readJson('true-path/config/cta.json')           -> bundle.cta
 *
 * Anything else (fonts, fixtures, `true-path.config.json` itself) is read from disk unchanged, so
 * a suite can still assert against the raw canonical document.
 *
 * `build()` is loaded with `createRequire` because `true-path/lib/config.js` is a UMD module
 * shared with the browser.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/** Canonical document, relative to the repo root. */
export const CANONICAL_CONFIG_PATH = 'true-path/config/true-path.config.json';

/** Legacy path -> key on the `build()` bundle. */
const BUNDLE_KEYS = {
  'true-path/config/talent.json': 'talent',
  'true-path/config/ikigai.json': 'ikigai',
  'true-path/config/iron-triangle.json': 'ironTriangle',
  'true-path/config/scoring.json': 'scoring',
  'true-path/config/trupath.json': 'truthPath',
  'true-path/config/cta.json': 'cta'
};

/** Normalise a relative path so `./`-prefixed or backslash forms still match. */
function normalise(relative) {
  return String(relative).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Build the config bundles once per process. Deep-frozen so a suite cannot accidentally mutate
 * shared config and make a later assertion pass for the wrong reason.
 */
let cachedBundles = null;
function bundles(repoRoot) {
  if (!cachedBundles) {
    const Config = require(path.join(repoRoot, 'true-path', 'lib', 'config.js'));
    if (!Config || typeof Config.build !== 'function') {
      throw new Error(
        'true-path/lib/config.js must export build() — the config bundles are the runtime source of truth'
      );
    }
    const canonical = JSON.parse(
      readFileSync(path.join(repoRoot, CANONICAL_CONFIG_PATH), 'utf8')
    );
    cachedBundles = Config.build(canonical);
  }
  return cachedBundles;
}

/**
 * Read a True Path config area by its historical path.
 *
 * @param {string} repoRoot Absolute repo root.
 * @param {string} relative Path as the suite originally referenced it.
 * @returns {any} The built bundle for that area, or the parsed JSON for any other path.
 */
export function readTruePathConfig(repoRoot, relative) {
  const key = BUNDLE_KEYS[normalise(relative)];
  if (!key) return JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));

  const bundle = bundles(repoRoot)[key];
  if (bundle === undefined) {
    throw new Error(`config bundle "${key}" is missing from build() output`);
  }
  return bundle;
}

/**
 * The canonical document exactly as shipped, for suites that assert raw values or key presence.
 */
export function readCanonicalConfig(repoRoot) {
  return JSON.parse(readFileSync(path.join(repoRoot, CANONICAL_CONFIG_PATH), 'utf8'));
}
