/**
 * True Path — HTML→PDF rendering (platform layer).
 *
 * The report's source of truth is the reference HTML template (`true-path/lib/report-html.js`):
 * the browser renders it exactly as a webpage and Chromium prints it to PDF. This file supplies
 * only what a pure module cannot have: the headless Chromium binary, the fonts, and the print
 * call. pdfmake (`pdf-generator.ts`) remains as a fallback renderer if the browser cannot start.
 */

import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReportHtml = require('../report-html.js');

// The browser packages are ESM-only and are loaded with a runtime import the bundler cannot
// trace. resolve them statically (never executed) so the deploy's file tracer ships their
// full trees, including transitive dependencies.
try {
  /* eslint-disable @typescript-eslint/no-var-requires */
  require.resolve('puppeteer-core');
  require.resolve('@sparticuz/chromium');
  require.resolve('tar-fs');
  require.resolve('mitt');
  require.resolve('ws');
  require.resolve('devtools-protocol');
  require.resolve('chromium-bidi');
  require.resolve('typed-query-selector');
  /* eslint-enable @typescript-eslint/no-var-requires */
} catch (error) {
  console.error('[true-path] browser package tracing failure:', error);
}

export const FONTS_DIR = path.join(process.cwd(), 'fonts');
export const SANS_FONT = path.join(FONTS_DIR, 'NotoSansSC.ttf');
export const SERIF_FONT = path.join(FONTS_DIR, 'NotoSerifCJKsc-Regular.otf');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function reportDate(iso: any): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!match) return '';
  const day = String(Number(match[3]));
  return day + ' ' + MONTHS[Number(match[2]) - 1] + ' ' + match[1];
}

export function buildReportDocumentHtml(model: any): string {
  const meta = {
    firstName: model.profile && typeof model.profile.firstName === 'string' ? model.profile.firstName : '',
    reportDate: reportDate(model.createdAt),
    resultId: model.resultId || ''
  };
  return ReportHtml.buildReportHtml(model, meta, {});
}

/**
 * Print the report HTML to PDF. `deps.executablePath` lets a caller supply a system Chromium
 * (local development); in production the bundled @sparticuz/chromium is used.
 */
export async function renderTruePathHtmlPdf(model: any, deps?: { executablePath?: string }): Promise<Buffer> {
  // Both browser packages are ESM-only. Vercel's CJS transpile rewrites `await import()` into
  // `require()`, which cannot load them — so route the import through runtime evaluation that
  // the bundler cannot see or rewrite.
  const dynamicImport = new Function('m', 'return import(m)');
  const puppeteerModule: any = await dynamicImport('puppeteer-core');
  const puppeteer: any = puppeteerModule.default || puppeteerModule;
  const chromiumModule: any = await dynamicImport('@sparticuz/chromium');
  const chromium: any = chromiumModule.default || chromiumModule;

  const executablePath = deps && deps.executablePath
    ? deps.executablePath
    : await chromium.executablePath();

  if (!deps || !deps.executablePath) {
    chromium.args.push('--font-render-hinting=none');
  }

  const browser = await puppeteer.launch({
    args: (deps && deps.executablePath)
      ? ['--no-sandbox', '--disable-setuid-sandbox']
      : chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: 'shell' as any,
    ignoreHTTPSErrors: true
  });

  try {
    // Register the CJK faces so 才 / 道 / 相 and every Latin glyph render in the reference's
    // own typography, regardless of what the host has installed.
    if (!deps || !deps.executablePath) {
      try {
        chromium.font(SANS_FONT);
        chromium.font(SERIF_FONT);
      } catch (error) {
        console.error('[true-path] font registration failure:', error);
      }
    }

    const page = await browser.newPage();
    await page.setContent(buildReportDocumentHtml(model), { waitUntil: 'networkidle0', timeout: 30000 });
    const raw: Buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });
    await page.close();
    // Chromium emits /Title from the <title> but never /Author; C14 requires a personalised
    // title and "The Full Picture" as author, with the record's own creation instant.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.load(raw);
    const firstName = model.profile && typeof model.profile.firstName === 'string' ? model.profile.firstName : '';
    doc.setTitle('True Path Report' + (firstName ? ' — ' + firstName : ''));
    doc.setAuthor('The Full Picture');
    doc.setCreator('The Full Picture');
    doc.setSubject('True Path 轨道 — 4-page report');
    if (model.createdAt) {
      const created = new Date(String(model.createdAt));
      if (!isNaN(created.getTime())) {
        doc.setCreationDate(created);
        doc.setModificationDate(created);
      }
    }
    return Buffer.from(await doc.save());
  } finally {
    await browser.close().catch(() => undefined);
  }
}
