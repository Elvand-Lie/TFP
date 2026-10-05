/**
 * True Path — report API.
 *
 * One route serves the whole report lifecycle, because everything the report needs is keyed by
 * the same resultId (Brief 12 / 13):
 *
 *   POST { record, idempotencyKey }   → validate + recompute, persist, return { stored, resultId, record, reportUrl }
 *   POST { resultId, email, ... }     → capture the lead, email the 4-page PDF, notify the team
 *   GET  ?id=<resultId>               → load a persisted record, returns { record } with lead redacted
 *
 * The report itself never depends on this route: the page renders from sessionStorage or from a
 * self-contained `?r=` payload, and this route upgrades that to a short link and an email. With
 * no KV configured the page degrades to the payload link instead of breaking (Brief 21 default).
 *
 * Two rules shape the write paths:
 *   - The client's numbers are NOT trusted. `recomputeRecord` reads only whitelisted raw answers
 *     and rebuilds every score, share, title and alignment server-side.
 *   - A failure never returns a success shape. An unconfigured or unreachable store is a 503, and
 *     an in-flight email send is a 409 — never a 2xx the page would render as "sent".
 */

import { Resend } from 'resend';
import {
  StoreNotConfiguredError,
  isStoreConfigured,
  isValidResultId,
  newResultId,
  loadResult,
  saveLead,
  claimSaveRequest,
  claimEmailSend,
  markEmailSent,
  loadEmailAcceptance,
  saveEmailAcceptance,
  releaseEmailSend
} from '../true-path/lib/server/store';
import {
  buildModel,
  recomputeRecord,
  redactRecordForPublic,
  reportConfigs
} from '../true-path/lib/server/model';
import { renderTruePathPdf } from '../true-path/lib/server/pdf-generator';

const MAX_BODY_BYTES = 200 * 1024;

/** An idempotency key is a UUID minted by the browser per save attempt. */
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const C = {
  crimson: '#710101',
  gold: '#C6A96B',
  textDark: '#1C1C1E',
  textMed: '#555555',
  textLight: '#888580',
  panel: '#F5F5F2'
};

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

/** The approved consultation destination, plus the privacy notice, from consolidated config. */
function consultHref(): string {
  try {
    const cta = reportConfigs().cta;
    return (cta && cta.result && cta.result.consultHref) || 'https://wa.me/6588257687';
  } catch {
    return 'https://wa.me/6588257687';
  }
}

function privacyHref(): string {
  try {
    const cta = reportConfigs().cta;
    return (cta && cta.report && cta.report.privacyHref) || '/privacy';
  } catch {
    return '/privacy';
  }
}

/**
 * The Resend idempotency key: deterministic per (report, recipient), so a retried attempt after a
 * timeout is deduplicated by the provider, while the same report going to a different address
 * gets a DIFFERENT key rather than being suppressed as a duplicate.
 */
function providerIdempotencyKey(resultId: string, email: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as { createHash(algo: string): any };
  const recipientHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
  return `tfp-report/${resultId}/${recipientHash}`;
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
      <p>Thank you for completing the True Path analysis. <strong>Your 4-page report is attached as a PDF.</strong></p>

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
        <a href="${escapeHtml(consultHref())}" style="display:inline-block;background-color:${C.crimson};color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Book a Consultation</a>
      </div>

      <p style="margin-top:36px;font-size:0.78rem;color:${C.textLight};text-align:center;">
        This is a reflective self-discovery tool, not a psychological or career assessment.<br />
        <a href="${escapeHtml(privacyHref())}" style="color:${C.textLight};">How we handle your data</a><br />
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
 * Post the record to the configured CRM webhook (Brief 9 / 20.6).
 *
 * Awaited with a bounded timeout so the real delivery is attempted before the response is sent,
 * but a slow or dead endpoint still cannot hold the visitor's request open. Failures are
 * swallowed on purpose: a CRM outage must never cost the visitor their report.
 */
async function postToWebhook(record: Record<string, unknown>, lead: Record<string, unknown>): Promise<void> {
  const url = process.env.CRM_WEBHOOK_URL || process.env.TRUE_PATH_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record, lead }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (error) {
    /* webhook failures are not the visitor's problem */
  }
}

/** The one piece of the record the notification email needs, resolved once. */
function reportTitle(record: any): string | null {
  return record && record.truePath ? record.truePath.title || null : null;
}

/**
 * POST with a raw journey record: validate, recompute, persist.
 *
 * The body is `{ record, idempotencyKey }`. Only whitelisted raw answers survive validation;
 * the id, timestamp and every computed value are produced here.
 */
async function handleRecord(body: any, res: any) {
  const record = body.record;
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return res.status(400).json({ error: 'A record is required', reason: 'record_required' });
  }
  if (!UUID_PATTERN.test(idempotencyKey)) {
    return res.status(400).json({
      error: 'A UUID idempotencyKey is required',
      reason: 'idempotency_key_required'
    });
  }

  // Validate BEFORE touching the store, so a bad payload is a 400 whatever the environment.
  const resultId = newResultId();
  const recomputed = recomputeRecord(record, {
    requireFullJourney: true,
    resultId,
    createdAt: new Date().toISOString()
  });

  // `in` rather than a truthiness check: `ok` widens to `boolean` under this repo's non-strict
  // tsconfig, which defeats discriminated-union narrowing.
  if ('issues' in recomputed) {
    return res.status(400).json({
      error: 'That journey record is not valid',
      reason: 'invalid_record',
      issues: recomputed.issues
    });
  }

  if (!isStoreConfigured()) {
    // Fail closed. Without a store we cannot persist or deduplicate, so refuse loudly rather
    // than returning a success-shaped 200. The page still has its self-contained payload link.
    return res.status(503).json({
      stored: false,
      resultId: null,
      reason: 'storage_not_configured',
      error: 'Report storage is not configured.'
    });
  }

  let claim;
  try {
    claim = await claimSaveRequest({
      requestKey: idempotencyKey,
      fingerprint: recomputed.fingerprint,
      resultId,
      record: recomputed.record
    });
  } catch (error: any) {
    if (error instanceof StoreNotConfiguredError) {
      return res.status(503).json({
        stored: false,
        resultId: null,
        reason: 'storage_not_configured',
        error: 'Report storage is not configured.'
      });
    }
    console.error('[true-path] store failure:', error);
    return res.status(503).json({
      stored: false,
      resultId: null,
      reason: 'store_unavailable',
      error: 'Report storage is unavailable right now.'
    });
  }

  if (claim.status === 'conflict') {
    return res.status(409).json({
      stored: false,
      resultId: null,
      reason: 'idempotency_conflict',
      error: 'That save request was already used for a different journey.'
    });
  }

  if (claim.status === 'missing') {
    // The key maps to a report that is no longer readable. Reporting `stored: true` here would
    // promise the visitor a report that the very next `?id=` lookup could not return.
    return res.status(503).json({
      stored: false,
      resultId: null,
      reason: 'store_unavailable',
      error: 'Report storage is unavailable right now.'
    });
  }

  const resultIdOut = claim.resultId || resultId;

  if (claim.status === 'exists') {
    // A replay must answer with the report that ALREADY exists — not with this request's freshly
    // generated id and timestamp, which were never written and point at nothing.
    let original: Record<string, any> | null = null;
    try {
      original = (await loadResult(resultIdOut)) as Record<string, any> | null;
    } catch (error) {
      console.error('[true-path] replay lookup failure:', error);
    }
    if (!original) {
      return res.status(503).json({
        stored: false,
        resultId: null,
        reason: 'store_unavailable',
        error: 'Report storage is unavailable right now.'
      });
    }

    const publicOriginal = redactRecordForPublic(original) as Record<string, any>;
    return res.status(200).json({
      stored: true,
      duplicate: true,
      resultId: resultIdOut,
      record: publicOriginal,
      reportUrl: '/true-path/report/' + resultIdOut
    });
  }

  // Persisting is not a lead: the visitor has not given us an email yet (Brief 9).
  return res.status(200).json({
    stored: true,
    resultId: resultIdOut,
    record: recomputed.record,
    reportUrl: '/true-path/report/' + resultIdOut
  });
}

/** Retry bookkeeping only; a provider-accepted send must never be released for another send. */
async function finaliseEmail(resultId: string, email: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (await markEmailSent({ resultId, email })) return true;
    } catch (error) {
      console.error('[true-path] claim finalisation failure:', error);
    }
  }
  return false;
}

/** POST with lead details: capture consent separately, then email the PDF. */
async function handleLead(body: any, res: any) {
  const resultId = body.resultId;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required', reason: 'invalid_email' });
  }
  if (!isValidResultId(resultId)) {
    return res.status(400).json({ error: 'A valid resultId is required', reason: 'invalid_result_id' });
  }
  if (!firstName) {
    return res.status(400).json({ error: 'A first name is required', reason: 'name_required' });
  }
  if (firstName.length > 200) {
    return res.status(400).json({ error: 'First name is too long', reason: 'invalid_name' });
  }
  // Report delivery is an explicit, positive consent — an absent flag is not consent (Brief 9).
  if (body.reportConsent !== true) {
    return res.status(400).json({
      error: 'Report delivery consent is required',
      reason: 'report_consent_required'
    });
  }
  const marketingConsent = body.marketingConsent === true;

  if (!isStoreConfigured()) {
    return res.status(503).json({
      reason: 'storage_not_configured',
      error: 'Report delivery is not configured right now.'
    });
  }

  // The STORED record is authoritative: the lead path never renders a client-supplied payload,
  // so a submission cannot be redirected at a report the visitor does not own.
  let record: Record<string, any> | null = null;
  try {
    record = (await loadResult(resultId)) as Record<string, any> | null;
  } catch (error) {
    console.error('[true-path] lead lookup failure:', error);
    return res.status(503).json({
      reason: 'store_unavailable',
      error: 'Report lookup is unavailable right now.'
    });
  }
  if (!record) {
    return res.status(409).json({
      error: 'That report is no longer available. Please retake the journey.',
      reason: 'report_not_found'
    });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email is not configured right now.' });
  }

  const providerKey = providerIdempotencyKey(resultId, email);

  let claim;
  let acceptance;
  try {
    acceptance = await loadEmailAcceptance(resultId);
    if (acceptance && acceptance.email !== email) {
      return res.status(409).json({ sent: false, reason: 'recipient_conflict',
        error: 'That report was already accepted for a different address.' });
    }
    claim = await claimEmailSend({ resultId, email, providerKey });
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

  if (claim.status === 'sent') {
    // A genuine prior delivery to this same address: report it truthfully without resending.
    return res.status(200).json({ sent: true, duplicate: true, resultId });
  }
  if (acceptance && (claim.status === 'pending' || claim.status === 'claimed')) {
    if (await finaliseEmail(resultId, email)) {
      return res.status(200).json({ sent: true, duplicate: true, resultId });
    }
    return res.status(503).json({ sent: false, reason: 'delivery_not_finalised',
      error: 'Email was accepted, but confirmation is unavailable. Please try again later.' });
  }
  if (claim.status === 'pending') {
    // Another attempt is mid-flight. This is NOT a success — the page must not show it as one.
    return res.status(409).json({
      sent: false,
      pending: true,
      reason: 'send_in_progress',
      error: 'That report is already being sent. Please give it a moment.'
    });
  }
  if (claim.status === 'conflict') {
    return res.status(409).json({
      sent: false,
      reason: 'recipient_conflict',
      error: 'That report is already being sent to a different address.'
    });
  }

  // Only NOW, with the send claimed, is the lead recorded. Writing it earlier meant a rejected
  // send (a different recipient, a refused consent) had already overwritten the original
  // visitor's stored name, email and consent on the record.
  const lead = {
    firstName,
    email,
    reportConsent: true,
    marketingConsent,
    submittedAt: new Date().toISOString()
  };

  try {
    await saveLead(resultId, lead);
  } catch (error) {
    // The consent/lead write is part of what the visitor asked for: if it cannot be recorded, no
    // mail is sent, and the claim is given back so the retry is not left blocked by this attempt.
    await releaseEmailSend({ resultId, email });
    console.error('[true-path] lead store failure:', error);
    return res.status(503).json({
      sent: false,
      reason: 'store_unavailable',
      error: 'Could not record your details right now.'
    });
  }

  const model = buildModel(record);
  if (!model) {
    await releaseEmailSend({ resultId, email });
    return res.status(500).json({ error: 'Could not render that report' });
  }

  // The report is reachable by its persistent id; no payload link is needed once it is stored.
  const reportUrl = `https://thefullpicture.asia/true-path/report/${encodeURIComponent(resultId)}`;

  const primaryRole = model.pages[2].blocks.find((block: any) => block && block.kind === 'role-card');
  const summary = { title: reportTitle(record) };
  const archetypeBlock = model.pages[0].blocks.find((block: any) => block && block.kind === 'pair');

  let deliveryId: string | null = null;
  try {
    const pdf = await renderTruePathPdf(model);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const response = await resend.emails.send(
      {
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
      },
      { idempotencyKey: providerKey }
    );

    // Delivery is only accepted on POSITIVE evidence: a provider id. Checking merely for a falsy
    // `error` would read a malformed `{}` or a `{ data: null, error: null }` response as success
    // and finalise the claim as `sent` for a message that was never created.
    deliveryId = response && response.data && typeof response.data.id === 'string'
      ? response.data.id.trim() : null;
    if (response && response.error) {
      await releaseEmailSend({ resultId, email });
      console.error('[true-path] resend error:', response.error);
      return res.status(502).json({ sent: false, error: 'Could not send that email right now.' });
    }
    if (!deliveryId) {
      await releaseEmailSend({ resultId, email });
      console.error('[true-path] resend returned no delivery id:', response);
      return res.status(502).json({ sent: false, error: 'Could not send that email right now.' });
    }
  } catch (error: any) {
    await releaseEmailSend({ resultId, email });
    console.error('[true-path] report email failure:', error);
    return res.status(500).json({ sent: false, error: 'Could not send that email right now.' });
  }

  // Persist positive acceptance separately, so a visitor retry can repair the claim without
  // repeating the send (including after the provider's 24-hour idempotency window).
  try {
    await saveEmailAcceptance(resultId, { email, deliveryId: deliveryId!,
      acceptedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[true-path] acknowledgement store failure:', error);
  }

  if (!await finaliseEmail(resultId, email)) {
    // ponytail: if both acknowledgement and claim writes fail, retain the pending claim;
    // reconcile with the provider rather than risk resending an already accepted message.
    return res.status(503).json({
      sent: false,
      reason: 'delivery_not_finalised',
      error: 'Email was accepted, but confirmation is unavailable. Please try again later.'
    });
  }

  await postToWebhook(record, lead);

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
    // A result link is shareable and carries no session, so it must never be cached by a shared
    // proxy — and never return the captured lead.
    res.setHeader('Cache-Control', 'no-store');

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

      const publicRecord = redactRecordForPublic(record);
      if (!publicRecord) return res.status(404).json({ error: 'Report not found' });

      return res.status(200).json({ record: publicRecord });
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
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Payload too large' });
    }
  } catch (error) {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  // Distinguished by shape: a save carries `record`, a lead carries `email`.
  if (body && body.record) return handleRecord(body, res);
  if (body && body.email) return handleLead(body, res);

  return res.status(400).json({ error: 'Unrecognised request body' });
}
