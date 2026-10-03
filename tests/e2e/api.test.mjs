/**
 * True Path — integrated API tests against the real handlers.
 *
 * These run the actual `api/true-path-report.ts` and `api/true-path-pdf.ts` through a local HTTP
 * server (see `harness.mjs`), with only Upstash KV and Resend faked. That is deliberately one
 * layer below the browser suites: it is where storage honesty, idempotency and email claims can
 * be asserted exactly, because the fake can be told to fail, hang or double-submit in ways a real
 * provider never would.
 *
 * Assertions here are written against the REQUIRED contract, not whatever the code happened to do
 * first:
 *
 *   POST { record, idempotencyKey }  -> { stored: true, resultId, record, reportUrl }
 *   POST { resultId, email, ... }    -> { sent: true } | an explicit non-success
 *   GET  ?id=<resultId>              -> { record }
 *
 * A success response must mean the work actually happened: a store that is down, a send still in
 * flight, or a provider error must never be reported as `stored: true` / `sent: true`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, FakeKv, FakeResend, kvGetRecord, kvGetEmailState } from './harness.mjs';

const IDEMPOTENCY_KEY = '11111111-2222-3333-4444-555555555555';
const SECOND_KEY = '99999999-8888-7777-6666-555555555555';

/** A complete, valid journey record — all 12 Likert answers and all six scenario choices. */
function validRecord(scale = 5) {
  const answers = {};
  for (let index = 1; index <= 12; index += 1) answers[`Q${index}`] = scale;
  return {
    talent: { answers },
    ironTriangle: {
      answers: { S1: 'commander', S2: 'commander', S3: 'commander', S4: 'commander', S5: 'commander', S6: 'commander' }
    },
    ikigai: {
      energises: ['teaching_sharing'],
      goodAt: ['communication'],
      economicValue: ['business_entrepreneurship'],
      impact: ['help_people_find_direction']
    }
  };
}

/** Start a server plus its fakes, and hand the caller a scoped lifecycle. */
async function withServer(options, run) {
  const kv = new FakeKv();
  const resend = new FakeResend(options && options.resend);
  const server = await startServer({ kv, resend });
  const post = async (path, body) => {
    const response = await fetch(server.url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    return { status: response.status, body: await response.json() };
  };
  const get = async (path) => {
    const response = await fetch(server.url + path, { signal: AbortSignal.timeout(10000) });
    return { status: response.status, body: await response.json() };
  };
  try {
    return await run({ server, kv, resend, post, get });
  } finally {
    // Always unstrand any stalled provider send and shut the server down, even when an assertion
    // in `run` threw. Without this a failed in-flight test leaves a pending promise holding the
    // socket open and the whole suite hangs on exit instead of reporting the real failure.
    resend.release();
    await server.close();
  }
}

// ─── save ────────────────────────────────────────────────────────────────────────────────────

test('save: a valid journey is persisted and returns the full canonical envelope', async () => {
  await withServer({}, async ({ kv, post, get }) => {
    const saved = await post('/api/true-path-report', {
      record: validRecord(),
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.equal(saved.status, 200);
    assert.equal(saved.body.stored, true, 'a successful save must report stored: true');
    assert.match(saved.body.resultId, /^tp_[A-Za-z0-9_-]{4,64}$/, 'the id must be server-issued');

    // The response carries the recomputed record, so the page renders exactly what was stored.
    assert.ok(saved.body.record, 'the response must carry the stored record');
    assert.equal(saved.body.record.resultId, saved.body.resultId);
    assert.equal(saved.body.record.schemaVersion, '2.2');

    // And a link that can be emailed or revisited.
    assert.equal(saved.body.reportUrl, `/true-path/report/${saved.body.resultId}`);

    // It is really in the store, not merely reported as stored.
    const persisted = kvGetRecord(kv, saved.body.resultId);
    assert.ok(persisted, 'the record must actually be in the KV store');
    assert.equal(persisted.resultId, saved.body.resultId);

    // And reachable by id.
    const loaded = await get(`/api/true-path-report?id=${saved.body.resultId}`);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.record.resultId, saved.body.resultId);
  });
});

test('save: an incomplete journey is rejected rather than stored', async () => {
  await withServer({}, async ({ kv, post }) => {
    const saved = await post('/api/true-path-report', {
      record: { talent: { answers: {} }, ironTriangle: { answers: {} }, ikigai: {} },
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.equal(saved.status, 400);
    assert.equal(saved.body.stored, undefined, 'a rejected save must not carry a stored flag');
    assert.equal(kv.commands.length, 0, 'nothing may be written for an invalid record');
  });
});

test('save: a missing or malformed idempotency key is refused', async () => {
  await withServer({}, async ({ kv, post }) => {
    const missing = await post('/api/true-path-report', { record: validRecord() });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.stored, undefined);

    const malformed = await post('/api/true-path-report', {
      record: validRecord(),
      idempotencyKey: 'not-a-uuid'
    });
    assert.equal(malformed.status, 400);

    assert.equal(kv.commands.length, 0, 'an invalid key must not reach the store');
  });
});

test('save: replaying the same key and answers returns the same report, without rewriting it', async () => {
  await withServer({}, async ({ kv, post }) => {
    const first = await post('/api/true-path-report', {
      record: validRecord(),
      idempotencyKey: IDEMPOTENCY_KEY
    });
    const writesAfterFirst = kv.commands.filter((command) => command[0] === 'SET').length;

    const replay = await post('/api/true-path-report', {
      record: validRecord(),
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.equal(replay.status, 200);
    assert.equal(replay.body.stored, true, 'a replay is still a stored report');
    assert.equal(
      replay.body.resultId,
      first.body.resultId,
      'the same submission must resolve to the same report, not a second one'
    );
    assert.equal(
      replay.body.reportUrl,
      first.body.reportUrl,
      'and therefore the same shareable link'
    );

    const writesAfterReplay = kv.commands.filter((command) => command[0] === 'SET').length;
    assert.equal(writesAfterReplay, writesAfterFirst, 'a replay must not rewrite the stored result');
  });
});

test('save: reusing a key with DIFFERENT answers is a conflict, not a silent overwrite', async () => {
  await withServer({}, async ({ kv, post }) => {
    const first = await post('/api/true-path-report', {
      record: validRecord(5),
      idempotencyKey: IDEMPOTENCY_KEY
    });

    const conflict = await post('/api/true-path-report', {
      record: validRecord(1),
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.equal(conflict.status, 409, 'a changed answer set must not reuse the key');
    assert.notEqual(conflict.body.stored, true);

    // The original is untouched — this is the "wrong visitor's report" case.
    const original = kvGetRecord(kv, first.body.resultId);
    assert.ok(original, 'the original report must survive the conflict');
    assert.equal(original.talent.answers.Q1, 5, 'the original answers must not be replaced');
  });
});

test('save: a second, legitimate save with a fresh key creates a separate report', async () => {
  await withServer({}, async ({ post }) => {
    const first = await post('/api/true-path-report', {
      record: validRecord(5),
      idempotencyKey: IDEMPOTENCY_KEY
    });
    const second = await post('/api/true-path-report', {
      record: validRecord(3),
      idempotencyKey: SECOND_KEY
    });

    assert.equal(second.status, 200);
    assert.notEqual(
      second.body.resultId,
      first.body.resultId,
      'a different submission deserves its own report'
    );
  });
});

// ─── store honesty ───────────────────────────────────────────────────────────────────────────

test('save: an unreachable store is reported as a failure, never as stored', async () => {
  await withServer({}, async ({ kv, post }) => {
    kv.failWith = new Error('fake kv transport failure');

    const saved = await post('/api/true-path-report', {
      record: validRecord(),
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.notEqual(saved.status, 200, 'a broken store must not produce a success status');
    assert.notEqual(saved.body.stored, true, 'a broken store must never report stored: true');
    assert.ok(saved.body.error, 'the visitor needs to be told, not silently misled');
  });
});

test('save: a command-level KV error inside an HTTP 200 envelope is still a failure', async () => {
  // Upstash reports command failures inside a 200 JSON envelope. Treating that as a successful
  // write is exactly the false promise this contract exists to prevent.
  await withServer({}, async ({ kv, post }) => {
    kv.failEnvelope = true;

    const saved = await post('/api/true-path-report', {
      record: validRecord(),
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.notEqual(saved.body.stored, true, 'an errored command must not look like a success');
    assert.notEqual(saved.status, 200);
  });
});

// ─── email ───────────────────────────────────────────────────────────────────────────────────

/** Save a report, then submit a lead for it. */
async function saveThenLead(post, overrides = {}) {
  const saved = await post('/api/true-path-report', {
    record: validRecord(),
    idempotencyKey: IDEMPOTENCY_KEY
  });
  assert.equal(saved.status, 200, 'fixture: the report must save before a lead can be sent');

  const lead = await post('/api/true-path-report', {
    resultId: saved.body.resultId,
    email: 'visitor@example.com',
    firstName: 'Wei',
    reportConsent: true,
    marketingConsent: false,
    idempotencyKey: IDEMPOTENCY_KEY,
    ...overrides
  });
  return { saved, lead };
}

test('email: a delivered report reports sent: true and is recorded as sent', async () => {
  await withServer({}, async ({ kv, resend, post }) => {
    const { saved, lead } = await saveThenLead(post);

    assert.equal(lead.status, 200);
    assert.equal(lead.body.sent, true, 'the visitor must only be told sent when it truly sent');
    assert.equal(lead.body.resultId, saved.body.resultId);

    // The provider was actually called, to the visitor's address. `to` is a list on the wire.
    const toVisitor = resend.messages.filter((message) =>
      (Array.isArray(message.to) ? message.to : [message.to]).includes('visitor@example.com')
    );
    assert.equal(toVisitor.length, 1, 'exactly one report email should reach the visitor');

    // And the claim reflects reality, so a resubmission can be recognised as a duplicate.
    const state = kvGetEmailState(kv, saved.body.resultId);
    assert.equal(state.state, 'sent');
    assert.equal(state.email, 'visitor@example.com');
  });
});

test('email: a duplicate resubmission is a success with no second email', async () => {
  await withServer({}, async ({ resend, post }) => {
    const { saved } = await saveThenLead(post);
    const sendsAfterFirst = resend.messages.length;

    const duplicate = await post('/api/true-path-report', {
      resultId: saved.body.resultId,
      email: 'visitor@example.com',
      firstName: 'Wei',
      reportConsent: true,
      marketingConsent: false,
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.equal(duplicate.status, 200);
    // The visitor asked for their report and it was delivered — the HTTP contract succeeds. The
    // response must still say so explicitly rather than implying a fresh send happened.
    assert.equal(duplicate.body.sent, true, 'a true duplicate is reported as already sent');
    assert.equal(duplicate.body.duplicate, true, 'and is marked as a duplicate');
    assert.equal(
      resend.messages.length,
      sendsAfterFirst,
      'a duplicate must not email the visitor again'
    );
  });
});

test('email: a provider error releases the claim so a retry can still succeed', async () => {
  await withServer({}, async ({ kv, resend, post }) => {
    resend.mode = 'error';

    const { saved, lead } = await saveThenLead(post);

    assert.notEqual(lead.status, 200, 'a failed send must not return a success status');
    assert.notEqual(lead.body.sent, true, 'a failed send must never report sent: true');

    const failedState = kvGetEmailState(kv, saved.body.resultId);
    assert.notEqual(
      failedState && failedState.state,
      'sent',
      'a failed send must not be recorded as delivered'
    );

    // The visitor retries; the provider recovers.
    resend.mode = 'ok';
    const retry = await post('/api/true-path-report', {
      resultId: saved.body.resultId,
      email: 'visitor@example.com',
      firstName: 'Wei',
      reportConsent: true,
      marketingConsent: false,
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.equal(retry.status, 200, 'a genuine retry must be allowed to succeed');
    assert.equal(retry.body.sent, true);
    assert.equal(
      kvGetEmailState(kv, saved.body.resultId).state,
      'sent',
      'a successful retry must be recorded'
    );
  });
});

test('email: a send still in flight is never reported as delivered', async () => {
  // `hang` only stalls the VISITOR email. The team notification is left working, because if every
  // send stalled the request would never reach a response and the assertion below would hang too.
  await withServer({ resend: { mode: 'hang', hangMatches: 'visitor@example.com' } }, async ({ resend, post }) => {
    const saved = await post('/api/true-path-report', {
      record: validRecord(),
      idempotencyKey: IDEMPOTENCY_KEY
    });

    // Fire the first submission and do not await it — it is now mid-flight at the provider.
    const inFlight = post('/api/true-path-report', {
      resultId: saved.body.resultId,
      email: 'visitor@example.com',
      firstName: 'Wei',
      reportConsent: true,
      marketingConsent: false,
      idempotencyKey: IDEMPOTENCY_KEY
    });

    // Give the request time to reach the provider and stall there.
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.ok(resend.pendingCount > 0, 'fixture: the provider send should be in flight');

    // A concurrent submission for the same report must not be told the report was delivered.
    const concurrent = await post('/api/true-path-report', {
      resultId: saved.body.resultId,
      email: 'visitor@example.com',
      firstName: 'Wei',
      reportConsent: true,
      marketingConsent: false,
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.notEqual(
      concurrent.body.sent,
      true,
      'a pending send must never be reported to a concurrent visitor as delivered'
    );

    // Let the original finish so the test leaves no dangling work behind. `withServer` releases
    // this in its finally as well, so a failure above cannot strand the suite.
    resend.release();
    const first = await inFlight;
    assert.equal(first.body.sent, true, 'the original sender itself does succeed');
  }, { timeout: 20000 });
});

test('email: the same report to a DIFFERENT address is a conflict, not a silent send', async () => {
  await withServer({}, async ({ resend, post }) => {
    const { saved } = await saveThenLead(post);
    const sendsAfterFirst = resend.messages.length;

    const otherRecipient = await post('/api/true-path-report', {
      resultId: saved.body.resultId,
      email: 'someone-else@example.com',
      firstName: 'Other',
      reportConsent: true,
      marketingConsent: false,
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.notEqual(
      otherRecipient.status,
      200,
      'a report must not be quietly redirected to a second address'
    );
    assert.equal(
      resend.messages.length,
      sendsAfterFirst,
      'the conflicting request must not send anything'
    );
  });
});

test('email: an invalid address is refused before any claim is made', async () => {
  await withServer({}, async ({ resend, post }) => {
    const saved = await post('/api/true-path-report', {
      record: validRecord(),
      idempotencyKey: IDEMPOTENCY_KEY
    });

    const bad = await post('/api/true-path-report', {
      resultId: saved.body.resultId,
      email: 'not-an-email',
      reportConsent: true,
      idempotencyKey: IDEMPOTENCY_KEY
    });

    assert.equal(bad.status, 400);
    assert.equal(resend.messages.length, 0, 'no email may be attempted for an invalid address');
  });
});

test('email: marketing consent is recorded separately from report delivery', async () => {
  await withServer({}, async ({ kv, post }) => {
    const { saved } = await saveThenLead(post, { marketingConsent: false });

    // The lead is stored, and its two consents stay distinguishable.
    const stored = kvGetRecord(kv, saved.body.resultId);
    assert.ok(stored && stored.lead, 'the captured lead must be attached to the record');
    assert.equal(stored.lead.email, 'visitor@example.com');
    assert.equal(stored.lead.reportConsent, true, 'report delivery was requested');
    assert.equal(stored.lead.marketingConsent, false, 'marketing was declined and must stay false');
  });
});

// ─── PDF ─────────────────────────────────────────────────────────────────────────────────────

test('pdf: a persisted report renders as a real PDF over the real endpoint', async () => {
  await withServer({}, async ({ server, post }) => {
    const saved = await post('/api/true-path-report', {
      record: validRecord(),
      idempotencyKey: IDEMPOTENCY_KEY
    });

    const response = await fetch(`${server.url}/api/true-path-pdf?id=${saved.body.resultId}`);
    assert.equal(response.status, 200, 'a stored report must be downloadable');

    const contentType = response.headers.get('content-type') || '';
    assert.match(contentType, /application\/pdf/, 'the response must be a PDF, not JSON');

    const disposition = response.headers.get('content-disposition') || '';
    assert.match(disposition, /attachment/, 'the PDF is a download');
    assert.match(disposition, /\.pdf/, 'and is named as one');

    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length > 1000, `the PDF is suspiciously small (${bytes.length} bytes)`);
    assert.equal(
      bytes.subarray(0, 5).toString('latin1'),
      '%PDF-',
      'the payload must actually be a PDF document'
    );
    assert.ok(
      bytes.subarray(-1024).toString('latin1').includes('%%EOF'),
      'the PDF must be complete, not truncated mid-write'
    );

    // Page count and CJK glyph coverage are asserted in the Python PDF suite, which parses the
    // document properly rather than trusting a byte signature.
  });
});

test('pdf: a request with neither an id nor a payload is refused', async () => {
  await withServer({}, async ({ server }) => {
    const response = await fetch(`${server.url}/api/true-path-pdf`);
    assert.equal(response.status, 400, 'the endpoint must ask for something to render');
  });
});

test('pdf: a non-GET method is refused', async () => {
  await withServer({}, async ({ server }) => {
    const response = await fetch(`${server.url}/api/true-path-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'tp_test000001' })
    });
    assert.equal(response.status, 405);
    assert.match(response.headers.get('allow') || '', /GET/);
  });
});
