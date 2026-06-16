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

## Commands

- `npm run check`
- `npm run deploy:preview`
- `npm run deploy:prod`
