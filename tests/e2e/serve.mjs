/**
 * True Path — E2E server entry point.
 *
 * Starts the harness from `harness.mjs` on a fixed port and exposes a small `/__test/*` control
 * channel so an out-of-process driver (the Python Playwright suites) can steer the upstream
 * fakes and read back what the server actually did. Without that channel a browser-driven suite
 * could only assert on what the page shows, not on what the server stored or sent.
 *
 * Usage: node tests/e2e/serve.mjs [--port 0]
 * Prints one line of JSON:
 *   {"url":"http://127.0.0.1:SITE","port":SITE,"control":"http://127.0.0.1:CONTROL","controlPort":CONTROL}
 *
 * `url` is the SITE (the app under test); `control` is the `__test` channel. They are two
 * different listeners on two different ports — a driver that used `url` for both would 404 on
 * every page, which is why both are reported explicitly.
 *
 * The control routes are prefixed `__test` and are only ever mounted by this entry point — the
 * handlers and the static site are untouched, and nothing here is part of the deployment.
 */

import { createServer } from 'node:http';
import { startServer, FakeKv, FakeResend, kvGetRecord, kvGetEmailState } from './harness.mjs';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requestedPort = portIndex === -1 ? 0 : Number(args[portIndex + 1]);

const kv = new FakeKv();
const resend = new FakeResend();
const server = await startServer({ kv, resend });

/** Read a JSON request body. */
function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        resolve({});
      }
    });
  });
}

function send(nodeRes, status, payload) {
  nodeRes.writeHead(status, { 'Content-Type': 'application/json' });
  nodeRes.end(JSON.stringify(payload));
}

// ─── control channel ─────────────────────────────────────────────────────────────────────────

const control = createServer(async (nodeReq, nodeRes) => {
  const url = new URL(nodeReq.url, 'http://127.0.0.1');
  const route = url.pathname.replace(/^\/__test/, '');

  nodeRes.setHeader('Access-Control-Allow-Origin', '*');
  if (nodeReq.method === 'OPTIONS') {
    nodeRes.writeHead(204);
    nodeRes.end();
    return;
  }

  try {
    if (route === '/reset') {
      kv.reset();
      resend.mode = 'ok';
      resend.messages.length = 0;
      resend.calls.length = 0;
      resend.release();
      server.requests.length = 0;
      return send(nodeRes, 200, { ok: true });
    }

    if (route === '/resend') {
      const body = await readJson(nodeReq);
      resend.mode = body.mode || 'ok';
      if (resend.mode !== 'hang') resend.release();
      return send(nodeRes, 200, { ok: true, mode: resend.mode, messages: resend.messages.length });
    }

    if (route === '/kv-fail') {
      const body = await readJson(nodeReq);
      // 'transport' rejects the fetch; 'envelope' returns HTTP 200 with a command-level error.
      kv.failWith = body.mode === 'transport' ? new Error('fake kv transport failure') : null;
      kv.failEnvelope = body.mode === 'envelope';
      return send(nodeRes, 200, { ok: true, mode: body.mode || 'none' });
    }

    if (route === '/state') {
      const resultId = url.searchParams.get('resultId');
      return send(nodeRes, 200, {
        kvCommands: kv.commands.map((command) => command[0]),
        kvKeys: [...kv.map.keys()],
        resendMessages: resend.messages,
        resendCalls: resend.calls.length,
        record: resultId ? kvGetRecord(kv, resultId) : null,
        emailState: resultId ? kvGetEmailState(kv, resultId) : null
      });
    }

    if (route === '/requests') {
      return send(nodeRes, 200, { requests: server.requests });
    }

    return send(nodeRes, 404, { error: 'unknown control route: ' + route });
  } catch (error) {
    return send(nodeRes, 500, { error: String(error && error.message) });
  }
});

await new Promise((resolve) => control.listen(requestedPort, '127.0.0.1', resolve));
const { port: controlPort } = control.address();

// The site and the control channel are separate listeners: the app lives on `server.url`, while
// `__test/*` lives on the control port. Reporting only one of them would strand a driver.
const sitePort = Number(new URL(server.url).port);
process.stdout.write(
  JSON.stringify({
    url: server.url,
    port: sitePort,
    control: `http://127.0.0.1:${controlPort}`,
    controlPort
  }) + '\n'
);

const shutdown = async () => {
  await server.close();
  await new Promise((resolve) => control.close(resolve));
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
