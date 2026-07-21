import { Resend } from 'resend';

function parseJsonBody(req: any): Record<string, unknown> {
  if (!req.body) return {};

  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
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

function splitRecipients(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

function normalizeInterests(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getResendClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  return new Resend(process.env.RESEND_API_KEY);
}

function getSender(): string {
  const senderEmail =
    process.env.SENDER_EMAIL ||
    'hello@contact.thefullpicture.asia';

  return `The Full Picture <${senderEmail}>`;
}

/**
 * Standard contact-page enquiry.
 */
async function sendContactEnquiry(params: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  interests: string[];
  source: string;
  message: string;
}) {
  const recipients = splitRecipients(process.env.CONTACT_TO_EMAIL);

  if (!recipients.length) {
    throw new Error('CONTACT_TO_EMAIL is not configured');
  }

  const resend = getResendClient();

  const fullName = `${params.firstName} ${params.lastName}`.trim();
  const subject = `New TFP Enquiry - ${fullName}`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1C1C1E;max-width:640px;">
      <h2 style="color:#710101;">The Full Picture Enquiry</h2>

      <p>
        <strong>Name:</strong>
        ${escapeHtml(fullName)}
      </p>

      <p>
        <strong>Email:</strong>
        ${escapeHtml(params.email)}
      </p>

      <p>
        <strong>Phone / WhatsApp:</strong>
        ${escapeHtml(params.phone || 'Not provided')}
      </p>

      <p>
        <strong>Interests:</strong>
        ${escapeHtml(params.interests.join(', ') || 'Not specified')}
      </p>

      <p>
        <strong>Source:</strong>
        ${escapeHtml(params.source || 'Not provided')}
      </p>

      <div style="background:#F5F5F2;padding:16px;border-radius:8px;margin-top:16px;">
        <p style="margin:0 0 10px 0;">
          <strong>Message</strong>
        </p>

        <p style="white-space:pre-wrap;margin:0;">
          ${escapeHtml(params.message)}
        </p>
      </div>
    </div>
  `;

  const text = [
    'The Full Picture Enquiry',
    `Name: ${fullName}`,
    `Email: ${params.email}`,
    `Phone / WhatsApp: ${params.phone || 'Not provided'}`,
    `Interests: ${params.interests.join(', ') || 'Not specified'}`,
    `Source: ${params.source || 'Not provided'}`,
    '',
    'Message:',
    params.message,
  ].join('\n');

  const { data, error } = await resend.emails.send({
    from: getSender(),
    to: recipients,
    replyTo: params.email,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send enquiry');
  }

  return {
    notified: true,
    data,
  };
}

/**
 * Notification generated when somebody downloads a ZWDS backup.
 */
async function sendZwdsDownloadLead(params: {
  email: string;
  action: string;
  profileCount: number;
}) {
  const recipients = splitRecipients(
    process.env.LEAD_NOTIFY_EMAIL ||
    process.env.CONTACT_TO_EMAIL,
  );

  if (!recipients.length) {
    throw new Error(
      'LEAD_NOTIFY_EMAIL or CONTACT_TO_EMAIL is not configured',
    );
  }

  const resend = getResendClient();
  const occurredAt = new Date().toISOString();

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1C1C1E;max-width:640px;">
      <h2 style="color:#710101;">New ZWDS Download Lead</h2>

      <p>
        A visitor used the ZWDS backup download function.
      </p>

      <div style="background:#F5F5F2;padding:16px;border-radius:8px;margin-top:16px;">
        <p>
          <strong>User email:</strong>
          ${escapeHtml(params.email)}
        </p>

        <p>
          <strong>Action:</strong>
          ${escapeHtml(params.action)}
        </p>

        <p>
          <strong>Profiles downloaded:</strong>
          ${escapeHtml(params.profileCount)}
        </p>

        <p>
          <strong>Source:</strong>
          ZWDS web application
        </p>

        <p>
          <strong>Time:</strong>
          ${escapeHtml(occurredAt)}
        </p>
      </div>
    </div>
  `;

  const text = [
    'New ZWDS Download Lead',
    '',
    `User email: ${params.email}`,
    `Action: ${params.action}`,
    `Profiles downloaded: ${params.profileCount}`,
    'Source: ZWDS web application',
    `Time: ${occurredAt}`,
  ].join('\n');

  const { data, error } = await resend.emails.send({
    from: getSender(),
    to: recipients,
    replyTo: params.email,
    subject: 'New ZWDS Download Lead',
    html,
    text,
  });

  if (error) {
    throw new Error(
      error.message || 'Failed to send ZWDS lead notification',
    );
  }

  return {
    notified: true,
    data,
  };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');

      return res.status(405).json({
        error: 'Method not allowed',
      });
    }

    const body = parseJsonBody(req);

    const honeypot = String(
      body._honey ||
      body.honeypot ||
      '',
    ).trim();

    if (honeypot) {
      return res.status(200).json({
        success: true,
        skipped: true,
      });
    }

    const requestType = String(body.type || '').trim();

    /*
     * ZWDS download-lead request.
     */
    if (requestType === 'zwds_download_lead') {
      const email = String(body.email || '').trim();

      if (!email || !isValidEmail(email)) {
        return res.status(400).json({
          error: 'A valid email address is required',
        });
      }

      const rawProfileCount = Number(body.profileCount);
      const profileCount =
        Number.isFinite(rawProfileCount) &&
          rawProfileCount >= 0
          ? Math.floor(rawProfileCount)
          : 0;

      const action =
        String(body.action || '').trim() ||
        'ZWDS profile backup download';

      const lead = await sendZwdsDownloadLead({
        email,
        action,
        profileCount,
      });

      return res.status(200).json({
        success: true,
        type: 'zwds_download_lead',
        lead,
      });
    }

    /*
     * Normal contact-form request.
     */
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const source = String(body.source || '').trim();
    const message = String(body.message || '').trim();

    const interests = normalizeInterests(
      body.interests || body.interest,
    );

    if (
      !firstName ||
      !lastName ||
      !email ||
      !isValidEmail(email) ||
      !message ||
      !interests.length
    ) {
      return res.status(400).json({
        error: 'Missing or invalid required contact fields',
      });
    }

    const lead = await sendContactEnquiry({
      firstName,
      lastName,
      email,
      phone,
      interests,
      source,
      message,
    });

    return res.status(200).json({
      success: true,
      type: 'contact_enquiry',
      lead,
    });
  } catch (error: any) {
    console.error('[contact API error]', error);

    const message =
      error?.message ||
      'Failed to process request';

    return res.status(500).json({
      error: message,
    });
  }
}