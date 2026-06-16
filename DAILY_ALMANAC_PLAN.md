# Daily Almanac Plan

## Scope
- Add a public `/daily-almanac` experience that loads the current date by default.
- Provide an open daily almanac reading and an email-gated personal compatibility teaser.
- Keep Daily Almanac and `/api/bazi` aligned by using one shared `lunar-javascript` calendar engine.
- Defer social/share card rendering to a later phase while keeping the API payload extensible.

## Implementation Notes
- The shared calendar engine lives in `lib/calendar.ts`.
- The engine uses exact `lunar-javascript` solar-term timing for year and month pillars.
- Day pillars use the exact day mode from `lunar-javascript`.
- The 23:00-23:59 late-Zi hour is patched explicitly so `23:59 11 Jun 2026` remains a `丙辰` day with `戊子` hour.
- Open date-level almanac readings are anchored at noon for stability.
- Personal compatibility uses the submitted birth date and time.
- Lead notifications are sent through Resend only when an email is submitted and `RESEND_API_KEY` plus `LEAD_NOTIFY_EMAIL` are configured.

## Phase 1 Verification
- Run `npx tsc --noEmit`.
- Check the hard late-Zi boundary:
  - `2026-06-11 23:59 -> 丙辰 day, 戊子 hour`
  - `2026-06-12 00:00 -> 丁巳 day, 庚子 hour`
- Check exact solar-term boundaries by comparing the minute before and after library-provided JieQi timestamps.
- Smoke test open almanac payload fields and all 12 hour blocks.
- Smoke test unlock requests with and without email.
- Perform desktop and mobile browser QA for layout, nav state, and overlap.
