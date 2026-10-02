/**
 * True Path — API + store contract tests.
 *
 * These load the REAL handlers (`api/true-path-report.ts` and `true-path/lib/server/store.ts`)
 * and drive them through a fake `req`/`res` pair. Only the downstream services are stubbed:
 * `fetch` stands in for Upstash, and the `resend` module is swapped for a controllable double.
 *
 * What this suite exists to catch, in order of how badly each would hurt:
 *   1. A save that is reported as stored when nothing was written (or vice versa) — the whole
 *      reason this route has a fail-closed store.
 *   2. A tampered client record being persisted as fact. The server must recompute.
 *   3. A retried save creating a SECOND report, and a reused key with different answers
 *      silently returning someone else's report.
 *   4. An email being reported as sent while another attempt is still in flight.
 *   5. The captured lead leaking out of the public GET.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const { registerTsSupport } = require('./helpers/ts-require.cjs');
registerTsSupport();

// ─── environment / downstream doubles ────────────────────────────────────────

const STORE_URL = 'https://example-redis.upstash.io';
const STORE_TOKEN = 'test-token-abcdef123456';
const PROVIDER_KEY_PREFIX = 'UPSTASH_REDIS_REST_KV_REST_API';

/** In-memory stand-in for the Upstash REST endpoint. */
class FakeRedis {
  constructor() {
    /** @type {Map<string, string>} */
    this.data = new Map();
    this.calls = [];
    /** @type {null | ((args: any[]) => unknown)} */
    this.intercept = null;
  }

  /** Run one command array the way the real endpoint would. */
  run(args) {
    const name = String(args[0]).toUpperCase();
    this.calls.push(args);

    const interceptResult = this.intercept ? this.intercept(args) : undefined;
    if (interceptResult !== undefined) return interceptResult;

    if (name === 'SET') {
      const key = String(args[1]);
      const value = String(args[2]);
      const hasNx = args.some((a) => String(a).toUpperCase() === 'NX');
      if (hasNx && this.data.has(key)) return null;
      this.data.set(key, value);
      return 'OK';
    }
    if (name === 'GET') {
      const key = String(args[1]);
      return this.data.has(key) ? this.data.get(key) : null;
    }
    if (name === 'EXISTS') return this.data.has(String(args[1])) ? 1 : 0;
    if (name === 'DEL') return this.data.delete(String(args[1])) ? 1 : 0;
    if (name === 'EVAL') return this.runScript(args);
    throw new Error('FakeRedis: unsupported command ' + name);
  }

  /**
   * Model the store's Redis scripts.
   *
   * Each script is identified by its marker comment, and the branch taken is chosen from the
   * CURRENT state, so it reproduces the real semantics: idempotent replay, conflict on changed
   * inputs, and a pending/sent claim that only becomes `sent` after the provider succeeds.
   */
  runScript(args) {
    const script = String(args[1]);
    const keyCount = Number(args[2]);
    const keys = args.slice(3, 3 + keyCount).map(String);
    const argv = args.slice(3 + keyCount).map(String);

    if (script.includes('tfp:claim-save')) {
      const [requestKey, resultKey] = keys;
      const [, resultId, fingerprint, recordJson, keyPrefix] = argv;
      const existing = this.data.get(requestKey);
      if (existing) {
        const decoded = JSON.parse(existing);
        if (decoded.fingerprint === fingerprint) {
          // A replay is only a success if the record it points at is still readable — and the
          // record lives under the ORIGINAL id, not this request's freshly minted one.
          if (!this.data.has(keyPrefix + String(decoded.resultId))) {
            return ['missing', String(decoded.resultId)];
          }
          return ['exists', String(decoded.resultId)];
        }
        return ['conflict', ''];
      }
      // Result first, then the mapping — matching the real script's ordering.
      this.data.set(resultKey, recordJson);
      this.data.set(requestKey, JSON.stringify({ resultId, fingerprint }));
      return ['created', resultId];
    }

    if (script.includes('tfp:claim-email')) {
      const [key] = keys;
      const [, email] = argv;
      const raw = this.data.get(key);
      if (raw) {
        const state = JSON.parse(raw);
        if (state.email !== email) return ['conflict'];
        if (state.state === 'sent') return ['sent'];
        return ['pending'];
      }
      this.data.set(
        key,
        JSON.stringify({ state: 'pending', email, providerKey: argv[2], at: argv[3] })
      );
      return ['claimed'];
    }

    if (script.includes('tfp:mark-sent')) {
      const [key] = keys;
      const [, email] = argv;
      const raw = this.data.get(key);
      if (!raw) return ['missing'];
      const state = JSON.parse(raw);
      if (state.email !== email) return ['conflict'];
      state.state = 'sent';
      state.sentAt = argv[2];
      this.data.set(key, JSON.stringify(state));
      return ['sent'];
    }

    if (script.includes('tfp:release-email')) {
      const [key] = keys;
      const [email] = argv;
      const raw = this.data.get(key);
      if (!raw) return ['missing'];
      const state = JSON.parse(raw);
      if (state.state === 'sent') return ['sent'];
      if (state.email !== email) return ['conflict'];
      this.data.delete(key);
      return ['released'];
    }

    throw new Error('FakeRedis: unknown script');
  }
}

const redis = new FakeRedis();
let fetchMode = 'ok';

globalThis.fetch = async (url, init) => {
  const target = String(url);
  if (target !== STORE_URL) throw new Error('Unexpected fetch target: ' + target);

  if (fetchMode === 'http500') {
    return { ok: false, status: 500, json: async () => ({}) };
  }
  if (fetchMode === 'envelope-error') {
    // Upstash reports command-level failures inside a 200 envelope; that must NOT read as success.
    return { ok: true, status: 200, json: async () => ({ error: 'ERR script failed' }) };
  }

  const args = JSON.parse(init.body);
  const result = redis.run(args);
  return { ok: true, status: 200, json: async () => ({ result }) };
};

// ─── resend double ───────────────────────────────────────────────────────────

const resendState = {
  /** @type {Array<any>} */
  sends: [],
  behaviour: 'ok',
  /** @type {Map<string, any>} */
  byIdempotencyKey: new Map(),
};

class FakeResend {
  constructor() {
    this.emails = {
      send: async (payload, options) => {
        resendState.sends.push({ payload, options });

        const key = options && options.idempotencyKey;
        if (key && resendState.byIdempotencyKey.has(key) && resendState.behaviour !== 'conflict') {
          // A retry the provider already saw: same id, no new send.
          return { data: resendState.byIdempotencyKey.get(key), error: null };
        }

        if (resendState.behaviour === 'error') {
          return { data: null, error: { message: 'provider rejected the message' } };
        }
        if (resendState.behaviour === 'conflict') {
          return { data: null, error: { name: 'invalid_idempotent_request', message: 'key reused' } };
        }
        if (resendState.behaviour === 'empty-object') {
          // A malformed response that carries NEITHER an error NOR a delivery id.
          return {};
        }
        if (resendState.behaviour === 'null-pair') {
          return { data: null, error: null };
        }
        if (resendState.behaviour === 'no-id') {
          return { data: {}, error: null };
        }

        const data = { id: 'email-' + (resendState.sends.length) };
        if (key) resendState.byIdempotencyKey.set(key, data);
        return { data, error: null };
      },
    };
  }
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'resend') return { Resend: FakeResend };
  return originalLoad.apply(this, arguments);
};

// ─── harness ─────────────────────────────────────────────────────────────────

// Environment is set AFTER the hooks above so the handler reads a configured store.
process.env[PROVIDER_KEY_PREFIX + '_URL'] = STORE_URL;
process.env[PROVIDER_KEY_PREFIX + '_TOKEN'] = STORE_TOKEN;
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.SENDER_EMAIL = 'hello@contact.thefullpicture.asia';

const handler = require(path.join(repoRoot, 'api', 'true-path-report.ts')).default;
const model = require(path.join(repoRoot, 'true-path', 'lib', 'server', 'model.ts'));
const store = require(path.join(repoRoot, 'true-path', 'lib', 'server', 'store.ts'));

const canonical = JSON.parse(
  readFileSync(path.join(repoRoot, 'true-path', 'config', 'true-path.config.json'), 'utf8')
);

/** Fake `res`, capturing what the handler would have sent. */
function makeRes() {
  const captured = { statusCode: null, body: null, headers: {} };
  const res = {
    setHeader(name, value) {
      captured.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      captured.statusCode = code;
      return res;
    },
    json(payload) {
      captured.body = payload;
      return res;
    },
  };
  return { res, captured };
}

async function callGet(query) {
  const { res, captured } = makeRes();
  await handler({ method: 'GET', query }, res);
  return captured;
}

async function callPost(body) {
  const { res, captured } = makeRes();
  await handler({ method: 'POST', body }, res);
  return captured;
}

function resetWorld({ storeConfigured = true } = {}) {
  redis.data.clear();
  redis.calls.length = 0;
  redis.intercept = null;
  fetchMode = 'ok';
  resendState.sends.length = 0;
  resendState.behaviour = 'ok';
  resendState.byIdempotencyKey.clear();

  if (storeConfigured) {
    process.env[PROVIDER_KEY_PREFIX + '_URL'] = STORE_URL;
    process.env[PROVIDER_KEY_PREFIX + '_TOKEN'] = STORE_TOKEN;
  } else {
    delete process.env[PROVIDER_KEY_PREFIX + '_URL'];
    delete process.env[PROVIDER_KEY_PREFIX + '_TOKEN'];
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
}

// ─── fixture: a complete, canonical journey ──────────────────────────────────

/** A full journey built strictly from canonical config, so it is always valid by construction. */
function fullJourney() {
  const talents = canonical.T;
  const talentAnswers = {};
  canonical.Q.forEach((question, index) => {
    // A deliberate spread: alternating 5/3 keeps the profile decisive but not degenerate.
    talentAnswers['Q' + (index + 1)] = index % 2 === 0 ? 5 : 3;
  });
  void talents;

  const scenarioAnswers = {};
  const roles = canonical.R;
  canonical.SC.forEach((scenario, index) => {
    scenarioAnswers['S' + (index + 1)] = roles[index % roles.length];
  });

  const firstOption = (screenIndex) => canonical.IK[screenIndex][1][0][0];
  const secondOption = (screenIndex) => canonical.IK[screenIndex][1][1][0];

  return {
    schemaVersion: '2.1',
    resultId: 'tp_client_forged_id',
    createdAt: '1999-01-01T00:00:00.000Z',
    locale: 'en',
    talent: { answers: talentAnswers, pct: { organiser: 100, analyst: 100, communicator: 100, creative: 100 } },
    ikigai: {
      energises: [firstOption(0)],
      goodAt: [firstOption(1), secondOption(1)],
      economicValue: [firstOption(2)],
      impact: [firstOption(3)],
      suggested: [firstOption(1)],
    },
    ironTriangle: { answers: scenarioAnswers, share: { commander: 100, general: 0, chancellor: 0 } },
    truePath: { title: 'FORGED TITLE', alignment: ['forged_alignment'] },
    attribution: { utm_source: 'newsletter', utm_campaign: 'october', device: 'tablet' },
  };
}

function uuid(n) {
  const hex = String(n).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

// ─── tests: save path ────────────────────────────────────────────────────────

test('api save: a valid journey is stored under a SERVER-issued id and returns the report url', async () => {
  resetWorld();
  const captured = await callPost({ record: fullJourney(), idempotencyKey: uuid(1) });

  assert.equal(captured.statusCode, 200);
  assert.equal(captured.body.stored, true);

  // The client's forged id and date must not survive; the server owns both.
  assert.notEqual(captured.body.resultId, 'tp_client_forged_id');
  assert.match(captured.body.resultId, /^tp_[0-9a-f]{32}$/);
  assert.equal(captured.body.reportUrl, '/true-path/report/' + captured.body.resultId);
  assert.notEqual(captured.body.record.createdAt, '1999-01-01T00:00:00.000Z');

  // ...and the stored record is the recomputed one, not the posted one.
  const stored = await store.loadResult(captured.body.resultId);
  assert.ok(stored, 'record should be readable from the store');
  assert.equal(stored.resultId, captured.body.resultId);
  assert.notEqual(stored.truePath.title, 'FORGED TITLE');
});

test('api save: client-supplied scores cannot be persisted — the server recomputes', async () => {
  resetWorld();
  const forged = fullJourney();
  // Every tampered field below would change the report if it were trusted.
  forged.talent.pct = { organiser: 0, analyst: 0, communicator: 0, creative: 100 };
  forged.talent.dominant = 'creative';
  forged.ironTriangle.share = { commander: 0, general: 0, chancellor: 100 };
  forged.ironTriangle.primary = 'chancellor';
  forged.truePath.titleKey = 'forged__key';

  const captured = await callPost({ record: forged, idempotencyKey: uuid(2) });
  assert.equal(captured.statusCode, 200);

  const stored = await store.loadResult(captured.body.resultId);
  const expected = model.recomputeRecord(fullJourney(), {
    requireFullJourney: true,
    resultId: 'tp_ignored',
    createdAt: 'ignored',
  });
  assert.ok(expected.ok, 'the untampered journey must be valid');

  // Recomputed values equal the honest input's values, never the tampered ones.
  assert.deepEqual(stored.talent.pct, expected.record.talent.pct);
  assert.equal(stored.talent.pct.creative, expected.record.talent.pct.creative);
  assert.deepEqual(stored.ironTriangle.share, expected.record.ironTriangle.share);
  assert.equal(stored.truePath.titleKey, expected.record.truePath.titleKey);
});

test('api save: a REPLAY of the same key with the same answers returns the same report', async () => {
  resetWorld();
  const body = { record: fullJourney(), idempotencyKey: uuid(3) };

  const first = await callPost(body);
  const second = await callPost(body);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.stored, true, 'a replay is still a success for the caller');
  assert.equal(second.body.resultId, first.body.resultId, 'no second report may be created');

  // The whole returned record must be the ORIGINAL one. Returning this request's freshly
  // generated id and timestamp alongside it would describe a record that was never written.
  assert.equal(second.body.record.resultId, first.body.record.resultId);
  assert.equal(second.body.record.createdAt, first.body.record.createdAt);
  assert.deepEqual(
    { ...second.body.record, lead: null },
    { ...first.body.record, lead: null },
    'every field other than the (never-persisted) lead block must match the original'
  );

  // Exactly one result row was written.
  const resultKeys = [...redis.data.keys()].filter((key) => key.startsWith('tfp:truepath:result:'));
  assert.equal(resultKeys.length, 1);
});

test('api save: a replay never leaks the lead captured after the first save', async () => {
  resetWorld();
  const body = { record: fullJourney(), idempotencyKey: uuid(31) };
  const first = await callPost(body);

  await store.saveLead(first.body.resultId, {
    firstName: 'Ada',
    email: 'ada@example.com',
    reportConsent: true,
    marketingConsent: false,
  });

  const replay = await callPost(body);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.record.lead, undefined, 'the replay response must be redacted like a GET');
  assert.equal(replay.body.resultId, first.body.resultId);
});

test('api save: a replay whose stored report has vanished is a 503, never stored:true', async () => {
  resetWorld();
  const body = { record: fullJourney(), idempotencyKey: uuid(32) };
  const first = await callPost(body);
  assert.equal(first.statusCode, 200);

  // The mapping survives but the record it points at does not (expiry, or external deletion).
  redis.data.delete('tfp:truepath:result:' + first.body.resultId);

  const replay = await callPost(body);
  assert.equal(replay.statusCode, 503);
  assert.equal(replay.body.stored, false);
  assert.equal(replay.body.reason, 'store_unavailable');
});

test('api save: reuse of a key with CHANGED answers is a 409, not a wrong report', async () => {
  resetWorld();
  const key = uuid(4);
  const first = await callPost({ record: fullJourney(), idempotencyKey: key });
  assert.equal(first.statusCode, 200);

  const changed = fullJourney();
  changed.talent.answers.Q1 = changed.talent.answers.Q1 === 5 ? 1 : 5;

  const second = await callPost({ record: changed, idempotencyKey: key });
  assert.equal(second.statusCode, 409);
  assert.equal(second.body.reason, 'idempotency_conflict');
  assert.equal(second.body.stored, false);
});

test('api save: a missing or non-UUID idempotencyKey is refused', async () => {
  resetWorld();
  const noKey = await callPost({ record: fullJourney() });
  assert.equal(noKey.statusCode, 400);
  assert.equal(noKey.body.reason, 'idempotency_key_required');

  const badKey = await callPost({ record: fullJourney(), idempotencyKey: 'not-a-uuid' });
  assert.equal(badKey.statusCode, 400);
  assert.equal(badKey.body.reason, 'idempotency_key_required');
});

test('api save: malformed raw answers are rejected field by field', async () => {
  resetWorld();

  const missingTalent = fullJourney();
  delete missingTalent.talent.answers.Q7;
  const a = await callPost({ record: missingTalent, idempotencyKey: uuid(5) });
  assert.equal(a.statusCode, 400);
  assert.equal(a.body.reason, 'invalid_record');
  assert.ok(a.body.issues.some((issue) => issue.field === 'talent.answers.Q7'));

  const outOfRange = fullJourney();
  outOfRange.talent.answers.Q2 = 9;
  const b = await callPost({ record: outOfRange, idempotencyKey: uuid(6) });
  assert.equal(b.statusCode, 400);
  assert.ok(b.body.issues.some((issue) => issue.field === 'talent.answers.Q2' && issue.code === 'out_of_range'));

  const fractional = fullJourney();
  fractional.talent.answers.Q3 = 3.5;
  const c = await callPost({ record: fractional, idempotencyKey: uuid(7) });
  assert.equal(c.statusCode, 400);
  assert.ok(c.body.issues.some((issue) => issue.field === 'talent.answers.Q3'));

  const badRole = fullJourney();
  badRole.ironTriangle.answers.S1 = 'emperor';
  const d = await callPost({ record: badRole, idempotencyKey: uuid(8) });
  assert.equal(d.statusCode, 400);
  assert.ok(d.body.issues.some((issue) => issue.field === 'ironTriangle.answers.S1' && issue.code === 'invalid_role'));

  const unknownScreenKey = fullJourney();
  unknownScreenKey.ikigai.goodAt = ['not_a_real_option'];
  const e = await callPost({ record: unknownScreenKey, idempotencyKey: uuid(9) });
  assert.equal(e.statusCode, 400);
  assert.ok(e.body.issues.some((issue) => issue.field === 'ikigai.goodAt'));

  const tooMany = fullJourney();
  tooMany.ikigai.goodAt = canonical.IK[1][1].slice(0, 4).map((option) => option[0]);
  const f = await callPost({ record: tooMany, idempotencyKey: uuid(10) });
  assert.equal(f.statusCode, 400);
  assert.ok(f.body.issues.some((issue) => issue.field === 'ikigai.goodAt' && issue.code === 'too_many'));

  // Nothing above may have written anything.
  assert.equal([...redis.data.keys()].filter((k) => k.startsWith('tfp:truepath:')).length, 0);
});

test('api save: a real save requires a pick on every Ikigai screen', async () => {
  resetWorld();
  const partial = fullJourney();
  partial.ikigai.impact = [];

  const captured = await callPost({ record: partial, idempotencyKey: uuid(11) });
  assert.equal(captured.statusCode, 400);
  assert.ok(captured.body.issues.some((issue) => issue.field === 'ikigai.impact' && issue.code === 'too_few'));
});

test('api save: numeric coercion cannot manufacture Talent answers', async () => {
  resetWorld();
  for (const value of [true, [3], '3', { valueOf: 3 }]) {
    const record = fullJourney();
    record.talent.answers.Q1 = value;
    const response = await callPost({ record, idempotencyKey: uuid(15) });
    assert.equal(response.statusCode, 400);
    assert.ok(response.body.issues.some((issue) => issue.field === 'talent.answers.Q1'));
  }
  assert.equal(redis.data.size, 0);
});

test('api body cap measures UTF-8 bytes before any storage operation', async () => {
  resetWorld();
  const body = { record: fullJourney(), idempotencyKey: uuid(16), extra: '\u8f68'.repeat(70000) };
  assert.ok(JSON.stringify(body).length < 200 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(body), 'utf8') > 200 * 1024);
  const response = await callPost(body);
  assert.equal(response.statusCode, 413);
  assert.equal(redis.data.size, 0);
});

test('api save: an unconfigured store is a 503 and writes nothing', async () => {
  resetWorld({ storeConfigured: false });

  const captured = await callPost({ record: fullJourney(), idempotencyKey: uuid(12) });
  assert.equal(captured.statusCode, 503);
  assert.equal(captured.body.stored, false);
  assert.equal(captured.body.reason, 'storage_not_configured');
  assert.equal(captured.body.resultId, null);
  assert.equal(redis.data.size, 0);
});

test('api save: a store failure is a 503, never a false success', async () => {
  resetWorld();
  fetchMode = 'http500';

  const captured = await callPost({ record: fullJourney(), idempotencyKey: uuid(13) });
  assert.equal(captured.statusCode, 503);
  assert.equal(captured.body.stored, false);
  assert.equal(captured.body.reason, 'store_unavailable');
});

test('api save: a KV error inside an HTTP 200 envelope is still a failure', async () => {
  resetWorld();
  fetchMode = 'envelope-error';

  const captured = await callPost({ record: fullJourney(), idempotencyKey: uuid(14) });
  assert.equal(captured.statusCode, 503);
  assert.equal(captured.body.stored, false);
  assert.equal(captured.body.reason, 'store_unavailable');
});

test('api save: arbitrary client copy cannot override server-rendered content', async () => {
  resetWorld();
  const forged = fullJourney();
  forged.headline = 'CLIENT HEADLINE';
  forged.disclaimer = 'CLIENT DISCLAIMER';
  forged.pages = [{ kind: 'text', text: 'CLIENT PAGE' }];
  forged.truePath.title = 'CLIENT TITLE';
  forged.lead = { firstName: 'Mallory', email: 'mallory@example.com', reportConsent: true };

  const captured = await callPost({ record: forged, idempotencyKey: uuid(15) });
  assert.equal(captured.statusCode, 200);

  const stored = await store.loadResult(captured.body.resultId);
  assert.notEqual(stored.truePath.title, 'CLIENT TITLE');
  assert.equal(stored.headline, undefined);
  assert.equal(stored.pages, undefined);
  // A forged lead must not be planted by the save path.
  assert.equal(stored.lead.email, null);
});

test('api save: attribution and suggestion metadata are whitelisted', async () => {
  resetWorld();
  const journey = fullJourney();
  journey.attribution = { utm_source: 'newsletter', utm_campaign: 'october', device: 'phablet' };

  const captured = await callPost({ record: journey, idempotencyKey: uuid(16) });
  assert.equal(captured.statusCode, 200);

  const stored = await store.loadResult(captured.body.resultId);
  assert.equal(stored.attribution.utm_source, 'newsletter');
  assert.equal(stored.attribution.utm_campaign, 'october');
  // An unrecognised device class falls back rather than being stored verbatim.
  assert.equal(stored.attribution.device, 'desktop');
});

// ─── tests: public read ──────────────────────────────────────────────────────

test('api get: returns the record with the captured lead REMOVED and no-store caching', async () => {
  resetWorld();
  const saved = await callPost({ record: fullJourney(), idempotencyKey: uuid(17) });
  const id = saved.body.resultId;

  await store.saveLead(id, {
    firstName: 'Ada',
    email: 'ada@example.com',
    reportConsent: true,
    marketingConsent: true,
  });

  const captured = await callGet({ id });
  assert.equal(captured.statusCode, 200);
  assert.equal(captured.headers['cache-control'], 'no-store');
  assert.ok(captured.body.record, 'a record is returned');
  assert.equal(captured.body.record.lead, undefined, 'lead must never be exposed publicly');
  assert.equal(captured.body.record.resultId, id);

  // The stored record still holds the lead — only the response is redacted.
  const stored = await store.loadResult(id);
  assert.equal(stored.lead.email, 'ada@example.com');
});

test('api get: unknown id is 404, invalid id is 400, unconfigured store is 503', async () => {
  resetWorld();
  const notFound = await callGet({ id: 'tp_missing0001' });
  assert.equal(notFound.statusCode, 404);

  const invalid = await callGet({ id: 'nonsense' });
  assert.equal(invalid.statusCode, 400);

  resetWorld({ storeConfigured: false });
  const unconfigured = await callGet({ id: 'tp_valid000001' });
  assert.equal(unconfigured.statusCode, 503);
});

// ─── tests: lead + email path ────────────────────────────────────────────────

async function seedReport(keySeed) {
  const saved = await callPost({ record: fullJourney(), idempotencyKey: uuid(keySeed) });
  assert.equal(saved.statusCode, 200, 'seed save must succeed');
  return saved.body.resultId;
}

function leadBody(resultId, overrides = {}) {
  return {
    resultId,
    firstName: 'Ada',
    email: 'ada@example.com',
    reportConsent: true,
    marketingConsent: false,
    ...overrides,
  };
}

test('api lead: explicit consent and a first name are required', async () => {
  resetWorld();
  const id = await seedReport(20);

  const noConsent = await callPost(leadBody(id, { reportConsent: undefined }));
  assert.equal(noConsent.statusCode, 400);
  assert.equal(noConsent.body.reason, 'report_consent_required');

  // An absent flag is NOT consent — the old default-to-granted behaviour is gone.
  const falseConsent = await callPost(leadBody(id, { reportConsent: false }));
  assert.equal(falseConsent.statusCode, 400);
  assert.equal(falseConsent.body.reason, 'report_consent_required');

  const noName = await callPost(leadBody(id, { firstName: '   ' }));
  assert.equal(noName.statusCode, 400);
  assert.equal(noName.body.reason, 'name_required');

  const longName = await callPost(leadBody(id, { firstName: 'A'.repeat(201) }));
  assert.equal(longName.statusCode, 400);
  assert.equal(longName.body.reason, 'invalid_name');

  const badEmail = await callPost(leadBody(id, { email: 'not-an-email' }));
  assert.equal(badEmail.statusCode, 400);
  assert.equal(badEmail.body.reason, 'invalid_email');

  const badId = await callPost(leadBody('nope'));
  assert.equal(badId.statusCode, 400);
  assert.equal(badId.body.reason, 'invalid_result_id');

  assert.equal(resendState.sends.length, 0, 'no email may be attempted for a refused lead');
});

test('api lead: a successful send is claimed, then marked sent, and never reported early', async () => {
  resetWorld();
  const id = await seedReport(21);

  const captured = await callPost(leadBody(id, { marketingConsent: true }));
  assert.equal(captured.statusCode, 200);
  assert.equal(captured.body.sent, true);
  assert.equal(captured.body.resultId, id);

  // The provider was called exactly once, with an idempotency key, and the claim is now `sent`.
  assert.equal(resendState.sends.length, 1);
  const providerOptions = resendState.sends[0].options;
  assert.ok(providerOptions && providerOptions.idempotencyKey, 'a provider idempotency key is sent');
  assert.match(providerOptions.idempotencyKey, new RegExp('^tfp-report/' + id + '/'));

  const claim = JSON.parse(redis.data.get('tfp:truepath:emailed:' + id));
  assert.equal(claim.state, 'sent');
  assert.equal(claim.email, 'ada@example.com');

  // The lead is stored on the authoritative record.
  const stored = await store.loadResult(id);
  assert.equal(stored.lead.firstName, 'Ada');
  assert.equal(stored.lead.reportConsent, true);
  assert.equal(stored.lead.marketingConsent, true);
});

test('api lead: the stored record is authoritative — an unknown resultId is a 409', async () => {
  resetWorld();
  const captured = await callPost(
    leadBody('tp_doesnotexist01', { payload: { resultId: 'tp_doesnotexist01', talent: {} } })
  );
  assert.equal(captured.statusCode, 409);
  assert.equal(captured.body.reason, 'report_not_found');
  assert.equal(resendState.sends.length, 0);
});

test('api lead: a resubmission to the same address is a duplicate success, with no second send', async () => {
  resetWorld();
  const id = await seedReport(22);

  const first = await callPost(leadBody(id));
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.sent, true);

  const second = await callPost(leadBody(id));
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.sent, true);
  assert.equal(second.body.duplicate, true);

  assert.equal(resendState.sends.length, 1, 'the provider is not called twice');
});

test('api lead: a concurrent attempt is PENDING (409), never a success', async () => {
  resetWorld();
  const id = await seedReport(23);

  // Simulate the in-flight window: the claim exists but has not been finalised.
  redis.data.set(
    'tfp:truepath:emailed:' + id,
    JSON.stringify({ state: 'pending', email: 'ada@example.com', providerKey: 'x', at: 'now' })
  );

  const captured = await callPost(leadBody(id));
  assert.equal(captured.statusCode, 409);
  assert.equal(captured.body.sent, false);
  assert.equal(captured.body.pending, true);
  assert.equal(captured.body.reason, 'send_in_progress');
  assert.equal(resendState.sends.length, 0, 'no competing send is started');
});

test('api lead: the same report to a DIFFERENT address is a conflict, not a silent send', async () => {
  resetWorld();
  const id = await seedReport(24);

  const first = await callPost(leadBody(id));
  assert.equal(first.statusCode, 200);

  const other = await callPost(leadBody(id, { email: 'eve@example.com' }));
  assert.equal(other.statusCode, 409);
  assert.equal(other.body.reason, 'recipient_conflict');
  assert.equal(resendState.sends.length, 1);
});

test('api lead: a provider error releases the claim so a retry can succeed', async () => {
  resetWorld();
  const id = await seedReport(25);

  resendState.behaviour = 'error';
  const failed = await callPost(leadBody(id));
  assert.equal(failed.statusCode, 502);
  assert.notEqual(failed.body.sent, true, 'a failure must not carry a success flag');
  assert.equal(redis.data.has('tfp:truepath:emailed:' + id), false, 'the claim is released');

  // The retry now goes through.
  resendState.behaviour = 'ok';
  const retry = await callPost(leadBody(id));
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.sent, true);
  assert.equal(
    JSON.parse(redis.data.get('tfp:truepath:emailed:' + id)).state,
    'sent'
  );
});

test('api lead: accepted mail survives finalisation failure and retries without resending', async () => {
  for (const failure of ['missing', 'throw']) {
    resetWorld();
    const id = await seedReport(50);
    redis.intercept = (args) => {
      if (args[0] === 'EVAL' && String(args[1]).includes('tfp:mark-sent')) {
        if (failure === 'throw') throw new Error('finalisation unavailable');
        return ['missing'];
      }
    };
    const failed = await callPost(leadBody(id));
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.body.sent, false);
    assert.equal(failed.body.reason, 'delivery_not_finalised');
    assert.equal(JSON.parse(redis.data.get('tfp:truepath:emailed:' + id)).state, 'pending');
    const acceptance = await store.loadEmailAcceptance(id);
    assert.equal(acceptance.email, 'ada@example.com');
    assert.ok(acceptance.deliveryId);
    assert.equal(resendState.sends.length, 1);
    const publicRecord = (await callGet({ id })).body.record;
    assert.equal(publicRecord.lead, undefined);
    assert.equal(publicRecord.deliveryId, undefined);

    // Provider keys may have expired; recovery must work without relying on them.
    acceptance.acceptedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    redis.data.set('tfp:truepath:accepted:' + id, JSON.stringify(acceptance));
    resendState.byIdempotencyKey.clear();
    redis.intercept = null;
    const recovered = await callPost(leadBody(id, { firstName: 'Changed name' }));
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.body.sent, true);
    assert.equal(recovered.body.duplicate, true);
    assert.equal(resendState.sends.length, 1, 'only the stored claim is repaired');
    assert.equal((await store.loadResult(id)).lead.firstName, 'Ada');
    assert.equal(JSON.parse(redis.data.get('tfp:truepath:emailed:' + id)).state, 'sent');

    // Even a missing claim must not allow the acknowledgement to be redirected or resent.
    redis.data.delete('tfp:truepath:emailed:' + id);
    assert.equal((await callPost(leadBody(id, { email: 'eve@example.com' }))).statusCode, 409);
    assert.equal((await callPost(leadBody(id))).body.sent, true);
    assert.equal(resendState.sends.length, 1);
  }
});

test('api lead: a transient finalisation error is retried without a second email', async () => {
  resetWorld();
  const id = await seedReport(51);
  let attempts = 0;
  redis.intercept = (args) => {
    if (args[0] === 'EVAL' && String(args[1]).includes('tfp:mark-sent') && ++attempts === 1) {
      throw new Error('transient store error');
    }
  };
  const captured = await callPost(leadBody(id));
  assert.equal(captured.statusCode, 200);
  assert.equal(captured.body.sent, true);
  assert.equal(attempts, 2);
  assert.equal(resendState.sends.length, 1);
});

test('api lead: losing both acknowledgement and finalisation never releases an accepted claim', async () => {
  resetWorld();
  const id = await seedReport(52);
  redis.intercept = (args) => {
    if ((args[0] === 'SET' && String(args[1]).startsWith('tfp:truepath:accepted:')) ||
        (args[0] === 'EVAL' && String(args[1]).includes('tfp:mark-sent'))) {
      throw new Error('store unavailable after provider acceptance');
    }
  };
  const captured = await callPost(leadBody(id));
  assert.equal(captured.statusCode, 503);
  assert.equal(captured.body.sent, false);
  assert.equal(JSON.parse(redis.data.get('tfp:truepath:emailed:' + id)).state, 'pending');
  redis.intercept = null;
  assert.equal((await callPost(leadBody(id))).statusCode, 409);
  assert.equal(resendState.sends.length, 1, 'unknown state requires reconciliation, never a resend');
});

test('api lead: a recipient conflict at release time does not drop a real claim', async () => {
  resetWorld();
  const id = await seedReport(26);

  await callPost(leadBody(id)); // marks the claim `sent` for ada@example.com
  const released = await store.releaseEmailSend({ resultId: id, email: 'eve@example.com' });
  assert.equal(released, false);
  assert.equal(JSON.parse(redis.data.get('tfp:truepath:emailed:' + id)).state, 'sent');
});

test('api lead: an unconfigured store is refused before any send', async () => {
  resetWorld();
  const id = await seedReport(27);

  resetWorld({ storeConfigured: false });
  const captured = await callPost(leadBody(id));
  assert.equal(captured.statusCode, 503);
  assert.equal(captured.body.reason, 'storage_not_configured');
  assert.equal(resendState.sends.length, 0);
});

test('api lead: a malformed provider response is never accepted as delivery', async () => {
  // Every one of these carries NO positive evidence of delivery. Reading a falsy `error` alone
  // would finalise the claim as `sent` for a message the provider never created.
  for (const behaviour of ['empty-object', 'null-pair', 'no-id']) {
    resetWorld();
    const id = await seedReport(40);
    resendState.behaviour = behaviour;

    const captured = await callPost(leadBody(id));
    assert.equal(captured.statusCode, 502, `behaviour ${behaviour} must fail`);
    assert.notEqual(captured.body.sent, true, `behaviour ${behaviour} must not claim success`);
    assert.notEqual(
      JSON.parse(redis.data.get('tfp:truepath:emailed:' + id) || '{"state":"released"}').state,
      'sent',
      `behaviour ${behaviour} must not mark the claim sent`
    );

    // ...and the visitor's retry still works once the provider behaves.
    resendState.behaviour = 'ok';
    const retry = await callPost(leadBody(id));
    assert.equal(retry.statusCode, 200, `retry after ${behaviour} must succeed`);
    assert.equal(retry.body.sent, true);
  }
});

test('api lead: a conflicting recipient cannot overwrite the original stored lead', async () => {
  resetWorld();
  const id = await seedReport(41);

  const first = await callPost(leadBody(id, { firstName: 'Ada', marketingConsent: true }));
  assert.equal(first.statusCode, 200);

  const storedAfterFirst = await store.loadResult(id);
  assert.equal(storedAfterFirst.lead.email, 'ada@example.com');

  // A second submission to a different address is refused — and must leave the stored lead alone.
  const other = await callPost(leadBody(id, { firstName: 'Eve', email: 'eve@example.com' }));
  assert.equal(other.statusCode, 409);
  assert.equal(other.body.reason, 'recipient_conflict');

  const storedAfterOther = await store.loadResult(id);
  assert.equal(storedAfterOther.lead.email, 'ada@example.com', 'the original lead is untouched');
  assert.equal(storedAfterOther.lead.firstName, 'Ada');
  assert.equal(storedAfterOther.lead.marketingConsent, true);
  assert.equal(resendState.sends.length, 1);
});

test('api lead: a refused consent never reaches the stored record', async () => {
  resetWorld();
  const id = await seedReport(42);

  const refused = await callPost(leadBody(id, { reportConsent: false }));
  assert.equal(refused.statusCode, 400);

  // The claim was never taken and the lead was never written.
  assert.equal(redis.data.has('tfp:truepath:emailed:' + id), false);
  const stored = await store.loadResult(id);
  assert.equal(stored.lead.email, null);
  assert.equal(stored.lead.reportConsent, false);
});

test('api lead: a failure to record the lead sends nothing and releases the claim', async () => {
  resetWorld();
  const id = await seedReport(43);

  // The lead write is the first thing after the claim; make it fail.
  const failingKey = 'tfp:truepath:result:' + id;
  const realSet = redis.run.bind(redis);
  redis.intercept = (args) => {
    if (String(args[0]).toUpperCase() === 'SET' && String(args[1]) === failingKey) {
      throw new Error('simulated write failure');
    }
    return undefined;
  };

  const captured = await callPost(leadBody(id));
  assert.equal(captured.statusCode, 503);
  assert.equal(captured.body.sent, false);
  assert.equal(resendState.sends.length, 0, 'no mail is sent when the consent write failed');
  assert.equal(redis.data.has('tfp:truepath:emailed:' + id), false, 'the claim is released');

  // With the store healthy again the visitor's retry succeeds.
  redis.intercept = null;
  void realSet;
  const retry = await callPost(leadBody(id));
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.sent, true);
});

// ─── tests: transport guards ─────────────────────────────────────────────────

test('api: unknown shapes, bad methods and oversized bodies are refused', async () => {
  resetWorld();

  const unrecognised = await callPost({ something: 'else' });
  assert.equal(unrecognised.statusCode, 400);

  const { res, captured } = makeRes();
  await handler({ method: 'DELETE' }, res);
  assert.equal(captured.statusCode, 405);
  assert.equal(captured.headers.allow, 'GET, POST');

  const oversized = await callPost({
    record: fullJourney(),
    idempotencyKey: uuid(28),
    padding: 'x'.repeat(200 * 1024),
  });
  assert.equal(oversized.statusCode, 413);
});

// ─── tests: store primitives ─────────────────────────────────────────────────

test('store: server ids match the shape the store accepts, and are unique', () => {
  const a = store.newResultId();
  const b = store.newResultId();
  assert.match(a, /^tp_[A-Za-z0-9_-]{4,64}$/);
  assert.notEqual(a, b);
  assert.equal(store.isValidResultId(a), true);
  assert.equal(store.isValidResultId('tp_client_forged_id'), true, 'shape is not proof of origin');
  assert.equal(store.isValidResultId('nonsense'), false);
});

test('store: claimSaveRequest distinguishes created, replayed and conflicting keys', async () => {
  resetWorld();
  const base = {
    requestKey: uuid(30),
    fingerprint: 'fingerprint-a',
    resultId: store.newResultId(),
    record: { resultId: 'tp_x' },
  };

  const created = await store.claimSaveRequest(base);
  assert.equal(created.status, 'created');
  assert.equal(created.resultId, base.resultId);

  const replayed = await store.claimSaveRequest(base);
  assert.equal(replayed.status, 'exists');
  assert.equal(replayed.resultId, base.resultId, 'the replay returns the ORIGINAL id');

  const conflicting = await store.claimSaveRequest({ ...base, fingerprint: 'fingerprint-b' });
  assert.equal(conflicting.status, 'conflict');
});

test('store: claimEmailSend throws rather than guessing when no store is configured', async () => {
  resetWorld({ storeConfigured: false });
  await assert.rejects(
    () => store.claimEmailSend({ resultId: 'tp_valid000001', email: 'a@b.com', providerKey: 'k' }),
    (error) => error.code === 'storage_not_configured'
  );
});

test('store: fingerprint ignores formatting but catches changed answers', () => {
  const inputs = {
    talentAnswers: { Q1: 5, Q2: 3 },
    scenarioAnswers: { S1: 'commander' },
    picks: [{ screenId: 'I-1', key: 'strategy', fromSuggestion: true }],
    suggestedKeys: ['strategy'],
    attribution: { utm_source: null, utm_campaign: null, device: 'desktop' },
    locale: 'en',
  };

  const a = model.fingerprintInputs(inputs);
  const b = model.fingerprintInputs({ ...inputs });
  assert.equal(a, b);

  const changed = model.fingerprintInputs({
    ...inputs,
    talentAnswers: { Q1: 5, Q2: 4 },
  });
  assert.notEqual(a, changed);

  const changedMeta = model.fingerprintInputs({
    ...inputs,
    suggestedKeys: ['strategy', 'execution'],
  });
  assert.notEqual(a, changedMeta, 'suggestion metadata is part of the identity of a save');
});
