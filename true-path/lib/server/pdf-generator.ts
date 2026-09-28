/**
 * True Path — PDF rendering (platform layer).
 *
 * The layout and the render pipeline live in `true-path/lib/report-pdf.js`, which is pure and
 * testable. This file supplies only what a pure module cannot have: the pdfmake instance and where
 * the CJK font lives in the deployment bundle. Because the PDF and the on-screen report are built
 * from the SAME model, the SAME SVG and the SAME copy, they cannot drift apart (Brief 8 / 17).
 */

import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfmake = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Svg = require('../../assets/true-path-svg.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReportPdf = require('../report-pdf.js');

/**
 * The font path pdfmake loads. `vercel.json` already globs `fonts/**` into `api/**\/*.ts`, so the
 * file ships with the function. Brief 17 requires Chinese to render, and the report prints
 * 才 / 道 / 位 / 帅 / 将 / 相.
 */
export const FONT_PATH = path.join(process.cwd(), 'fonts', 'NotoSansSC.ttf');

/** Render a report model to a PDF buffer. */
export function renderTruePathPdf(model: any): Promise<Buffer> {
  return ReportPdf.renderReportPdf(model, { Svg }, { pdfmake, fontPath: FONT_PATH });
}
