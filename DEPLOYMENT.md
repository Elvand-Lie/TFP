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
- `KV_REST_API_URL` — report storage + email idempotency (Vercel KV / Upstash REST endpoint)
- `KV_REST_API_TOKEN`

`KV_REST_API_URL` / `KV_REST_API_TOKEN` may instead be supplied as the Upstash-named aliases
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Supply either pair, not both.

Both should be configured in production. They are read lazily at request time, but with neither
pair set the report API fails closed: persisting a report and claiming an email send both return
`503` rather than pretending to succeed. The report page still renders from its own `?r=` payload,
so a visitor is never shown a broken page.

## Commands

- `npm run check`
- `npm run deploy:preview`
- `npm run deploy:prod`
