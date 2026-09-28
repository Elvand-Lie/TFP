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

// eslint-disable-next-line @typescript-eslint/no-var-requires

function firstValue(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
  return typeof value === 'string' ? value : null;
}

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
    const pdf = await renderTruePathPdf(model);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="True-Path-Report-' + String(model.resultId || 'report') + '.pdf"'
    );
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    return res.status(200).send(pdf);
  } catch (error: any) {
    // The usual cause is a missing font file, which would otherwise emit tofu boxes.
    console.error('[true-path] pdf render failure:', error);
    return res.status(500).json({ error: 'Could not generate that PDF right now' });
  }
}
