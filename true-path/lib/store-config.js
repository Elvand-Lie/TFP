// @ts-check
/**
 * True Path — store credential resolution.
 *
 * LOGIC ONLY, no I/O. Decides which environment variables configure the report store, so the
 * fail-closed rule ("a write a visitor would be misled about must never be reported as a
 * success") rests on something that can be unit-tested, rather than on whatever happens to be
 * set in one environment.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).TruePathStoreConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * The var pairs we accept, MOST-PREFERRED FIRST.
   *
   * The Vercel/Upstash integration writes `UPSTASH_REDIS_REST_KV_REST_API_*`. An older manual
   * setup wrote `KV_REST_API_URL` / `KV_REST_API_TOKEN`. Both are honoured so an existing project
   * keeps working, but the integration pair wins when present so a stale manual alias left behind
   * by an earlier setup cannot shadow the live one.
   */
  const REST_ENV_PAIRS = [
    ['UPSTASH_REDIS_REST_KV_REST_API_URL', 'UPSTASH_REDIS_REST_KV_REST_API_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
  ];

  /**
   * Every name we read. A value equal to one of these is a PLACEHOLDER, not a credential: tooling
   * that scaffolds env files has been observed writing the var's own name as its value, which
   * otherwise resolves to a nonsense URL and fails later as a confusing auth error.
   */
  const ENV_NAMES = {};
  for (let i = 0; i < REST_ENV_PAIRS.length; i++) {
    ENV_NAMES[REST_ENV_PAIRS[i][0]] = true;
    ENV_NAMES[REST_ENV_PAIRS[i][1]] = true;
  }

  /** Present means: a string with content. Unset, empty and whitespace-only all count as absent. */
  function readEnv(env, name) {
    if (!env) return null;
    const value = env[name];
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function isPlaceholder(value) {
    return Object.prototype.hasOwnProperty.call(ENV_NAMES, value);
  }

  /** A URL var is only usable when it really is an absolute http(s) URL. */
  function isUsableUrl(value) {
    if (!value || isPlaceholder(value)) return false;
    let parsed;
    try {
      parsed = new URL(value);
    } catch (err) {
      return false;
    }
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }

  /** A token is opaque, so all we can honestly reject is absence and the placeholder case. */
  function isUsableToken(value) {
    return Boolean(value) && !isPlaceholder(value);
  }

  /**
   * Resolve the store's REST credentials from the environment.
   *
   * Pairs are resolved as WHOLE pairs: a URL from one setup combined with a token from another is
   * always a misconfiguration, and reporting it as "configured" would surface a confusing auth
   * failure instead of the honest `storage_not_configured` the callers translate into a 503.
   *
   * @param {Record<string, string | undefined> | null | undefined} env
   * @returns {{ url: string, token: string } | null}
   */
  function resolveRestConfig(env) {
    for (let i = 0; i < REST_ENV_PAIRS.length; i++) {
      const url = readEnv(env, REST_ENV_PAIRS[i][0]);
      const token = readEnv(env, REST_ENV_PAIRS[i][1]);
      if (isUsableUrl(url) && isUsableToken(token)) return { url: url, token: token };
    }

    return null;
  }

  return Object.freeze({
    REST_ENV_PAIRS: REST_ENV_PAIRS,
    resolveRestConfig: resolveRestConfig
  });
});
