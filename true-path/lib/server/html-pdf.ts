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
  const invite = model.pages
    .flatMap((page: any) => page.blocks)
    .find((block: any) => block && block.kind === 'invite');
  const qrDataUrl = invite && invite.qr && invite.qr.dataUrl ? invite.qr.dataUrl : undefined;
  return ReportHtml.buildReportHtml(model, meta, { qrDataUrl });
}

/**
 * Print the report HTML to PDF. `deps.executablePath` lets a caller supply a system Chromium
 * (local development); in production the bundled @sparticuz/chromium is used.
 */
export async function renderTruePathHtmlPdf(model: any, deps?: { executablePath?: string }): Promise<Buffer> {
  // Both browser packages are ESM-only; load them with dynamic imports from CJS.
  const puppeteerModule: any = await import('puppeteer-core');
  const puppeteer: any = puppeteerModule.default || puppeteerModule;
  const chromiumModule: any = await import('@sparticuz/chromium');
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
    const pdf: Buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });
    await page.close();
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
