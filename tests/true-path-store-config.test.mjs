/**
 * True Path — store credential resolution.
 *
 * The report store is optional for reads but REQUIRED for writes a visitor would otherwise be
 * misled about (a saved report, an emailed report). So the rule that decides "is a store
 * configured?" has to be exact: getting it wrong in the optimistic direction turns a missing
 * credential into a confusing runtime auth failure, and getting it wrong in the pessimistic
 * direction makes a working deployment claim it has no storage.
 *
 * The rule lives in `true-path/lib/store-config.js` (pure, no I/O), which is what
 * `api/true-path-store.ts` uses at runtime — so these tests cover the code that actually runs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const StoreConfig = require('../true-path/lib/store-config.js');

/** Build an env from a { VAR: value } map, leaving unlisted vars unset. */
function env(map) {
  return { ...map };
}

const INTEGRATION_URL = 'UPSTASH_REDIS_REST_KV_REST_API_URL';
const INTEGRATION_TOKEN = 'UPSTASH_REDIS_REST_KV_REST_API_TOKEN';
const MANUAL_URL = 'KV_REST_API_URL';
const MANUAL_TOKEN = 'KV_REST_API_TOKEN';
const UPSTASH_URL = 'UPSTASH_REDIS_REST_URL';
const UPSTASH_TOKEN = 'UPSTASH_REDIS_REST_TOKEN';

const LIVE_URL = 'https://example-redis.upstash.io';
const LIVE_TOKEN = 'AaBbCc1234567890';

test('store-config: the three env pairs are declared most-preferred first', () => {
  assert.deepEqual(StoreConfig.REST_ENV_PAIRS, [
    [INTEGRATION_URL, INTEGRATION_TOKEN],
    [MANUAL_URL, MANUAL_TOKEN],
    [UPSTASH_URL, UPSTASH_TOKEN],
  ]);
});

test('store-config: nothing set means not configured', () => {
  assert.equal(StoreConfig.resolveRestConfig(env({})), null);
  assert.equal(StoreConfig.resolveRestConfig(null), null);
  assert.equal(StoreConfig.resolveRestConfig(undefined), null);
});

test('store-config: each pair alone configures the store', () => {
  const integration = StoreConfig.resolveRestConfig(
    env({ [INTEGRATION_URL]: LIVE_URL, [INTEGRATION_TOKEN]: LIVE_TOKEN })
  );
  assert.deepEqual(integration, { url: LIVE_URL, token: LIVE_TOKEN });

  const manual = StoreConfig.resolveRestConfig(
    env({ [MANUAL_URL]: LIVE_URL, [MANUAL_TOKEN]: LIVE_TOKEN })
  );
  assert.deepEqual(manual, { url: LIVE_URL, token: LIVE_TOKEN });

  const upstash = StoreConfig.resolveRestConfig(
    env({ [UPSTASH_URL]: LIVE_URL, [UPSTASH_TOKEN]: LIVE_TOKEN })
  );
  assert.deepEqual(upstash, { url: LIVE_URL, token: LIVE_TOKEN });
});

test('store-config: the integration pair wins when every pair is present', () => {
  const resolved = StoreConfig.resolveRestConfig(
    env({
      [INTEGRATION_URL]: 'https://integration.upstash.io',
      [INTEGRATION_TOKEN]: 'integration-token',
      [MANUAL_URL]: 'https://manual.upstash.io',
      [MANUAL_TOKEN]: 'manual-token',
      [UPSTASH_URL]: 'https://upstash.upstash.io',
      [UPSTASH_TOKEN]: 'upstash-token',
    })
  );
  assert.deepEqual(resolved, {
    url: 'https://integration.upstash.io',
    token: 'integration-token',
  });
});

test('store-config: the manual pair wins over the legacy Upstash pair', () => {
  const resolved = StoreConfig.resolveRestConfig(
    env({
      [MANUAL_URL]: 'https://manual.upstash.io',
      [MANUAL_TOKEN]: 'manual-token',
      [UPSTASH_URL]: 'https://upstash.upstash.io',
      [UPSTASH_TOKEN]: 'upstash-token',
    })
  );
  assert.deepEqual(resolved, { url: 'https://manual.upstash.io', token: 'manual-token' });
});

test('store-config: a stale manual pair cannot shadow a live integration pair', () => {
  // The exact failure this rule exists for: the integration is provisioned, but an alias left
  // behind by an earlier hand-rolled setup still points at a dead database.
  const resolved = StoreConfig.resolveRestConfig(
    env({
      [INTEGRATION_URL]: 'https://live.upstash.io',
      [INTEGRATION_TOKEN]: 'live-token',
      [MANUAL_URL]: 'https://stale.upstash.io',
      [MANUAL_TOKEN]: 'stale-token',
    })
  );
  assert.equal(resolved.url, 'https://live.upstash.io');
  assert.equal(resolved.token, 'live-token');
});

test('store-config: a pair missing either half does not configure the store', () => {
  // A URL with no token, and a token with no URL, are both incomplete setups.
  assert.equal(StoreConfig.resolveRestConfig(env({ [INTEGRATION_URL]: LIVE_URL })), null);
  assert.equal(StoreConfig.resolveRestConfig(env({ [INTEGRATION_TOKEN]: LIVE_TOKEN })), null);
  assert.equal(StoreConfig.resolveRestConfig(env({ [MANUAL_URL]: LIVE_URL })), null);
  assert.equal(StoreConfig.resolveRestConfig(env({ [UPSTASH_URL]: LIVE_TOKEN })), null);
});

test('store-config: names are never mixed across setups', () => {
  // Whole-pair resolution: a URL from one setup with a token from another is always a
  // misconfiguration, and must NOT be reported as configured.
  assert.equal(
    StoreConfig.resolveRestConfig(env({ [INTEGRATION_URL]: LIVE_URL, [MANUAL_TOKEN]: LIVE_TOKEN })),
    null
  );
  assert.equal(
    StoreConfig.resolveRestConfig(env({ [MANUAL_URL]: LIVE_URL, [UPSTASH_TOKEN]: LIVE_TOKEN })),
    null
  );
  assert.equal(
    StoreConfig.resolveRestConfig(env({ [UPSTASH_URL]: LIVE_URL, [INTEGRATION_TOKEN]: LIVE_TOKEN })),
    null
  );
});

test('store-config: a half-configured preferred pair falls through to a complete fallback', () => {
  // The preferred pair is unusable, so the next COMPLETE pair must be used rather than giving up.
  const resolved = StoreConfig.resolveRestConfig(
    env({
      [INTEGRATION_URL]: LIVE_URL, // no token
      [MANUAL_URL]: 'https://manual.upstash.io',
      [MANUAL_TOKEN]: 'manual-token',
    })
  );
  assert.deepEqual(resolved, { url: 'https://manual.upstash.io', token: 'manual-token' });
});

test('store-config: a variable holding its own NAME is a placeholder, not a credential', () => {
  // Observed in this project: scaffolding wrote the var's own name as its value, so the store
  // resolved a non-URL "URL" and failed later as an opaque auth error. Treat it as unset.
  assert.equal(
    StoreConfig.resolveRestConfig(
      env({ [INTEGRATION_URL]: INTEGRATION_URL, [INTEGRATION_TOKEN]: INTEGRATION_TOKEN })
    ),
    null
  );
  assert.equal(
    StoreConfig.resolveRestConfig(env({ [MANUAL_URL]: MANUAL_URL, [MANUAL_TOKEN]: MANUAL_TOKEN })),
    null
  );
  // A placeholder pair must also not beat a real fallback pair.
  const resolved = StoreConfig.resolveRestConfig(
    env({
      [MANUAL_URL]: MANUAL_URL,
      [MANUAL_TOKEN]: MANUAL_TOKEN,
      [UPSTASH_URL]: 'https://real.upstash.io',
      [UPSTASH_TOKEN]: 'real-token',
    })
  );
  assert.deepEqual(resolved, { url: 'https://real.upstash.io', token: 'real-token' });
});

test('store-config: empty and whitespace-only values count as unset', () => {
  assert.equal(
    StoreConfig.resolveRestConfig(env({ [INTEGRATION_URL]: '', [INTEGRATION_TOKEN]: '' })),
    null
  );
  assert.equal(
    StoreConfig.resolveRestConfig(env({ [INTEGRATION_URL]: '   ', [INTEGRATION_TOKEN]: '  ' })),
    null
  );
  // An empty preferred pair must not block a complete fallback pair.
  const resolved = StoreConfig.resolveRestConfig(
    env({
      [INTEGRATION_URL]: '',
      [INTEGRATION_TOKEN]: '',
      [MANUAL_URL]: 'https://manual.upstash.io',
      [MANUAL_TOKEN]: 'manual-token',
    })
  );
  assert.deepEqual(resolved, { url: 'https://manual.upstash.io', token: 'manual-token' });
});

test('store-config: a URL that is not an absolute http(s) URL is unusable', () => {
  for (const bad of ['not-a-url', 'example.upstash.io', '/relative/path', 'redis://example:6379']) {
    assert.equal(
      StoreConfig.resolveRestConfig(env({ [INTEGRATION_URL]: bad, [INTEGRATION_TOKEN]: LIVE_TOKEN })),
      null,
      `${bad} must not be accepted as a REST URL`
    );
  }

  // https and http are both acceptable (a local mock may be plain http).
  assert.deepEqual(
    StoreConfig.resolveRestConfig(
      env({ [INTEGRATION_URL]: 'http://localhost:8080', [INTEGRATION_TOKEN]: LIVE_TOKEN })
    ),
    { url: 'http://localhost:8080', token: LIVE_TOKEN }
  );
});

test('store-config: surrounding whitespace on a real value is tolerated', () => {
  const resolved = StoreConfig.resolveRestConfig(
    env({ [INTEGRATION_URL]: `  ${LIVE_URL}  `, [INTEGRATION_TOKEN]: `\t${LIVE_TOKEN}\n` })
  );
  assert.deepEqual(resolved, { url: LIVE_URL, token: LIVE_TOKEN });
});
