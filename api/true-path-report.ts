/**
 * True Path — report API.
 *
 * One route serves the whole report lifecycle, because everything the report needs is keyed by
 * the same resultId (Brief 12 / 13):
 *
 *   POST { record }                → persist the Section 13 record, returns { stored, resultId }
 *   POST { resultId, email, ... }  → capture the lead, email the 3-page PDF, notify the team
 *   GET  ?id=<resultId>            → load a persisted record, returns { record }
 *
 * The report itself never depends on this route: the page renders from sessionStorage or from a
 * self-contained `?r=` payload, and this route upgrades that to a short link and an email. With
 * no KV configured the page degrades to the payload link instead of breaking (Brief 21 default).
 */

import { Resend } from 'resend';
import {
  StoreNotConfiguredError,
  isStoreConfigured,
  isValidResultId,
  loadResult,
  saveLead,
  saveResult,
  saveResultOnce,
  claimEmailSend,
  releaseEmailSend
} from './true-path-store';
import { buildModel, decodePayload, ReportModel } from './true-path-model';
import { renderTruePathPdf } from './true-path-pdf-generator';

const MAX_BODY_BYTES = 200 * 1024;

const C = {
  crimson: '#710101',
  gold: '#C6A96B',
  textDark: '#1C1C1E',
  textMed: '#555555',
  textLight: '#888580',
  panel: '#F5F5F2'
};

/**
 * A one-line role summary for the email body, e.g. "Commander 帅才 21% · General 将才 21% · Chancellor 相才 58%".
 *
 * Deliberately plain text: email clients strip inline SVG, so the visual triangle lives in the
 * attached PDF and the email states the same numbers in words.
 */
function roleSummary(record: any, iron: any): string {
  const shares = (record && record.ironTriangle && record.ironTriangle.share) || {};
  const roles = (iron && iron.roles) || [];
  const total = roles.reduce((sum, role) => sum + (Number(shares[role.key]) || 0), 0) || 1;

  return roles
    .map((role) => {
      const share = Math.round(((Number(shares[role.key]) || 0) / total) * 100);
      return role.name + ' ' + role.chinese + ' ' + share + '%';
    })
    .join(' \u00b7 ');
}

/** Inline SVG for the email body: a compact three-role share bar, no external asset needed. */
function shareBarSvg(record: any): string {
  const shares = (record && record.ironTriangle && record.ironTriangle.share) || {};
  const colors: Record<string, string> = {
    commander: '#710101',
    general: '#C6A96B',
    chancellor: '#6b6b6b'
  };
  const order = ['commander', 'general', 'chancellor'];
  const total = order.reduce((sum, key) => sum + (Number(shares[key]) || 0), 0) || 1;
  let x = 0;

  const rects = order
    .map((key) => {
      const width = Math.round(((Number(shares[key]) || 0) / total) * 300);
      const rect =
        '<rect x="' + x + '" y="0" width="' + width + '" height="10" fill="' + colors[key] + '" />';
      x += width;
      return rect;
    })
    .join('');

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="10" role="img" ' +
    'aria-label="Iron Triangle role share">' +
    rects +
    '</svg>'
  );
}
function parseJsonBody(req: any): Record<string, any> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(value: unknown): boolean {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getSender(): string {
  const senderEmail = process.env.SENDER_EMAIL || 'hello@contact.thefullpicture.asia';
  return `The Full Picture <${senderEmail}>`;
}

function splitRecipients(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

/** The report email body — same brand frame as the existing site emails. */
function buildEmailHtml(params: {
  firstName: string | null;
  reportUrl: string;
  title: string | null;
  archetype: string | null;
  role: string | null;
}): string {
  const greeting = params.firstName ? `Hello ${escapeHtml(params.firstName)},` : 'Hello,';
  const hasSummary = Boolean(params.title || params.archetype || params.role);

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:${C.textDark};">
      <div style="text-align:center;margin-bottom:20px;">
        <h2 style="color:${C.crimson};margin-bottom:4px;">The Full Picture</h2>
        <p style="font-size:1.05rem;margin:0;color:${C.textMed};">Your 3-Page True Path Report</p>
      </div>

      <p>${greeting}</p>
      <p>Thank you for completing the True Path analysis. <strong>Your 3-page report is attached as a PDF.</strong></p>

      ${
        hasSummary
          ? `<div style="background-color:${C.panel};padding:16px;border-radius:8px;margin:20px 0;">
               ${params.title ? `<p style="font-size:1.35rem;font-weight:bold;margin:0 0 6px;">${escapeHtml(params.title)}</p>` : ''}
               ${params.archetype ? `<p style="margin:0;color:${C.textMed};"><strong>Archetype:</strong> ${escapeHtml(params.archetype)}</p>` : ''}
               ${params.role ? `<p style="margin:4px 0 0;color:${C.textMed};"><strong>Primary role:</strong> ${escapeHtml(params.role)}</p>` : ''}
             </div>`
          : ''
      }

      <p>You can also read it online at any time:</p>
      <p><a href="${escapeHtml(params.reportUrl)}" style="color:${C.crimson};">View your report online</a></p>

      <p>If you would like to go deeper, a one-hour Metaphysics Strategic Consultation combines your True Path results with modern strategy and ancient wisdom.</p>

      <div style="margin-top:30px;text-align:center;">
        <a href="https://thefullpicture.asia/contact" style="display:inline-block;background-color:${C.crimson};color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Book a Consultation</a>
      </div>

      <p style="margin-top:36px;font-size:0.78rem;color:${C.textLight};text-align:center;">
        This is a reflective self-discovery tool, not a psychological or career assessment.<br />
        &copy; ${new Date().getFullYear()} The Full Picture LLP. All rights reserved.
      </p>
    </div>
  `;
}

/** Internal lead notification, so a real enquiry is never silently missed. */
async function notifyTeam(params: {
  resultId: string;
  firstName: string | null;
  email: string;
  marketingConsent: boolean;
  title: string | null;
  role: string | null;
}): Promise<void> {
  const recipients = splitRecipients(process.env.LEAD_NOTIFY_EMAIL || process.env.CONTACT_TO_EMAIL);
  if (!recipients.length || !process.env.RESEND_API_KEY) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: getSender(),
    to: recipients,
    replyTo: params.email,
    subject: 'New True Path report request',
    text: [
      'New True Path report request',
      '',
      `Name: ${params.firstName || 'Not provided'}`,
      `Email: ${params.email}`,
      `True Path title: ${params.title || 'Unknown'}`,
      `Primary role: ${params.role || 'Unknown'}`,
      `Result id: ${params.resultId}`,
      `Marketing consent: ${params.marketingConsent ? 'yes' : 'no'}`,
      `Time: ${new Date().toISOString()}`
    ].join('\n')
  });
}

/**
 * Post the record to the configured CRM webhook (Brief 9 / 20.6). Best-effort by design: a CRM
 * outage must never cost the visitor their report.
 */
function postToWebhook(record: Record<string, unknown>, lead: Record<string, unknown>): void {
  const url = process.env.CRM_WEBHOOK_URL || process.env.TRUE_PATH_WEBHOOK_URL;
  if (!url) return;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record, lead })
  }).catch(() => {
    /* webhook failures are not the visitor's problem */
  });
}

function summarize(record: any) {
  return {
    title: record && record.truePath ? record.truePath.title || null : null,
    role: null
  };
}

/** POST with a full record: persist it and return the short-link id. */
async function handleRecord(body: any, res: any) {
  const record = body.record;

  if (!ReportModel) {
    return res.status(500).json({ error: 'Report model unavailable' });
  }

  if (!record || !isValidResultId(record.resultId)) {
    return res.status(400).json({ error: 'A record with a valid resultId is required' });
  }

  if (!isStoreConfigured()) {
    // Fail closed. Without a store we cannot persist or deduplicate, so refuse loudly rather
    // than returning a success-shaped 200. The page still has its self-contained payload link.
    return res.status(503).json({
      stored: false,
      resultId: record.resultId,
      reason: 'storage_not_configured',
      error: 'Report storage is not configured.'
    });
  }

  try {
    const stored = await saveResultOnce(record);
    // Persisting is not a lead: the visitor has not given us an email yet (Brief 9).
    return res.status(200).json({ stored, resultId: record.resultId });
  } catch (error: any) {
    console.error('[true-path] store failure:', error);
    return res.status(503).json({
      stored: false,
      resultId: record.resultId,
      reason: 'store_unavailable',
      error: 'Report storage is unavailable right now.'
    });
  }
}

/** POST with lead details: capture consent separately, then email the PDF. */
async function handleLead(body: any, res: any) {
  const resultId = body.resultId;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const firstName = typeof body.firstName === 'string' && body.firstName.trim() ? body.firstName.trim() : null;
  const marketingConsent = Boolean(body.marketingConsent);
  // Report delivery is what the visitor asked for by submitting the form (Brief 9).
  const reportConsent = body.reportConsent !== false;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (!isValidResultId(resultId)) {
    return res.status(400).json({ error: 'A valid resultId is required' });
  }

  // Prefer the record the page sent (works with no store); fall back to the persisted one.
  let record = decodePayload(body.payload);
  if (!record) record = await loadResult(resultId);
  if (!record) {
    return res.status(409).json({
      error: 'That report is no longer available. Please retake the journey.'
    });
  }

  const lead = { firstName, email, reportConsent, marketingConsent, submittedAt: new Date().toISOString() };

  if (isStoreConfigured()) {
    try {
      await saveLead(resultId, lead);
    } catch (error) {
      console.error('[true-path] lead store failure:', error);
    }
  }

  postToWebhook(record, lead);

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email is not configured right now.' });
  }

  // Idempotency (Brief 17): a double-click or retry sends exactly one email. Any failure to
  // check is a 503 — it must never be read as "send it anyway", and `false` means duplicate.
  let claimed: boolean;
  try {
    claimed = await claimEmailSend(resultId);
  } catch (error) {
    if (error instanceof StoreNotConfiguredError) {
      return res.status(503).json({
        reason: 'storage_not_configured',
        error: 'Email delivery is not configured right now.'
      });
    }
    console.error('[true-path] claim failure:', error);
    return res.status(503).json({
      reason: 'store_unavailable',
      error: 'Email delivery is unavailable right now.'
    });
  }
  if (!claimed) {
    return res.status(200).json({ sent: false, duplicate: true });
  }

  const model = buildModel(record);
  if (!model) {
    await releaseEmailSend(resultId);
    return res.status(500).json({ error: 'Could not render that report' });
  }

  const payload = typeof body.payload === 'string' && body.payload ? body.payload : null;
  const reportUrl = payload
    ? `https://thefullpicture.asia/true-path/report?r=${encodeURIComponent(payload)}`
    : `https://thefullpicture.asia/true-path/report?id=${encodeURIComponent(resultId)}`;

  const primaryRole = model.pages[2].blocks.find((block: any) => block && block.kind === 'role-card');
  const summary = summarize(record);
  const archetypeBlock = model.pages[0].blocks.find((block: any) => block && block.kind === 'pair');

  try {
    const pdf = await renderTruePathPdf(model);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: getSender(),
      to: [email],
      subject: 'Your 3-Page True Path Report',
      html: buildEmailHtml({
        firstName,
        reportUrl,
        title: summary.title,
        archetype: archetypeBlock && archetypeBlock.archetype ? archetypeBlock.archetype.name : null,
        role: primaryRole ? primaryRole.name + ' ' + primaryRole.chinese : null
      }),
      attachments: [
        { filename: 'True-Path-Report.pdf', content: pdf.toString('base64') }
      ]
    });

    if (error) {
      await releaseEmailSend(resultId);
      console.error('[true-path] resend error:', error);
      return res.status(502).json({ error: 'Could not send that email right now.' });
    }
  } catch (error: any) {
    await releaseEmailSend(resultId);
    console.error('[true-path] report email failure:', error);
    return res.status(500).json({ error: 'Could not send that email right now.' });
  }

  try {
    await notifyTeam({
      resultId,
      firstName,
      email,
      marketingConsent,
      title: summary.title,
      role: primaryRole ? primaryRole.name : null
    });
  } catch (error) {
    console.error('[true-path] team notification failure:', error);
  }

  return res.status(200).json({ sent: true, resultId });
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const id = req.query && req.query.id;
    if (!isValidResultId(id)) {
      return res.status(400).json({ error: 'A valid id is required' });
    }
    if (!isStoreConfigured()) {
      return res.status(503).json({ error: 'Report lookup is not configured' });
    }

    try {
      const record = await loadResult(id);
      if (!record) return res.status(404).json({ error: 'Report not found' });
      return res.status(200).json({ record });
    } catch (error) {
      console.error('[true-path] lookup failure:', error);
      return res.status(503).json({ error: 'Report lookup is unavailable' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body: any;
  try {
    body = parseJsonBody(req);
  } catch (error) {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  try {
    if (JSON.stringify(body).length > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Payload too large' });
    }
  } catch (error) {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  // Distinguished by shape: a record carries `record`, a lead carries `email`.
  if (body && body.record) return handleRecord(body, res);
  if (body && body.email) return handleLead(body, res);

  return res.status(400).json({ error: 'Unrecognised request body' });
}
