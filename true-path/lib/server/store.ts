/**
 * True Path — result store.
 *
 * The finished report gets a persistent, SERVER-issued id so it can be revisited or emailed
 * (Brief 12). Answers stay in sessionStorage; only the final report is persisted server-side.
 *
 * Uses the Upstash / Vercel KV REST API over `fetch`, so no extra dependency is introduced.
 * The store is OPTIONAL for reading: with no credentials configured the read paths return
 * null/false and the report page degrades to its self-contained payload link rather than
 * breaking. It is REQUIRED for writes a visitor would otherwise be misled about — see
 * StoreNotConfiguredError.
 *
 * Two multi-key transitions are atomic server-side Redis scripts (EVAL), because a
 * read-then-write pair across two round trips can leave an orphaned mapping or, worse,
 * overwrite a result that a concurrent request already owns:
 *
 *   claimSaveRequest  — idempotency mapping + the result itself, in one script
 *   claimEmailSend    — the email delivery claim, transitioned to `sent` only after Resend
 *                       reports success (markEmailSent)
 */

const KEY_PREFIX = 'tfp:truepath:result:';
const EMAIL_PREFIX = 'tfp:truepath:emailed:';
const LEAD_PREFIX = 'tfp:truepath:lead:';
const REQUEST_PREFIX = 'tfp:truepath:request:';
const ACCEPTANCE_PREFIX = 'tfp:truepath:accepted:';

/** 90 days, in seconds. */
const RESULT_TTL_SECONDS = 60 * 60 * 24 * 90;

/**
 * Server-issued resultIds. The id is minted here (see `newResultId`), never accepted from the
 * client, so only the shape we produce needs to be recognised on the way back in.
 */
const RESULT_ID_PATTERN = /^tp_[A-Za-z0-9_-]{4,64}$/;

type RestConfig = { url: string; token: string };

/**
 * Which vars configure the store is pure logic, so it lives in `true-path/lib/store-config.js`
 * where it is type-checked and unit-tested. This wrapper only supplies the real environment.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StoreConfig = require('../store-config.js') as {
  resolveRestConfig(env: Record<string, string | undefined>): RestConfig | null;
};

function getRestConfig(): RestConfig | null {
  return StoreConfig.resolveRestConfig(process.env);
}

/**
 * Thrown when an operation that genuinely needs the store runs with no credentials configured.
 *
 * Callers map this to an explicit 503. It exists so a missing store can never be mistaken for
 * a successful write, and never for a `pending`/`sent` email state.
 */
export class StoreNotConfiguredError extends Error {
  code = 'storage_not_configured';

  constructor(message = 'True Path store is not configured') {
    super(message);
    this.name = 'StoreNotConfiguredError';
  }
}

/** True when a KV store is configured. Callers use this to report honest status. */
export function isStoreConfigured(): boolean {
  return getRestConfig() !== null;
}

export function isValidResultId(value: unknown): boolean {
  return typeof value === 'string' && RESULT_ID_PATTERN.test(value);
}

/**
 * Mint a server-owned result id. `crypto.randomUUID` is available on the Node 18+ runtime
 * Vercel provides; the dashes are stripped so the id stays inside the recognised shape.
 */
export function newResultId(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = require('crypto') as { randomUUID(): string };
  return 'tp_' + nodeCrypto.randomUUID().replace(/-/g, '');
}

async function command(args: (string | number)[]): Promise<unknown> {
  const config = getRestConfig();
  if (!config) return null;

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    throw new Error(`KV request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };

  // Upstash reports a command-level failure inside the JSON envelope, often alongside HTTP 200.
  // Treating that as a successful write is exactly the "success a visitor should not have been
  // promised" case this module exists to prevent, so it is raised like any other failure.
  if (payload && typeof payload === 'object' && payload.error) {
    throw new Error(`KV command failed: ${String(payload.error).slice(0, 200)}`);
  }

  return payload && typeof payload === 'object' ? payload.result ?? null : null;
}

/** Persist a finished Section 13 record. Returns false when no store is configured. */
export async function saveResult(record: Record<string, unknown>): Promise<boolean> {
  const resultId = record.resultId;
  if (!isValidResultId(resultId)) throw new Error('Invalid resultId');

  const result = await command([
    'SET',
    KEY_PREFIX + String(resultId),
    JSON.stringify(record),
    'EX',
    String(RESULT_TTL_SECONDS),
  ]);

  return result !== null;
}

/**
 * Atomically claim an idempotency key AND store the record it produced.
 *
 * Why one script: the mapping (`request:<uuid>` -> resultId) and the result must agree. Writing
 * them as two commands can strand a mapping with no result behind it, and a retry that arrives
 * between the two writes would be told "already stored" for a report that does not exist.
 *
 * The fingerprint of the validated raw inputs is stored with the mapping so a REPLAY with a
 * changed answer set is detectable: reusing the key with different inputs returns `conflict`
 * instead of silently handing back the wrong visitor's report.
 *
 * Two ordering details, both deliberate:
 *
 *   - The RESULT is written before the mapping. A Redis script is atomic against concurrent
 *     callers, but a runtime error does NOT roll back commands that already executed, so the
 *     reverse order could strand a mapping pointing at a record that was never written — and the
 *     next caller would be told `stored: true` about nothing.
 *   - A replay re-checks that the record it points at still EXISTS. Mappings and results share a
 *     TTL, but a corrupt or externally-deleted result must surface as `missing` (an environment
 *     failure) rather than as a successful save.
 *
 * @returns 'created' (this caller wrote it) | 'exists' (same inputs replayed, record present)
 *          | 'conflict' (same key, different inputs) | 'missing' (mapping present, record gone)
 */
export type SaveClaim = {
  status: 'created' | 'exists' | 'conflict' | 'missing';
  resultId: string | null;
};

export async function claimSaveRequest(params: {
  requestKey: string;
  fingerprint: string;
  resultId: string;
  record: Record<string, unknown>;
}): Promise<SaveClaim> {
  if (!isStoreConfigured()) {
    throw new StoreNotConfiguredError('Cannot claim a save without a configured store');
  }
  if (!isValidResultId(params.resultId)) throw new Error('Invalid resultId');

  const script = [
    '-- tfp:claim-save',
    'local requestKey = KEYS[1]',
    'local resultKey = KEYS[2]',
    'local ttl = tonumber(ARGV[1])',
    'local resultId = ARGV[2]',
    'local fingerprint = ARGV[3]',
    'local recordJson = ARGV[4]',
    'local keyPrefix = ARGV[5]',
    "local existing = redis.call('GET', requestKey)",
    'if existing then',
    '  local ok, decoded = pcall(cjson.decode, existing)',
    "  if ok and type(decoded) == 'table' and decoded.fingerprint == fingerprint then",
    '    local claimedId = tostring(decoded.resultId)',
    // The claimed record lives under the ORIGINAL id, not this request's freshly minted one.
    "    if redis.call('EXISTS', keyPrefix .. claimedId) == 0 then",
    "      return {'missing', claimedId}",
    '    end',
    "    return {'exists', claimedId}",
    '  end',
    "  return {'conflict', ''}",
    'end',
    "redis.call('SET', resultKey, recordJson, 'EX', ttl)",
    "redis.call('SET', requestKey, cjson.encode({resultId = resultId, fingerprint = fingerprint}), 'EX', ttl)",
    "return {'created', resultId}",
  ].join('\n');

  const raw = await command([
    'EVAL',
    script,
    '2',
    REQUEST_PREFIX + params.requestKey,
    KEY_PREFIX + params.resultId,
    String(RESULT_TTL_SECONDS),
    params.resultId,
    params.fingerprint,
    JSON.stringify(params.record),
    KEY_PREFIX,
  ]);

  const row = Array.isArray(raw) ? raw : [];
  const status = String(row[0] ?? '');
  const resultId = row[1] === undefined || row[1] === null || row[1] === '' ? null : String(row[1]);

  if (status === 'created') return { status: 'created', resultId: params.resultId };
  if (status === 'exists') return { status: 'exists', resultId };
  if (status === 'missing') return { status: 'missing', resultId };
  return { status: 'conflict', resultId };
}

/** Load a persisted record, or null when it is missing/unavailable. */
export async function loadResult(resultId: unknown): Promise<Record<string, unknown> | null> {
  if (!isValidResultId(resultId)) return null;

  const raw = await command(['GET', KEY_PREFIX + String(resultId)]);
  if (typeof raw !== 'string' || !raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Attach the captured lead to an existing record (Brief 13 `lead` block). */
export async function saveLead(
  resultId: unknown,
  lead: Record<string, unknown>
): Promise<boolean> {
  if (!isValidResultId(resultId)) return false;

  const record = await loadResult(resultId);
  if (!record) {
    // Keep the lead even if the result has expired, so no enquiry is ever lost.
    await command([
      'SET',
      LEAD_PREFIX + String(resultId),
      JSON.stringify(lead),
      'EX',
      String(RESULT_TTL_SECONDS),
    ]);
    return false;
  }

  record.lead = { ...(record.lead as object), ...lead };
  await saveResult(record);
  return true;
}

// ─── report email delivery ───────────────────────────────────────────────────

/**
 * The email claim has two live states, not one boolean.
 *
 *   claimed  — this caller owns the send and must now attempt it
 *   pending  — another request is mid-flight; the visitor must NOT be shown success
 *   sent     — already delivered; this is a true duplicate
 *   conflict — the same report is being sent to a DIFFERENT recipient
 *
 * Collapsing `pending` into `sent`, as a single NX flag does, tells a concurrent second
 * submission that its report was delivered when the first attempt may still fail.
 *
 * The claim is bound to the recipient as well as the report, so a failed attempt to one address
 * cannot block a later, legitimate send to another.
 */
export type EmailClaim = { status: 'claimed' | 'pending' | 'sent' | 'conflict' };

type EmailAcceptance = { email: string; deliveryId: string; acceptedAt: string };

/** Private provider acknowledgement; never part of the public v2.1 report record. */
export async function loadEmailAcceptance(resultId: unknown): Promise<EmailAcceptance | null> {
  if (!isValidResultId(resultId)) return null;
  const raw = await command(['GET', ACCEPTANCE_PREFIX + String(resultId)]);
  if (raw === null) return null;
  const value = typeof raw === 'string' ? JSON.parse(raw) : null;
  if (!value || typeof value.email !== 'string' || typeof value.deliveryId !== 'string' ||
      !value.deliveryId.trim() || typeof value.acceptedAt !== 'string') {
    throw new Error('Invalid stored email acknowledgement');
  }
  return value;
}

export async function saveEmailAcceptance(
  resultId: unknown,
  acceptance: EmailAcceptance
): Promise<void> {
  if (!isValidResultId(resultId) || !acceptance.email || !acceptance.deliveryId.trim()) {
    throw new Error('Invalid email acknowledgement');
  }
  if (!isStoreConfigured()) throw new StoreNotConfiguredError();
  const saved = await command(['SET', ACCEPTANCE_PREFIX + String(resultId),
    JSON.stringify(acceptance), 'NX', 'EX', String(RESULT_TTL_SECONDS)]);
  if (saved === 'OK') return;
  const existing = await loadEmailAcceptance(resultId);
  if (!existing || existing.email !== acceptance.email || existing.deliveryId !== acceptance.deliveryId) {
    throw new Error('Email acknowledgement was not stored');
  }
}

export async function claimEmailSend(params: {
  resultId: unknown;
  email: string;
  providerKey: string;
}): Promise<EmailClaim> {
  if (!isValidResultId(params.resultId)) return { status: 'conflict' };
  if (!isStoreConfigured()) {
    throw new StoreNotConfiguredError('Cannot claim an email send without a configured store');
  }

  const script = [
    '-- tfp:claim-email',
    'local key = KEYS[1]',
    'local ttl = tonumber(ARGV[1])',
    'local email = ARGV[2]',
    'local providerKey = ARGV[3]',
    'local at = ARGV[4]',
    "local raw = redis.call('GET', key)",
    'if raw then',
    '  local ok, state = pcall(cjson.decode, raw)',
    "  if ok and type(state) == 'table' then",
    '    if state.email ~= email then',
    "      return {'conflict'}",
    '    end',
    "    if state.state == 'sent' then",
    "      return {'sent'}",
    '    end',
    "    return {'pending'}",
    '  end',
    "  return {'conflict'}",
    'end',
    "redis.call('SET', key, cjson.encode({state = 'pending', email = email, providerKey = providerKey, at = at}), 'EX', ttl)",
    "return {'claimed'}",
  ].join('\n');

  const raw = await command([
    'EVAL',
    script,
    '1',
    EMAIL_PREFIX + String(params.resultId),
    String(RESULT_TTL_SECONDS),
    params.email,
    params.providerKey,
    new Date().toISOString(),
  ]);

  const status = Array.isArray(raw) ? String(raw[0] ?? '') : '';
  if (status === 'claimed' || status === 'pending' || status === 'sent') return { status };
  return { status: 'conflict' };
}

/**
 * Transition a claim to `sent`. Called ONLY after the provider reports success, so a crash
 * mid-send leaves a `pending` claim (which blocks a premature success message) rather than a
 * false `sent`.
 */
export async function markEmailSent(params: {
  resultId: unknown;
  email: string;
}): Promise<boolean> {
  if (!isValidResultId(params.resultId)) return false;

  const script = [
    '-- tfp:mark-sent',
    'local key = KEYS[1]',
    'local ttl = tonumber(ARGV[1])',
    'local email = ARGV[2]',
    'local at = ARGV[3]',
    "local raw = redis.call('GET', key)",
    "if not raw then return {'missing'} end",
    'local ok, state = pcall(cjson.decode, raw)',
    "if not ok or type(state) ~= 'table' then return {'missing'} end",
    "if state.email ~= email then return {'conflict'} end",
    "state.state = 'sent'",
    'state.sentAt = at',
    "redis.call('SET', key, cjson.encode(state), 'EX', ttl)",
    "return {'sent'}",
  ].join('\n');

  const raw = await command([
    'EVAL',
    script,
    '1',
    EMAIL_PREFIX + String(params.resultId),
    String(RESULT_TTL_SECONDS),
    params.email,
    new Date().toISOString(),
  ]);

  return Array.isArray(raw) && String(raw[0] ?? '') === 'sent';
}

/**
 * Drop a claim after a delivery attempt that genuinely failed, so the visitor's retry can
 * succeed. A `sent` claim is never released, and a claim held for a different recipient is left
 * alone — releasing either would remove a real record of what was delivered, or of what is
 * still in flight.
 */
export async function releaseEmailSend(params: {
  resultId: unknown;
  email: string;
}): Promise<boolean> {
  if (!isValidResultId(params.resultId)) return false;

  const script = [
    '-- tfp:release-email',
    'local key = KEYS[1]',
    'local email = ARGV[1]',
    "local raw = redis.call('GET', key)",
    "if not raw then return {'missing'} end",
    'local ok, state = pcall(cjson.decode, raw)',
    "if not ok or type(state) ~= 'table' then return {'missing'} end",
    "if state.state == 'sent' then return {'sent'} end",
    'if state.email ~= email then return {\'conflict\'} end',
    "redis.call('DEL', key)",
    "return {'released'}",
  ].join('\n');

  const raw = await command(['EVAL', script, '1', EMAIL_PREFIX + String(params.resultId), params.email]);
  return Array.isArray(raw) && String(raw[0] ?? '') === 'released';
}
