import { Resend } from 'resend';
import {
  BirthInput,
  CalendarInput,
  buildDailyAlmanacPayload,
  buildPersonalAlmanacPayload,
} from '../lib/calendar';

function parseJsonBody(req: any) {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

function parseDate(value: unknown, allowDefault = true) {
  if ((!value || (typeof value === 'string' && !value.trim())) && !allowDefault) {
    throw new Error('birth date is required');
  }
  const date = typeof value === 'string' && value.trim() ? value.trim() : new Date().toISOString().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error('date must use YYYY-MM-DD');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error('date is not a valid Gregorian date');
  }
  return { year, month, day };
}

function toNumber(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return {
    hour: Math.max(0, Math.min(23, Number(match[1]))),
    minute: Math.max(0, Math.min(59, Number(match[2]))),
  };
}

function normalizeBirthInput(body: any): BirthInput {
  const source = body.birth || body;
  const explicitDate = source.date || body.birthDate;
  const yearValue = source.year ?? source.birthYear ?? body.birthYear;
  const monthValue = source.month ?? source.birthMonth ?? body.birthMonth;
  const dayValue = source.day ?? source.birthDay ?? body.birthDay;
  const birthDate = explicitDate
    ? parseDate(explicitDate, false)
    : parseDate(
        yearValue && monthValue && dayValue
          ? `${String(yearValue).padStart(4, '0')}-${String(monthValue).padStart(2, '0')}-${String(dayValue).padStart(2, '0')}`
          : '',
        false,
      );
  const parsedTime = parseTime(source.time || body.birthTime);
  return {
    year: toNumber(yearValue, birthDate.year),
    month: toNumber(monthValue, birthDate.month),
    day: toNumber(dayValue, birthDate.day),
    hour: parsedTime?.hour ?? toNumber(source.hour ?? source.birthHour ?? body.birthHour, 12),
    minute: parsedTime?.minute ?? toNumber(source.minute ?? source.birthMinute ?? body.birthMinute, 0),
    second: 0,
    gender: source.gender ?? body.gender,
  };
}

function normalizeSelectedDate(date: unknown): CalendarInput {
  const selected = parseDate(date, true);
  return {
    ...selected,
    hour: 12,
    minute: 0,
    second: 0,
  };
}

function getQueryDate(req: any) {
  const value = req.query?.date;
  return Array.isArray(value) ? value[0] : value;
}

function getEmail(body: any, required = false) {
  const source = body.birth || body;
  const email = String(body.email || source.email || '').trim();
  if (!email) {
    if (required) throw new Error('email is required to unlock personal timing');
    return '';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('email is not valid');
  }
  return email;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLeadRecipients() {
  return String(process.env.LEAD_NOTIFY_EMAIL || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

async function sendLeadNotification(params: {
  email: string;
  name?: string;
  selectedDate: string;
  birth: BirthInput;
  monthlyOptIn?: boolean;
  suppressNotification?: boolean;
  payload: ReturnType<typeof buildPersonalAlmanacPayload>;
}) {
  if (params.suppressNotification) {
    return { notified: false, skippedReason: 'notification_suppressed' };
  }
  if (!params.email) {
    return { notified: false, skippedReason: 'email_missing' };
  }
  if (!process.env.RESEND_API_KEY) {
    return { notified: false, skippedReason: 'resend_api_key_missing' };
  }
  const recipients = getLeadRecipients();
  if (!recipients.length) {
    return { notified: false, skippedReason: 'lead_notify_email_missing' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1C1C1E; max-width: 640px;">
      <h2 style="color:#710101;">Daily Almanac Lead</h2>
      <p><strong>Date selected:</strong> ${escapeHtml(params.selectedDate)}</p>
      <p><strong>Name:</strong> ${escapeHtml(params.name || 'Not provided')}</p>
      <p><strong>Email:</strong> ${escapeHtml(params.email)}</p>
      <p><strong>Monthly auspicious dates opt-in:</strong> ${params.monthlyOptIn ? 'Yes' : 'No'}</p>
      <p><strong>Birth data:</strong> ${escapeHtml(`${params.birth.year}-${params.birth.month}-${params.birth.day} ${params.birth.hour}:${String(params.birth.minute || 0).padStart(2, '0')}`)}</p>
      <div style="background:#F5F5F2;padding:16px;border-radius:8px;margin-top:16px;">
        <p><strong>Compatibility:</strong> ${escapeHtml(params.payload.compatibility.label)} (${escapeHtml(params.payload.compatibility.score)}/100)</p>
        <p>${escapeHtml(params.payload.compatibility.summary)}</p>
        <p><strong>Best hours:</strong> ${escapeHtml(params.payload.compatibility.helpfulHours.map(h => `${h.label} ${h.pillar}`).join(', ') || 'None ranked')}</p>
      </div>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from: `The Full Picture <${process.env.SENDER_EMAIL || 'hello@contact.thefullpicture.asia'}>`,
    to: recipients,
    subject: `Daily Almanac Unlock - ${params.selectedDate}`,
    html,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send lead notification');
  }
  return { notified: true, data };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const selected = normalizeSelectedDate(getQueryDate(req));
      const payload = buildDailyAlmanacPayload(selected);
      return res.status(200).json({ success: true, ...payload });
    }

    if (req.method === 'POST') {
      const body = parseJsonBody(req);
      const selected = normalizeSelectedDate(body.date);
      const birth = normalizeBirthInput(body);
      const email = getEmail(body, true);
      const payload = buildPersonalAlmanacPayload(selected, birth);
      const selectedDate = `${selected.year}-${String(selected.month).padStart(2, '0')}-${String(selected.day).padStart(2, '0')}`;
      const lead = await sendLeadNotification({
        email,
        name: body.name || body.birth?.name,
        selectedDate,
        birth,
        monthlyOptIn: Boolean(body.monthlyOptIn),
        suppressNotification: body.notifyLead === false,
        payload,
      });

      return res.status(200).json({
        success: true,
        ...payload,
        lead,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    const message = error?.message || 'Failed to build daily almanac';
    const status = /date|email|birth/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}
