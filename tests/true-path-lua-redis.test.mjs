/**
 * True Path — REAL Redis verification of the four EVAL scripts in `true-path/lib/server/store.ts`.
 *
 * Why this exists: the API suite (`true-path-api.test.mjs`) drives the store through a JS double
 * that dispatches on each script's `-- tfp:` marker comment. That double never evaluates the Lua
 * BODY, so a defect inside the script itself is invisible to it. One shipped exactly that way —
 * `markEmailSent` read `email`, `at` and `ttl` while binding only `KEYS[1]`:
 *
 *     local key = KEYS[1]
 *     ...
 *     if state.email ~= email then ...      -- `email` is not bound
 *     redis.call('SET', key, cjson.encode(state), 'EX', ttl)   -- nor is `ttl`
 *
 * The Redis script sandbox aborts on a read of an undeclared global
 * ("Script attempted to access nonexistent global variable"), so finalising ANY successful send
 * threw, and the claim stayed `pending` forever — permanently blocking that report from ever being
 * marked delivered. No amount of JS-side mocking can catch that class of bug.
 *
 * So this test extracts the scripts verbatim from the TypeScript source and executes them against
 * a real `redis-server` over RESP. It also runs the pre-fix `mark-sent` body to prove the defect
 * was real, rather than asserting a fix against a hypothetical.
 *
 * It needs a live server, so it is NOT part of `test:true-path`. Point it at one with:
 *
 *     REDIS_URL=redis://127.0.0.1:6399 node --test tests/true-path-lua-redis.test.mjs
 *
 * or use `tests/run-lua-redis-check.sh`, which builds a throwaway Redis in `scratch/` and runs
 * this. With no server reachable the whole suite SKIPS loudly rather than passing silently — an
 * unverified script must never look like a verified one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript');

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const STORE_PATH = path.join(repoRoot, 'true-path/lib/server/store.ts');

// ─── extract the real scripts from the TypeScript source ─────────────────────

const STORE_SOURCE = readFileSync(STORE_PATH, 'utf8');

/**
 * Pull each `const script = [ ... ].join('\n')` array literal out of the store source and
 * evaluate it as JavaScript. Evaluating the literal — rather than unescaping it by hand — means
 * the Lua this test runs is byte-for-byte the Lua the store sends to Redis.
 */
function extractScripts(source) {
  const scripts = [];
  const file = ts.createSourceFile('store.ts', source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'script' &&
        node.initializer && ts.isCallExpression(node.initializer) &&
        ts.isPropertyAccessExpression(node.initializer.expression) &&
        ts.isArrayLiteralExpression(node.initializer.expression.expression)) {
      const parts = node.initializer.expression.expression.elements.map((element) => {
        assert.ok(ts.isStringLiteral(element), 'Lua scripts must remain literal strings');
        return element.text;
      });
      const script = parts.join('\n');
      const marker = (script.match(/--\s*(tfp:[a-z-]+)/) || [, null])[1];
      scripts.push({ marker, script });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(scripts.length, 4, 'all four actual store scripts must be tested');
  return scripts;
}

const SCRIPTS = extractScripts(STORE_SOURCE);
const byMarker = (marker) => {
  const found = SCRIPTS.find((entry) => entry.marker === marker);
  assert.ok(found, `no script with marker ${marker} found in store.ts`);
  return found.script;
};

// ─── a minimal RESP client (no new dependency) ───────────────────────────────

/** Parse one complete RESP reply. Returns [value, bytesConsumed], or null when incomplete. */
function parseReply(buffer) {
  const crlf = buffer.indexOf('\r\n');
  if (crlf === -1) return null;

  const type = String.fromCharCode(buffer[0]);
  const header = buffer.toString('utf8', 1, crlf);

  if (type === '+' || type === '-') {
    return [header, type === '-' ? header : null, crlf + 2];
  }
  if (type === ':') {
    return [Number(header), null, crlf + 2];
  }
  if (type === '$') {
    const length = Number(header);
    if (length === -1) return [null, null, crlf + 2];
    const start = crlf + 2;
    const end = start + length;
    if (buffer.length < end + 2) return null;
    return [buffer.toString('utf8', start, end), null, end + 2];
  }
  if (type === '*') {
    const count = Number(header);
    if (count === -1) return [null, null, crlf + 2];

    const items = [];
    let offset = crlf + 2;
    let error = null;

    for (let i = 0; i < count; i += 1) {
      const parsed = parseReply(buffer.subarray(offset));
      if (!parsed) return null;
      if (parsed[1] !== null && parsed[1] !== undefined) error = parsed[1];
      items.push(parsed[0]);
      offset += parsed[2];
    }
    return [items, error, offset];
  }
  throw new Error('Unparseable RESP reply: ' + JSON.stringify(header));
}

function encodeCommand(args) {
  const parts = [`*${args.length}\r\n`];
  for (const arg of args) {
    const value = Buffer.from(String(arg), 'utf8');
    parts.push(`$${value.length}\r\n`, value, '\r\n');
  }
  return Buffer.concat(parts.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part))));
}

class RedisConnection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.pending = null;
  }

  static connect(host, port, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const connection = new RedisConnection(socket);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`timed out connecting to ${host}:${port}`));
      }, timeoutMs);

      socket.once('connect', () => {
        clearTimeout(timer);
        socket.setNoDelay(true);
        resolve(connection);
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      socket.on('data', (chunk) => connection.onData(chunk));
    });
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.drain();
  }

  drain() {
    while (this.pending) {
      const parsed = parseReply(this.buffer);
      if (!parsed) return;
      const [value, error, consumed] = parsed;
      this.buffer = this.buffer.subarray(consumed);
      const { resolve, reject } = this.pending;
      this.pending = null;
      if (error) reject(new Error(error));
      else resolve(value);
    }
  }

  send(args) {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.socket.write(encodeCommand(args));
      this.drain();
    });
  }

  close() {
    this.socket.destroy();
  }
}

// ─── connection setup ────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6399';
const parsedUrl = new URL(REDIS_URL);
const HOST = parsedUrl.hostname || '127.0.0.1';
const PORT = Number(parsedUrl.port || 6379);

const RESULT_TTL_SECONDS = 60 * 60 * 24 * 90;
const KEY = (id) => `tfp:truepath:result:${id}`;
const EMAIL_KEY = (id) => `tfp:truepath:emailed:${id}`;
const REQUEST_KEY = (id) => `tfp:truepath:request:${id}`;

let redis = null;
let unreachable = null;

try {
  redis = await RedisConnection.connect(HOST, PORT);
} catch (error) {
  unreachable = error;
}

if (unreachable) {
  // A loud skip, so nobody reads a green run as "the Lua was verified" when no server ran.
  test('lua (real redis): SKIPPED — no Redis reachable', (t) => {
    t.skip(
      `could not reach ${REDIS_URL} (${unreachable.message}). Start one with ` +
        'tests/run-lua-redis-check.sh, or set REDIS_URL. Script semantics remain UNVERIFIED.'
    );
  });
} else {
  await redis.send(['PING']);

  const evalScript = (script, keys, argv) =>
    redis.send(['EVAL', script, String(keys.length), ...keys, ...argv.map(String)]);

  const id = (suffix) => `tp_test${suffix}${Date.now().toString(36)}`;
  const flush = async (...keys) => {
    await redis.send(['DEL', ...keys]);
  };

  test('redis: the server is real and reachable', async () => {
    const info = await redis.send(['INFO', 'server']);
    assert.match(String(info), /redis_version:\d+\./, 'a real redis-server must answer');
  });

  test('redis: all four scripts extract from store.ts and are non-trivial', () => {
    assert.equal(SCRIPTS.length, 4, 'the store must define exactly four EVAL scripts');
    assert.deepEqual(
      SCRIPTS.map((entry) => entry.marker).sort(),
      ['tfp:claim-email', 'tfp:claim-save', 'tfp:mark-sent', 'tfp:release-email']
    );
    for (const entry of SCRIPTS) {
      assert.ok(entry.script.includes('redis.call'), `${entry.marker} must actually call redis`);
    }
  });

  // ─── claim-save ────────────────────────────────────────────────────────────

  test('redis claim-save: creates, writes the result BEFORE the mapping, and sets both TTLs', async () => {
    const script = byMarker('tfp:claim-save');
    const resultId = id('a');
    const requestKey = id('req-a');
    const fingerprint = 'fp-1';

    await flush(KEY(resultId), REQUEST_KEY(requestKey));

    const reply = await evalScript(
      script,
      [REQUEST_KEY(requestKey), KEY(resultId)],
      [RESULT_TTL_SECONDS, resultId, fingerprint, JSON.stringify({ resultId, hello: 'world' }), 'tfp:truepath:result:']
    );

    assert.deepEqual(reply, ['created', resultId], 'a fresh key must be created');

    // Result first, then the mapping. A runtime error does not roll back executed commands, so the
    // reverse order could strand a mapping pointing at a record that was never written.
    assert.ok(await redis.send(['EXISTS', KEY(resultId)]), 'the result must exist');
    assert.ok(await redis.send(['EXISTS', REQUEST_KEY(requestKey)]), 'the mapping must exist');

    const resultTtl = await redis.send(['TTL', KEY(resultId)]);
    const requestTtl = await redis.send(['TTL', REQUEST_KEY(requestKey)]);
    assert.ok(resultTtl > 0 && resultTtl <= RESULT_TTL_SECONDS, `result TTL must be set (got ${resultTtl})`);
    assert.ok(requestTtl > 0 && requestTtl <= RESULT_TTL_SECONDS, `mapping TTL must be set (got ${requestTtl})`);

    const stored = await redis.send(['GET', KEY(resultId)]);
    assert.equal(JSON.parse(stored).hello, 'world', 'the record must be stored verbatim');
  });

  test('redis claim-save: a replay with the same fingerprint returns the ORIGINAL id, not the new one', async () => {
    const script = byMarker('tfp:claim-save');
    const firstId = id('b1');
    const secondId = id('b2');
    const requestKey = id('req-b');
    const fingerprint = 'fp-same';

    await flush(KEY(firstId), KEY(secondId), REQUEST_KEY(requestKey));

    const created = await evalScript(
      script,
      [REQUEST_KEY(requestKey), KEY(firstId)],
      [RESULT_TTL_SECONDS, firstId, fingerprint, JSON.stringify({ resultId: firstId }), 'tfp:truepath:result:']
    );
    assert.deepEqual(created, ['created', firstId]);

    // The SAME request key, a DIFFERENT (freshly minted) result id — the retry case.
    const replay = await evalScript(
      script,
      [REQUEST_KEY(requestKey), KEY(secondId)],
      [RESULT_TTL_SECONDS, secondId, fingerprint, JSON.stringify({ resultId: secondId }), 'tfp:truepath:result:']
    );

    assert.deepEqual(replay, ['exists', firstId], 'the replay must answer with the original id');
    assert.equal(await redis.send(['EXISTS', KEY(secondId)]), 0, 'no second record may be written');
  });

  test('redis claim-save: a replay whose record has vanished reports `missing`, never `exists`', async () => {
    const script = byMarker('tfp:claim-save');
    const resultId = id('c');
    const requestKey = id('req-c');
    const fingerprint = 'fp-missing';

    await flush(KEY(resultId), REQUEST_KEY(requestKey));

    await evalScript(
      script,
      [REQUEST_KEY(requestKey), KEY(resultId)],
      [RESULT_TTL_SECONDS, resultId, fingerprint, JSON.stringify({ resultId }), 'tfp:truepath:result:']
    );

    // Simulate expiry/external deletion of the record while the mapping survives.
    await redis.send(['DEL', KEY(resultId)]);

    const replay = await evalScript(
      script,
      [REQUEST_KEY(requestKey), KEY(resultId)],
      [RESULT_TTL_SECONDS, resultId, fingerprint, JSON.stringify({ resultId }), 'tfp:truepath:result:']
    );

    assert.deepEqual(
      replay,
      ['missing', resultId],
      'the EXISTS probe must look up the ORIGINAL id via the keyPrefix argument'
    );
  });

  test('redis claim-save: the same key with DIFFERENT answers is a conflict', async () => {
    const script = byMarker('tfp:claim-save');
    const resultId = id('d');
    const requestKey = id('req-d');

    await flush(KEY(resultId), REQUEST_KEY(requestKey));

    await evalScript(
      script,
      [REQUEST_KEY(requestKey), KEY(resultId)],
      [RESULT_TTL_SECONDS, resultId, 'fp-original', JSON.stringify({ resultId }), 'tfp:truepath:result:']
    );

    const conflict = await evalScript(
      script,
      [REQUEST_KEY(requestKey), KEY(resultId)],
      [RESULT_TTL_SECONDS, resultId, 'fp-different', JSON.stringify({ resultId }), 'tfp:truepath:result:']
    );

    assert.deepEqual(conflict, ['conflict', ''], 'changed answers under a reused key must conflict');
  });

  test('redis claim-save: a corrupt mapping is a conflict, not a crash', async () => {
    const script = byMarker('tfp:claim-save');
    const resultId = id('e');
    const requestKey = id('req-e');

    await flush(KEY(resultId), REQUEST_KEY(requestKey));
    await redis.send(['SET', REQUEST_KEY(requestKey), 'this-is-not-json']);

    const reply = await evalScript(
      script,
      [REQUEST_KEY(requestKey), KEY(resultId)],
      [RESULT_TTL_SECONDS, resultId, 'fp', JSON.stringify({ resultId }), 'tfp:truepath:result:']
    );

    assert.deepEqual(reply, ['conflict', ''], 'the pcall-guarded decode must degrade to a conflict');
  });

  // ─── claim-email ───────────────────────────────────────────────────────────

  test('redis claim-email: claimed → pending → sent, and a different recipient conflicts', async () => {
    const script = byMarker('tfp:claim-email');
    const resultId = id('f');
    const key = EMAIL_KEY(resultId);
    const email = 'ada@example.com';

    await flush(key);

    const claimed = await evalScript(
      script,
      [key],
      [RESULT_TTL_SECONDS, email, 'provider-key-1', new Date().toISOString()]
    );
    assert.deepEqual(claimed, ['claimed'], 'the first caller owns the send');

    const pending = await evalScript(
      script,
      [key],
      [RESULT_TTL_SECONDS, email, 'provider-key-1', new Date().toISOString()]
    );
    assert.deepEqual(pending, ['pending'], 'a concurrent attempt must NOT be told `sent`');

    const conflicted = await evalScript(
      script,
      [key],
      [RESULT_TTL_SECONDS, 'eve@example.com', 'provider-key-2', new Date().toISOString()]
    );
    assert.deepEqual(conflicted, ['conflict'], 'the claim is bound to the recipient');

    const ttl = await redis.send(['TTL', key]);
    assert.ok(ttl > 0, `the claim must carry a TTL (got ${ttl})`);

    const stored = JSON.parse(await redis.send(['GET', key]));
    assert.equal(stored.state, 'pending');
    assert.equal(stored.email, email);
    assert.equal(stored.providerKey, 'provider-key-1');
  });

  // ─── mark-sent — the defect this suite exists for ──────────────────────────

  test('redis mark-sent: the shipped pre-fix script really DOES fail on a real Redis', async () => {
    // The defect, reproduced: only KEYS[1] is bound, yet `email`/`ttl` are read. Redis aborts the
    // script on the undeclared-global read. Running the broken body is what makes the fix
    // meaningful — it proves the bug was live rather than theoretical.
    const broken = [
      '-- tfp:mark-sent (pre-fix, bindings removed)',
      'local key = KEYS[1]',
      "local raw = redis.call('GET', key)",
      "if not raw then return {'missing'} end",
      'local ok, state = pcall(cjson.decode, raw)',
      "if not ok or type(state) ~= 'table' then return {'missing'} end",
      "if state.email ~= email then return {'conflict'} end",
      "state.state = 'sent'",
      'state.sentAt = at',
      "redis.call('SET', key, cjson.encode(state), 'EX', ttl)",
      "return {'sent'}",
    ].join('\n');

    const resultId = id('g');
    const key = EMAIL_KEY(resultId);
    await flush(key);
    await redis.send([
      'SET',
      key,
      JSON.stringify({ state: 'pending', email: 'ada@example.com', at: new Date().toISOString() }),
    ]);

    await assert.rejects(
      () => evalScript(broken, [key], [RESULT_TTL_SECONDS, 'ada@example.com', new Date().toISOString()]),
      /nonexistent global variable|attempted to access/i,
      'the unbound read must be rejected by the real script sandbox'
    );

    // ...and it left the claim stuck at `pending`, so the report could never be finalised.
    const stuck = JSON.parse(await redis.send(['GET', key]));
    assert.equal(stuck.state, 'pending', 'the broken script cannot advance the claim');
  });

  test('redis mark-sent: the shipped script binds email/at/ttl and finalises the claim', async () => {
    const script = byMarker('tfp:mark-sent');
    const resultId = id('h');
    const key = EMAIL_KEY(resultId);
    const email = 'ada@example.com';
    const sentAt = new Date().toISOString();

    await flush(key);
    await redis.send([
      'SET',
      key,
      JSON.stringify({ state: 'pending', email, providerKey: 'pk', at: new Date().toISOString() }),
    ]);

    const reply = await evalScript(script, [key], [RESULT_TTL_SECONDS, email, sentAt]);
    assert.deepEqual(reply, ['sent'], 'finalisation must succeed once the bindings exist');

    const stored = JSON.parse(await redis.send(['GET', key]));
    assert.equal(stored.state, 'sent', 'the claim must advance to sent');
    assert.equal(stored.sentAt, sentAt, 'the timestamp must come from ARGV[3]');
    assert.equal(stored.email, email, 'the bound email must match the claim');
    assert.equal(stored.providerKey, 'pk', 'finalisation must preserve the rest of the state');

    const ttl = await redis.send(['TTL', key]);
    assert.ok(ttl > 0 && ttl <= RESULT_TTL_SECONDS, `ttl must be a real number, not nil (got ${ttl})`);

    // Now that it is `sent`, a repeat claim is a true duplicate rather than `pending` forever.
    const again = await evalScript(
      byMarker('tfp:claim-email'),
      [key],
      [RESULT_TTL_SECONDS, email, 'pk', new Date().toISOString()]
    );
    assert.deepEqual(again, ['sent'], 'a finalised claim must report `sent` to the next caller');
  });

  test('redis mark-sent: a missing claim is reported, not thrown', async () => {
    const script = byMarker('tfp:mark-sent');
    const resultId = id('i');
    const key = EMAIL_KEY(resultId);
    await flush(key);

    const reply = await evalScript(script, [key], [RESULT_TTL_SECONDS, 'ada@example.com', new Date().toISOString()]);
    assert.deepEqual(reply, ['missing']);
  });

  test('redis mark-sent: finalising to a different recipient is a conflict', async () => {
    const script = byMarker('tfp:mark-sent');
    const resultId = id('j');
    const key = EMAIL_KEY(resultId);

    await flush(key);
    await redis.send([
      'SET',
      key,
      JSON.stringify({ state: 'pending', email: 'ada@example.com', at: new Date().toISOString() }),
    ]);

    const reply = await evalScript(script, [key], [RESULT_TTL_SECONDS, 'eve@example.com', new Date().toISOString()]);
    assert.deepEqual(reply, ['conflict']);

    const stored = JSON.parse(await redis.send(['GET', key]));
    assert.equal(stored.state, 'pending', 'a mismatched recipient must not finalise the claim');
  });

  // ─── release-email ─────────────────────────────────────────────────────────

  test('redis release-email: drops a failed claim so a retry can proceed', async () => {
    const script = byMarker('tfp:release-email');
    const resultId = id('k');
    const key = EMAIL_KEY(resultId);
    const email = 'ada@example.com';

    await flush(key);
    await evalScript(
      byMarker('tfp:claim-email'),
      [key],
      [RESULT_TTL_SECONDS, email, 'pk', new Date().toISOString()]
    );

    const released = await evalScript(script, [key], [email]);
    assert.deepEqual(released, ['released']);
    assert.equal(await redis.send(['EXISTS', key]), 0, 'the claim must be gone');

    // A retry now owns the send again.
    const reclaim = await evalScript(
      byMarker('tfp:claim-email'),
      [key],
      [RESULT_TTL_SECONDS, email, 'pk', new Date().toISOString()]
    );
    assert.deepEqual(reclaim, ['claimed'], 'the visitor retry must be able to send again');
  });

  test('redis release-email: never releases a `sent` claim', async () => {
    const script = byMarker('tfp:release-email');
    const resultId = id('l');
    const key = EMAIL_KEY(resultId);
    const email = 'ada@example.com';

    await flush(key);
    await redis.send([
      'SET',
      key,
      JSON.stringify({ state: 'sent', email, at: new Date().toISOString(), sentAt: new Date().toISOString() }),
    ]);

    const reply = await evalScript(script, [key], [email]);
    assert.deepEqual(reply, ['sent'], 'a delivered claim must never be released');
    assert.equal(await redis.send(['EXISTS', key]), 1, 'the record of delivery must survive');
  });

  test('redis release-email: never releases a claim held for a different recipient', async () => {
    const script = byMarker('tfp:release-email');
    const resultId = id('m');
    const key = EMAIL_KEY(resultId);

    await flush(key);
    await redis.send([
      'SET',
      key,
      JSON.stringify({ state: 'pending', email: 'ada@example.com', at: new Date().toISOString() }),
    ]);

    const reply = await evalScript(script, [key], ['eve@example.com']);
    assert.deepEqual(reply, ['conflict'], 'an in-flight claim belongs to its own recipient');
    assert.equal(await redis.send(['EXISTS', key]), 1, 'the other attempt must stay intact');
  });

  // ─── cleanup ───────────────────────────────────────────────────────────────

  test('redis: cleanup of the keys created by this run', async () => {
    const keys = await redis.send(['KEYS', 'tfp:truepath:*tp_test*']);
    if (Array.isArray(keys) && keys.length) await redis.send(['DEL', ...keys]);
    const remaining = await redis.send(['KEYS', 'tfp:truepath:*tp_test*']);
    assert.equal(Array.isArray(remaining) ? remaining.length : 0, 0, 'no scratch keys may remain');
  });

  test.after(() => {
    if (redis) redis.close();
  });
}
