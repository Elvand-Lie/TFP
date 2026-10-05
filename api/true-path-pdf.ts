/**
 * True Path — PDF endpoint.
 *
 * Brief 8 / 12 / 17: the report is always viewable online, downloadable as a PDF, and the PDF
 * must match the on-screen report with Chinese characters rendering correctly.
 *
 * Accepts the record either as a self-contained `?r=<base64url>` payload (works with no store)
 * or as `?id=<resultId>` for a persisted report. Unlike the email route this needs no consent
 * and no lead: downloading your own report is not a data capture step (Brief 9).
 */

import { loadResult, isStoreConfigured, isValidResultId } from '../true-path/lib/server/store';
import { buildModel, decodePayload } from '../true-path/lib/server/model';
import { renderTruePathPdf } from '../true-path/lib/server/pdf-generator';
import { renderTruePathHtmlPdf } from '../true-path/lib/server/html-pdf';

function firstValue(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
  return typeof value === 'string' ? value : null;
}

/**
 * v2.2 C14: True-Path-Report-{FirstName}-{YYYY-MM-DD}.pdf. Spaces become hyphens, characters
 * unsafe in file names are stripped, CJK names are kept. Without a stored name the result id
 * keeps the file identifiable.
 */
function pdfFileName(model: any): string {
  const date = String(model.createdAt || '').slice(0, 10) || 'report';
  const rawName =
    model.profile && typeof model.profile.firstName === 'string' ? model.profile.firstName : '';
  const name = rawName.replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40);
  return 'True-Path-Report-' + (name || String(model.resultId || 'report').slice(0, 20)) + '-' + date + '.pdf';
}

/**
 * v2.3: the booking QR code (v2.2 C13) is cancelled. BOOKING_URL remains in config for the
 * normal consultation link system; no QR generation, markup or reserved space remains.
 */

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = req.query || {};

  let record = decodePayload(firstValue(query.r));
  const id = firstValue(query.id);

  if (!record && id) {
    if (!isValidResultId(id)) {
      return res.status(400).json({ error: 'A valid id is required' });
    }
    if (!isStoreConfigured()) {
      return res.status(503).json({ error: 'Report lookup is not configured' });
    }
    try {
      record = await loadResult(id);
    } catch (error) {
      console.error('[true-path] pdf lookup failure:', error);
      return res.status(503).json({ error: 'Report lookup is unavailable' });
    }
  }

  if (!record) {
    return res.status(400).json({
      error: 'A report payload (?r=) or a persisted report id (?id=) is required'
    });
  }

  const model = buildModel(record);
  if (!model) {
    return res.status(422).json({ error: 'That report could not be rendered' });
  }

  try {
    // Primary: the reference HTML printed by headless Chromium — the PDF is the HTML.
    // Fallback: the pdfmake renderer, should the browser be unavailable in the runtime.
    let pdf: Buffer;
    let renderer = 'html';
    try {
      pdf = await renderTruePathHtmlPdf(model);
    } catch (browserError: any) {
      console.error('[true-path] html pdf render failure, falling back to pdfmake:', browserError);
      renderer = 'pdfmake-fallback (' + String(browserError && browserError.message || browserError).slice(0, 160) + ')';
      pdf = await renderTruePathPdf(model);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Report-Renderer', renderer.replace(/[^\x20-\x7E]/g, '?'));
    // RFC 5987: non-ASCII names (e.g. 陈伟) are invalid in a raw header value, so an ASCII
    // fallback rides along with the UTF-8 encoded form.
    const fileName = pdfFileName(model);
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="' + asciiName + '"; filename*=UTF-8\'\'' + encodeURIComponent(fileName)
    );
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    return res.status(200).send(pdf);
  } catch (error: any) {
    // The usual cause is a missing font file, which would otherwise emit tofu boxes.
    console.error('[true-path] pdf render failure:', error);
    return res.status(500).json({
      error: 'Could not generate that PDF right now',
      detail: String(error && error.message || error).slice(0, 300)
    });
  }
}
