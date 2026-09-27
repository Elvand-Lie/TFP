# Deployment

## Include in git

- `api/`
- `assets/`
- `data/`
- `fonts/`
- `lib/`
- root `*.html`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vercel.json`
- `true-path/`
- `.env.example`
- `DAILY_ALMANAC_PLAN.md`

## Keep local only

- `.env`
- `.vercel/`
- `node_modules/`
- `scratch/`
- `pdf/`
- `Photos/`
- local PDF/image exports
- old test scripts and ad hoc reports

## Required env vars

- `RESEND_API_KEY`
- `SENDER_EMAIL`
- `CONTACT_TO_EMAIL`
- `LEAD_NOTIFY_EMAIL`
- Report storage + email idempotency — one of the pairs below

### Report storage credentials

The Vercel/Upstash integration writes this pair, and it is the **preferred** source:

- `UPSTASH_REDIS_REST_KV_REST_API_URL`
- `UPSTASH_REDIS_REST_KV_REST_API_TOKEN`

These older names are still accepted as fallbacks, so an existing project keeps working:

- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — the manually-created aliases
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`

The pairs are resolved **as whole pairs, most-preferred first**, and the first complete pair wins.
A URL from one setup with a token from another is never mixed: that always means misconfiguration,
and treating it as "configured" would surface a confusing auth failure instead of the honest
`storage_not_configured` the callers report.

A pair only counts when both halves are usable: empty or whitespace-only counts as unset, a value
that merely repeats its own variable name is a placeholder rather than a credential, and the URL
half must parse as an absolute `http(s)` URL. An unusable pair is skipped, so a complete fallback
pair still wins. The rule is covered by `tests/true-path-store-config.test.mjs`.

> **Do not hand-create `KV_REST_API_URL` / `KV_REST_API_TOKEN` to mirror the integration.**
> Those aliases previously held the literal *names* of the integration variables as placeholder
> text, which made the runtime resolve a non-URL and fail. Let the integration provision
> `UPSTASH_REDIS_REST_KV_REST_API_*` and leave the aliases unset.

Note these variables are **`sensitive`** on Vercel, which makes them write-only: they are
available to the build and runtime, but they cannot be read back through the dashboard, the API,
or `vercel env pull` (they come back empty even with decryption requested). An empty value from a
pull therefore does **not** mean "unset" — verify KV wiring by exercising a deployment, not by
inspecting the pulled file.

Both should be configured in production. They are read lazily at request time, but with no
complete pair set the report API fails closed: persisting a report and claiming an email send both
return `503` rather than pretending to succeed. The report page still renders from its own `?r=`
payload, so a visitor is never shown a broken page.

## Commands

- `npm run check`
- `npm run deploy:preview`
- `npm run deploy:prod`
