'use strict';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeLead(body) {
  const email = String(body && body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error('A valid email address is required.');

  const action = String(body && body.action || 'ZWDS profile backup download').trim().slice(0, 120);
  const source = String(body && body.source || 'ZWDS web app').trim().slice(0, 120);
  const profileCountValue = Number(body && body.profileCount);
  const profileCount = Number.isInteger(profileCountValue) && profileCountValue >= 0 && profileCountValue <= 1000
    ? profileCountValue
    : null;

  return {
    email,
    action: action || 'ZWDS profile backup download',
    source: source || 'ZWDS web app',
    profileCount,
    timestamp: new Date().toISOString()
  };
}

function buildNotification(lead, env = process.env) {
  const sender = String(env.SENDER_EMAIL || '').trim();
  const recipient = String(env.LEAD_NOTIFY_EMAIL || '').trim();
  if (!isValidEmail(sender)) throw new Error('SENDER_EMAIL is missing or invalid.');
  if (!isValidEmail(recipient)) throw new Error('LEAD_NOTIFY_EMAIL is missing or invalid.');

  const profileLine = lead.profileCount == null ? '' : `\nProfile count: ${lead.profileCount}`;
  const text = [
    'New ZWDS download lead',
    '',
    `User email: ${lead.email}`,
    `Action: ${lead.action}`,
    `Source: ${lead.source}`,
    ...(lead.profileCount == null ? [] : [`Profile count: ${lead.profileCount}`]),
    `Time: ${lead.timestamp}`
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f1f1f">
      <h2 style="margin:0 0 16px">New ZWDS download lead</h2>
      <p><strong>User email:</strong> ${escapeHtml(lead.email)}</p>
      <p><strong>Action:</strong> ${escapeHtml(lead.action)}</p>
      <p><strong>Source:</strong> ${escapeHtml(lead.source)}</p>
      ${lead.profileCount == null ? '' : `<p><strong>Profile count:</strong> ${lead.profileCount}</p>`}
      <p><strong>Time:</strong> ${escapeHtml(lead.timestamp)}</p>
    </div>`;

  return {
    from: `The Full Picture <${sender}>`,
    to: [recipient],
    subject: 'New ZWDS Download Lead',
    text,
    html
  };
}

async function sendLeadNotification(body, env = process.env, fetchImpl = globalThis.fetch) {
  const lead = normalizeLead(body);
  const email = buildNotification(lead, env);

  if (String(env.RESEND_DRY_RUN || '').toLowerCase() === 'true') {
    return { id: 'dry-run', lead, email, dryRun: true };
  }

  const apiKey = String(env.RESEND_API_KEY || '').trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');
  if (typeof fetchImpl !== 'function') throw new Error('This server requires Node.js 18 or newer.');

  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(email)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result && (result.message || result.error)
      ? String(result.message || result.error)
      : `Resend returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return { id: result.id || null, lead, dryRun: false };
}

module.exports = {
  RESEND_ENDPOINT,
  isValidEmail,
  escapeHtml,
  normalizeLead,
  buildNotification,
  sendLeadNotification
};
