import { Resend } from 'resend';

function parseJsonBody(req: any) {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitRecipients(value: unknown) {
  return String(value ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

function normalizeInterests(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

async function sendContactEnquiry(params: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  interests: string[];
  source: string;
  message: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  const recipients = splitRecipients(process.env.CONTACT_TO_EMAIL);
  if (!recipients.length) {
    throw new Error('CONTACT_TO_EMAIL is not configured');
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject = `New TFP Enquiry - ${params.firstName} ${params.lastName}`.trim();
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1C1C1E; max-width: 640px;">
      <h2 style="color:#710101;">The Full Picture Enquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(`${params.firstName} ${params.lastName}`)}</p>
      <p><strong>Email:</strong> ${escapeHtml(params.email)}</p>
      <p><strong>Phone / WhatsApp:</strong> ${escapeHtml(params.phone || 'Not provided')}</p>
      <p><strong>Interests:</strong> ${escapeHtml(params.interests.join(', ') || 'Not specified')}</p>
      <p><strong>Source:</strong> ${escapeHtml(params.source || 'Not provided')}</p>
      <div style="background:#F5F5F2;padding:16px;border-radius:8px;margin-top:16px;">
        <p style="margin:0 0 10px 0;"><strong>Message</strong></p>
        <p style="white-space:pre-wrap;margin:0;">${escapeHtml(params.message)}</p>
      </div>
    </div>
  `;

  const text = [
    'The Full Picture Enquiry',
    `Name: ${params.firstName} ${params.lastName}`,
    `Email: ${params.email}`,
    `Phone / WhatsApp: ${params.phone || 'Not provided'}`,
    `Interests: ${params.interests.join(', ') || 'Not specified'}`,
    `Source: ${params.source || 'Not provided'}`,
    '',
    'Message:',
    params.message,
  ].join('\n');

  const { data, error } = await resend.emails.send({
    from: `The Full Picture <${process.env.SENDER_EMAIL || 'hello@contact.thefullpicture.asia'}>`,
    to: recipients,
    replyTo: params.email,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send enquiry');
  }

  return { notified: true, data };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = parseJsonBody(req);
    const honeypot = String(body._honey || body.honeypot || '').trim();
    if (honeypot) {
      return res.status(200).json({ success: true, skipped: true });
    }

    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const source = String(body.source || '').trim();
    const message = String(body.message || '').trim();
    const interests = normalizeInterests(body.interests || body.interest);

    if (!firstName || !lastName || !email || !message || !interests.length) {
      return res.status(400).json({ error: 'Missing required contact fields' });
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

    return res.status(200).json({ success: true, lead });
  } catch (error: any) {
    const message = error?.message || 'Failed to send contact enquiry';
    return res.status(500).json({ error: message });
  }
}
