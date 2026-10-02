// @ts-check
/**
 * True Path — load the REAL TypeScript API handlers under `node --test`.
 *
 * The report route is where the contract lives, so the contract tests must exercise the actual
 * handler rather than a re-implementation of it. Node 22 can only execute the handlers as
 * CommonJS, so this registers a small module hook that transpiles any `.ts` file in memory with
 * the already-installed TypeScript compiler and lets extensionless imports resolve to `.ts`.
 *
 * Nothing here is a test-time substitute for production behaviour: the same source file, the
 * same dependencies. Only the TRANSPORT differs (a fake `req`/`res` pair instead of an HTTP
 * server) and the downstream services (Upstash, Resend) are stubbed by the caller.
 */
const fs = require('fs');
const { registerHooks } = require('node:module');
const { fileURLToPath } = require('node:url');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const ts = require(path.join(repoRoot, 'node_modules', 'typescript'));

/** @type {Map<string, string>} */
const transpiled = new Map();

/** @param {string} filename */
function transpile(filename) {
  const cached = transpiled.get(filename);
  if (cached) return cached;

  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      sourceMap: false,
    },
    fileName: filename,
  }).outputText;

  transpiled.set(filename, output);
  return output;
}

let registered = false;

/** Install the hook once per process. Safe to call repeatedly. */
function registerTsSupport() {
  if (registered) return;
  registered = true;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      // The handlers import each other without extensions (`./store`, `../true-path/lib/server/store`).
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/i.test(specifier)) {
        try {
          return nextResolve(specifier + '.ts', context);
        } catch (error) {
          /* fall through to the default resolution */
        }
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url.startsWith('file:') && url.endsWith('.ts')) {
        return {
          format: 'commonjs',
          source: transpile(fileURLToPath(url)),
          shortCircuit: true,
        };
      }
      return nextLoad(url, context);
    },
  });
}

module.exports = { registerTsSupport, repoRoot };
