/**
 * True Path — static link validation.
 *
 * Every page in this repo links to five or six other pages through plain `href`s, and nothing
 * checks that those targets exist. That is how `/privacy` shipped as a dead link from eleven
 * places: the CTA config and the report page both point at it, and the site is small enough that
 * nobody clicks every link before release.
 *
 * This walks the real HTML, collects same-origin page links, and asserts each one resolves to a
 * file this deployment would actually serve. It deliberately ignores:
 *
 *   - external links (`https:`, `mailto:`, `tel:`), which are other people's uptime
 *   - pure fragment links (`#main`), which never leave the page
 *   - links to the API (`/api/*`), which are functions rather than files
 *
 * `cleanUrls` is on, so `/about` is served from `about.html`; the resolver mirrors that.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

/** Every HTML entry point the deployment serves, found by walking rather than by a list. */
function htmlFiles(dir = repoRoot, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Skip anything that is not part of the site: dependencies, build output, agent state.
    if (['node_modules', '.git', '.vercel', '.reasonix', 'scratch'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, found);
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

/**
 * Resolve a site-root-relative path the way Vercel serves it, honouring `cleanUrls`.
 * Returns the file that would be served, or null.
 */
function resolveSitePath(sitePath) {
  const clean = decodeURIComponent(sitePath.split('?')[0].split('#')[0]);
  if (!clean.startsWith('/')) return null;

  const base = path.join(repoRoot, clean);
  const candidates = [
    base,
    `${base}.html`,
    path.join(base, 'index.html')
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Extract same-origin, page-level hrefs from a document. */
function pageLinks(html) {
  const found = new Set();
  const pattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href) continue;
    if (href.startsWith('#')) continue;
    if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) continue;
    found.add(href);
  }
  return [...found];
}

const pages = htmlFiles();

test('the site has pages to validate', () => {
  assert.ok(pages.length > 0, 'no HTML pages were found — the walker is broken');
});

test('every internal page link resolves to a servable file', () => {
  const broken = [];

  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const relativePage = path.relative(repoRoot, page).replace(/\\/g, '/');

    for (const href of pageLinks(html)) {
      // API routes are functions, not files.
      if (href.startsWith('/api/')) continue;

      // Directory-relative links (rare here) are resolved against the page's own directory.
      const sitePath = href.startsWith('/')
        ? href
        : '/' + path.posix.join(path.posix.dirname(relativePage), href);

      if (!resolveSitePath(sitePath)) {
        broken.push(`${relativePage} -> ${href}`);
      }
    }
  }

  assert.deepEqual(
    broken,
    [],
    `these links point at files that do not exist and would 404:\n  ${broken.join('\n  ')}`
  );
});

test('the privacy URL in the canonical config resolves', () => {
  // Called out separately because this is the link that was dead: it lives in config rather than
  // in markup, so a page-only scan would not have caught it. The canonical document carries it as
  // `integration.privacyUrl`, and `lib/config.js` projects it to `cta.report.privacyHref` — assert
  // on the projected value, since that is what the report page actually renders.
  const canonical = JSON.parse(
    readFileSync(path.join(repoRoot, 'true-path', 'config', 'true-path.config.json'), 'utf8')
  );
  const Config = createRequire(import.meta.url)(path.join(repoRoot, 'true-path', 'lib', 'config.js'));
  const bundle = Config.build(canonical);

  const href = bundle.cta && bundle.cta.report && bundle.cta.report.privacyHref;
  assert.ok(typeof href === 'string' && href.length > 0, 'cta.report.privacyHref must be set');
  assert.ok(
    resolveSitePath(href),
    `cta.report.privacyHref "${href}" does not resolve to a servable file`
  );
});

test('the report page link the server returns resolves', () => {
  // The handler answers `{ reportUrl: '/true-path/report/<id>' }`. With `cleanUrls` and only a
  // filesystem handle, that path is not a file — it needs the rewrite in vercel.json, so assert
  // the rewrite is present rather than that the file exists.
  const vercel = JSON.parse(readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  const rewrites = vercel.rewrites || [];

  const reportRewrite = rewrites.find((rule) => String(rule.source).startsWith('/true-path/report/:'));
  assert.ok(
    reportRewrite,
    'vercel.json must rewrite /true-path/report/:id to the report page, or every emailed report link 404s'
  );
  assert.ok(
    resolveSitePath(String(reportRewrite.destination || reportRewrite.dest || '')),
    'the report rewrite destination must resolve to a file that exists'
  );

  // Only the report route may be rewritten in this change. The rest of the site is served by the
  // filesystem handle, and a broader rewrite would silently shadow real files.
  assert.deepEqual(
    rewrites.map((rule) => rule.source),
    ['/true-path/report/:id'],
    'this change should add exactly one rewrite; anything more needs review'
  );
});

// ─── deployment exclusions ───────────────────────────────────────────────────────────────────

/**
 * `.vercelignore` decides what the static output contains, and with no framework and no build
 * command Vercel copies this directory almost verbatim. Two failures matter more than the rest:
 * a developer file published at its own path, and a module excluded that a function needs at
 * build time (which breaks the deployment rather than merely hiding something).
 */
test('.vercelignore keeps developer state out of the published output', () => {
  const ignore = readFileSync(path.join(repoRoot, '.vercelignore'), 'utf8');
  const patterns = ignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  for (const required of ['AGENTS.md', 'tests/', 'scratch/', '.reasonix/', 'NewThings/']) {
    assert.ok(
      patterns.includes(required),
      `${required} must be excluded, or it is published verbatim at /${required}`
    );
  }
});

test('.vercelignore never excludes a module the API functions import', () => {
  const ignore = readFileSync(path.join(repoRoot, '.vercelignore'), 'utf8');
  const patterns = ignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  // The functions are bundled from these sources; excluding any of them breaks the build rather
  // than hiding a file. `node_modules` is deliberately NOT excluded — Vercel handles it.
  for (const critical of ['api/', 'lib/', 'true-path/lib/', 'true-path/config/', 'fonts/']) {
    assert.ok(
      !patterns.includes(critical) && !patterns.includes(critical.replace(/\/$/, '')),
      `${critical} must not be excluded: the serverless functions import it`
    );
  }
});
