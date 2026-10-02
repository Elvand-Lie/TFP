/**
 * True Path — E2E harness: transpile hook + local server + upstream fakes.
 *
 * Runs the REAL request handlers from `api/` behind a local HTTP server, against the REAL
 * `true-path/lib/**` modules, with only the two network upstreams (Upstash KV, Resend) faked.
 * No new dependencies: the TypeScript that type-checks this repo is reused to transpile it.
 *
 * ─── Why a require hook ─────────────────────────────────────────────────────────────────────
 * The handlers are TypeScript with extensionless relative imports (`../true-path/lib/server/store`),
 * which Node cannot resolve on its own. Rather than a build step or a test-only fork of the
 * handlers, `typescript` (already a devDependency) transpiles on require, and `_resolveFilename`
 * learns to try `.ts`. The code under test is then byte-identical to what Vercel bundles.
 *
 * ─── Why fake at `fetch` ────────────────────────────────────────────────────────────────────
 * Both upstreams already speak plain `fetch`:
 *   Upstash  — `true-path/lib/server/store.ts` POSTs the REST command array
 *   Resend   — `resend@6` posts to https://api.resend.com
 * so swapping `globalThis.fetch` mocks both without patching either library, and lets a test
 * drive failure, in-flight and duplicate states that a real provider could not be asked for.
 *
 * ─── Scope of the fake ──────────────────────────────────────────────────────────────────────
 * The KV fake reproduces the semantics the store depends on, not Redis in general: SET/GET/DEL
 * with TTL, plus the three EVAL scripts the store sends (save-claim, email-claim, email-sent) and
 * the email-release script. It is deliberately small and its gaps are loud: an unrecognised EVAL
 * throws instead of returning something that could look like success.
 *
 * NOTE: `process.env` is set to placeholder values ONLY where a module reads it at import time
 * (`send-lite-report.ts` constructs its Resend client at module scope). No real credentials are
 * ever read, printed or written.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, from `tests/e2e/`. */
export const REPO_ROOT = path.resolve(here, '..', '..');

// ─── TypeScript require hook ─────────────────────────────────────────────────────────────────

let hookInstalled = false;

/**
 * Teach Node to require `.ts` via the repo's own TypeScript, and to resolve extensionless
 * relative specifiers to `.ts`. Idempotent.
 */
export function installTypeScriptHook() {
  if (hookInstalled) return;
  hookInstalled = true;

  const ts = require(path.join(REPO_ROOT, 'node_modules', 'typescript'));

  require.extensions['.ts'] = function (mod, filename) {
    const source = readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        allowJs: true,
        resolveJsonModule: true,
        skipLibCheck: true
      },
      fileName: filename
    });
    mod._compile(outputText, filename);
  };

  const resolveFilename = require('module')._resolveFilename;
  require('module')._resolveFilename = function (request, parent, isMain, options) {
    try {
      return resolveFilename.call(this, request, parent, isMain, options);
    } catch (error) {
      if (request.startsWith('.') && parent && parent.filename) {
        const base = path.resolve(path.dirname(parent.filename), request);
        for (const candidate of [
          `${base}.ts`,
          `${base}.js`,
          path.join(base, 'index.ts'),
          path.join(base, 'index.js')
        ]) {
          if (existsSync(candidate)) return candidate;
        }
      }
      throw error;
    }
  };
}

/** Placeholder env so import-time readers succeed. Never real credentials. */
export function installPlaceholderEnv() {
  const placeholders = {
    RESEND_API_KEY: 'test_placeholder_not_a_real_key',
    SENDER_EMAIL: 'sender@example.invalid',
    CONTACT_TO_EMAIL: 'contact@example.invalid',
    LEAD_NOTIFY_EMAIL: 'lead@example.invalid',
    // A complete, syntactically valid KV pair so `isStoreConfigured()` is true and the honest
    // write paths run. All traffic is intercepted by the fake below.
    UPSTASH_REDIS_REST_KV_REST_API_URL: 'https://kv.example.invalid',
    UPSTASH_REDIS_REST_KV_REST_API_TOKEN: 'test_placeholder_kv_token'
  };
  for (const [key, value] of Object.entries(placeholders)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

// ─── Upstream fakes ──────────────────────────────────────────────────────────────────────────

/** Record a call for assertions. */
function record(log, entry) {
  if (log) log.push(entry);
}

/**
 * A minimal stand-in for the store's Redis usage: string keys, TTL, and the EVAL scripts the
 * store sends. Keys are namespaced exactly as the real code does, so assertions can be written
 * against real key names.
 */
export class FakeKv {
  constructor(options = {}) {
    this.map = new Map(); // key -> { value, expiresAt }
    this.commands = [];
    /** Set to throw on the next command, or a function for conditional failure. */
    this.failWith = options.failWith || null;
    /** When true, EVAL returns a command-level `error` inside a 200 envelope. */
    this.failEnvelope = options.failEnvelope || false;
  }

  /** Drop expired keys lazily, like a TTL store would. */
  #read(key) {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiresAt && hit.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }

  #write(key, value, ttlSeconds) {
    this.map.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
    });
  }

  /** Execute one REST command array, exactly as the store issues it. */
  execute(args) {
    if (this.failWith) {
      const failure = typeof this.failWith === 'function' ? this.failWith(args) : this.failWith;
      if (failure) throw failure;
    }
    this.commands.push(args);

    const [name, ...rest] = args.map(String);
    switch (name) {
      case 'SET': {
        const [key, value, , ttl] = rest;
        this.#write(key, value, ttl ? Number(ttl) : null);
        return 'OK';
      }
      case 'GET':
        return this.#read(rest[0]);
      case 'DEL':
        this.map.delete(rest[0]);
        return 1;
      case 'EVAL':
        return this.#evalScript(rest);
      default:
        throw new Error(`FakeKv: unsupported command "${name}"`);
    }
  }

  /**
   * Dispatch the store's Lua scripts by their `-- tfp:<name>` marker.
   *
   * Matching on an explicit marker — rather than on implementation lines that happen to appear in
   * the script text — is what keeps this fake honest. A heuristic match can silently accept a
   * changed script and answer with the wrong shape, which would make a broken store look healthy;
   * an unknown marker throws instead.
   */
  #evalScript([script, keyCount, ...keysAndArgs]) {
    const marker = /--\s*tfp:([a-z-]+)/.exec(script);
    if (!marker) {
      throw new Error('FakeKv: EVAL script has no "-- tfp:<name>" marker — update the fake with the store');
    }

    // Redis splits EVAL args into KEYS[1..n] then ARGV[1..m]. Reproduce that split rather than
    // indexing positionally, so a change to the key/arg layout shows up as a wrong value here
    // instead of quietly passing.
    const count = Number(keyCount);
    const keys = keysAndArgs.slice(0, count);
    const argv = keysAndArgs.slice(count);

    switch (marker[1]) {
      case 'claim-save':
        return this.#saveClaim(keys, argv);
      case 'claim-email':
        return this.#emailClaim(keys, argv);
      case 'mark-sent':
        return this.#markSent(keys, argv);
      case 'release-email':
        return this.#releaseEmail(keys, argv);
      default:
        throw new Error(`FakeKv: unsupported script marker "-- tfp:${marker[1]}"`);
    }
  }

  /** KEYS: requestKey, resultKey. ARGV: ttl, resultId, fingerprint, recordJson, keyPrefix. */
  #saveClaim([requestKey, resultKey], [ttl, resultId, fingerprint, recordJson, keyPrefix]) {
    const existing = this.#read(requestKey);
    if (existing) {
      const decoded = JSON.parse(existing);
      if (decoded.fingerprint === fingerprint) {
        const claimedId = String(decoded.resultId);
        // The claimed record lives under the ORIGINAL id. If it is gone (expired), the replay
        // cannot be served — report it rather than handing back an id with nothing behind it.
        if (this.#read(keyPrefix + claimedId) === null) return ['missing', claimedId];
        return ['exists', claimedId];
      }
      return ['conflict', ''];
    }
    // Result first, then the mapping, matching the script's order.
    this.#write(resultKey, recordJson, Number(ttl));
    this.#write(requestKey, JSON.stringify({ resultId, fingerprint }), Number(ttl));
    return ['created', resultId];
  }

  /** KEYS: emailKey. ARGV: ttl, email, providerKey, at. */
  #emailClaim([key], [ttl, email, providerKey, at]) {
    const raw = this.#read(key);
    if (raw) {
      const state = JSON.parse(raw);
      if (state.email !== email) return ['conflict'];
      if (state.state === 'sent') return ['sent'];
      return ['pending'];
    }
    this.#write(key, JSON.stringify({ state: 'pending', email, providerKey, at }), Number(ttl));
    return ['claimed'];
  }

  /** KEYS: emailKey. ARGV: ttl, email, at. */
  #markSent([key], [ttl, email, at]) {
    const raw = this.#read(key);
    if (!raw) return ['missing'];
    const state = JSON.parse(raw);
    if (state.email !== email) return ['conflict'];
    state.state = 'sent';
    state.sentAt = at;
    this.#write(key, JSON.stringify(state), Number(ttl));
    return ['sent'];
  }

  /** KEYS: emailKey. ARGV: email. */
  #releaseEmail([key], [email]) {
    const raw = this.#read(key);
    if (!raw) return ['missing'];
    const state = JSON.parse(raw);
    if (state.state === 'sent') return ['sent'];
    if (state.email !== email) return ['conflict'];
    this.map.delete(key);
    return ['released'];
  }

  /** Clear all state and recorded commands. */
  reset() {
    this.map.clear();
    this.commands.length = 0;
    this.failWith = null;
    this.failEnvelope = false;
  }
}

/** Read a record straight out of the fake, for "was it really persisted?" assertions. */
export function kvGetRecord(kv, resultId) {
  const raw = kv.execute(['GET', `tfp:truepath:result:${resultId}`]);
  return typeof raw === 'string' ? JSON.parse(raw) : null;
}

/** Inspect the email-delivery claim state. */
export function kvGetEmailState(kv, resultId) {
  const raw = kv.execute(['GET', `tfp:truepath:emailed:${resultId}`]);
  return typeof raw === 'string' ? JSON.parse(raw) : null;
}

/**
 * Resend stand-in. `mode` selects the behaviour a test needs:
 *   'ok'      — accepts the send
 *   'error'   — provider-level error (HTTP 200 with an error body, as Resend does)
 *   'http500' — transport/server failure
 *   'hang'    — never resolves, for in-flight assertions. `hangMatches` limits the stall to
 *               messages addressed to a given recipient, so a test can strand the visitor email
 *               while leaving the team notification working.
 */
export class FakeResend {
  constructor(options = {}) {
    this.mode = options.mode || 'ok';
    this.hangMatches = options.hangMatches || null;
    this.messages = [];
    this.calls = [];
    this.#pending = [];
  }

  #pending;

  /** Await any send that is still in flight (used with mode 'hang' + release). */
  get pendingCount() {
    return this.#pending.length;
  }

  /** Let a 'hang' send finish. */
  release() {
    const waiting = this.#pending.splice(0, this.#pending.length);
    for (const resolve of waiting) resolve();
  }

  /** Should this particular message stall? */
  #shouldHang(init) {
    if (this.mode !== 'hang') return false;
    if (!this.hangMatches) return true;
    let body = {};
    try {
      body = JSON.parse(String((init && init.body) || '{}'));
    } catch (error) {
      body = {};
    }
    const recipients = Array.isArray(body.to) ? body.to : [body.to];
    return recipients.includes(this.hangMatches);
  }

  handle(url, init) {
    this.calls.push({ url, body: init && init.body ? String(init.body) : null });

    const respond = () => {
      if (this.mode === 'error') {
        return new Response(JSON.stringify({ statusCode: 422, message: 'Invalid to' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (this.mode === 'http500') {
        return new Response('upstream exploded', { status: 500 });
      }
      let body = {};
      try {
        body = JSON.parse(String((init && init.body) || '{}'));
      } catch (error) {
        body = {};
      }
      const id = `msg_${this.messages.length + 1}`;
      this.messages.push({ id, to: body.to, subject: body.subject });
      return new Response(JSON.stringify({ id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    if (this.#shouldHang(init)) {
      return new Promise((resolve) => {
        this.#pending.push(() => resolve(respond()));
      });
    }
    return Promise.resolve(respond());
  }
}

// ─── fetch interception ──────────────────────────────────────────────────────────────────────

let realFetch = null;

/**
 * Route KV and Resend traffic to the fakes; pass everything else through to the real `fetch`.
 * Returns a restore function.
 */
export function installFetchInterceptor({ kv, resend }) {
  if (!realFetch) realFetch = globalThis.fetch;

  const upstreamLog = [];

  globalThis.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : String(input && input.url ? input.url : input);

    // Upstash REST command array.
    if (kv && (url.startsWith('https://kv.example.invalid') || url.includes('upstash.io'))) {
      record(upstreamLog, { target: 'kv', url });
      let args = [];
      try {
        args = JSON.parse(String((init && init.body) || '[]'));
      } catch (error) {
        args = [];
      }
      try {
        const result = kv.execute(args);
        if (kv.failEnvelope) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'ERR fake command failure' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            })
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ result }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );
      } catch (error) {
        return Promise.reject(error);
      }
    }

    // Resend email API.
    if (resend && url.includes('api.resend.com')) {
      record(upstreamLog, { target: 'resend', url });
      return resend.handle(url, init);
    }

    return realFetch.call(globalThis, input, init);
  };

  return {
    log: upstreamLog,
    restore() {
      globalThis.fetch = realFetch;
      realFetch = null;
    }
  };
}

// ─── HTTP server ─────────────────────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

/** `process.env` snapshot so per-test env tweaks do not leak between tests. */
function snapshotEnv() {
  return { ...process.env };
}

/**
 * Minimal `req`/`res` in the shape `@vercel/node` provides, so handlers run unmodified.
 */
function adaptRequest(nodeReq, body) {
  const url = new URL(nodeReq.url, 'http://127.0.0.1');
  const query = {};
  for (const [key, value] of url.searchParams) {
    query[key] = url.searchParams.getAll(key).length > 1 ? url.searchParams.getAll(key) : value;
  }
  return {
    method: nodeReq.method,
    url: nodeReq.url,
    headers: nodeReq.headers,
    query,
    // Vercel parses JSON bodies; the handlers also accept a raw string, which is what we pass.
    body: body.length ? body.toString('utf8') : undefined,
    cookies: {}
  };
}

/**
 * Minimal response object mirroring the subset the handlers use: `status`, `json`, `send`,
 * `setHeader`, `end`.
 */
function adaptResponse(nodeRes) {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
    setHeader(name, value) {
      res.headers[String(name).toLowerCase()] = value;
      return res;
    },
    getHeader(name) {
      return res.headers[String(name).toLowerCase()];
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      if (!res.headers['content-type']) res.headers['content-type'] = 'application/json; charset=utf-8';
      nodeRes.writeHead(res.statusCode, res.headers);
      nodeRes.end(JSON.stringify(payload));
      res.headersSent = true;
      return res;
    },
    send(payload) {
      res.body = payload;
      nodeRes.writeHead(res.statusCode, res.headers);
      nodeRes.end(payload);
      res.headersSent = true;
      return res;
    },
    end(payload) {
      if (payload !== undefined) res.body = payload;
      nodeRes.writeHead(res.statusCode, res.headers);
      nodeRes.end(payload);
      res.headersSent = true;
      return res;
    }
  };
  return res;
}

/**
 * `vercel.json` rewrites, mirrored for the local server.
 *
 * The deployment routes `/true-path/report/:id` to the report page; without that rewrite the
 * harness would 404 on every emailed report link, so the browser suite would be testing a routing
 * table the product does not have. Read from `vercel.json` rather than hard-coded, so the two
 * cannot drift: a rewrite that breaks the deployment breaks this suite too.
 */
let cachedRewrites = null;

function rewrites() {
  if (!cachedRewrites) {
    cachedRewrites = [];
    try {
      const config = JSON.parse(readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8'));
      for (const rule of config.rewrites || []) {
        cachedRewrites.push(pattern(rule.source), rule.destination);
      }
    } catch (error) {
      cachedRewrites = [];
    }
  }
  return cachedRewrites;
}

/** Compile a Vercel rewrite source (`/a/:param`) into a matcher. */
function pattern(source) {
  const names = [];
  const regex = String(source).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/:([A-Za-z0-9_]+)/g, (whole, name) => {
    names.push(name);
    return '/([^/]+)';
  });
  return { regex: new RegExp(`^${regex}/?$`), names };
}

/** Apply `vercel.json` rewrites to a request path. */
export function applyRewrites(urlPath) {
  const list = rewrites();
  for (let i = 0; i < list.length; i += 2) {
    const match = list[i].regex.exec(urlPath);
    if (match) return list[i + 1];
  }
  return urlPath;
}

/** Map a URL path to a file on disk, resolving directories to `index.html`. */
function resolveStatic(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let filePath = path.join(REPO_ROOT, decoded);

  // Refuse traversal outside the repo.
  if (!filePath.startsWith(REPO_ROOT)) return null;

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  // cleanUrls: /true-path/about -> /true-path/about.html
  if (!existsSync(filePath) && existsSync(`${filePath}.html`)) filePath = `${filePath}.html`;

  if (!existsSync(filePath) || !statSync(filePath).isFile()) return null;
  return filePath;
}

/**
 * Start the local server: real handlers for `/api/*`, real files for everything else.
 *
 * @returns {Promise<{url: string, close: () => Promise<void>, requests: Array}>}
 */
export async function startServer({ kv, resend } = {}) {
  installTypeScriptHook();
  installPlaceholderEnv();

  const interceptor = installFetchInterceptor({ kv, resend });

  const handlers = new Map();
  const apiDir = path.join(REPO_ROOT, 'api');
  for (const file of ['true-path-report', 'true-path-pdf', 'send-lite-report', 'daily-almanac', 'contact', 'bazi']) {
    const loaded = require(path.join(apiDir, `${file}.ts`));
    handlers.set(`/api/${file}`, loaded.default || loaded);
  }

  const requests = [];
  const envSnapshot = snapshotEnv();

  const server = createServer((nodeReq, nodeRes) => {
    const chunks = [];
    nodeReq.on('data', (chunk) => chunks.push(chunk));
    nodeReq.on('end', async () => {
      const body = Buffer.concat(chunks);
      const urlPath = nodeReq.url.split('?')[0];
      requests.push({ method: nodeReq.method, path: urlPath, url: nodeReq.url });

      // CORS so the browser can call the handlers the way it does on Vercel.
      nodeRes.setHeader('Access-Control-Allow-Origin', '*');
      nodeRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      nodeRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (nodeReq.method === 'OPTIONS') {
        nodeRes.writeHead(204);
        nodeRes.end();
        return;
      }

      const handler = handlers.get(urlPath);
      if (handler) {
        try {
          const req = adaptRequest(nodeReq, body);
          const res = adaptResponse(nodeRes);
          await handler(req, res);
          if (!res.headersSent) {
            nodeRes.writeHead(res.statusCode, res.headers);
            nodeRes.end();
          }
        } catch (error) {
          // A handler that throws is a real failure; surface it rather than a 404.
          nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
          nodeRes.end(
            JSON.stringify({ error: 'harness: handler threw', detail: String(error && error.message) })
          );
        }
        return;
      }

      if (urlPath.startsWith('/api/')) {
        nodeRes.writeHead(404, { 'Content-Type': 'application/json' });
        nodeRes.end(JSON.stringify({ error: 'harness: no such api route' }));
        return;
      }

      const file = resolveStatic(applyRewrites(urlPath));
      if (!file) {
        nodeRes.writeHead(404, { 'Content-Type': 'text/plain' });
        nodeRes.end('Not found');
        return;
      }
      const extension = path.extname(file).toLowerCase();
      nodeRes.writeHead(200, { 'Content-Type': MIME[extension] || 'application/octet-stream' });
      nodeRes.end(readFileSync(file));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    upstream: interceptor,
    async close() {
      interceptor.restore();
      process.env = envSnapshot;
      await new Promise((resolve) => server.close(resolve));
    }
  };
}
