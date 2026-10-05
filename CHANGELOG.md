# Changelog

All notable changes to The Full Picture site. Dates are 2026.

## 2026-10-05 — True Path v2.3 (Watch-outs & Growth)

### Added
- **Page 4 — Watch-outs & Growth 留意** (D10): every report now ends with a coaching-tone page: 2-3 numbered watch-out cards (strength overused, least natural talent, Triangle Gap), an Under Pressure line, a One Quick Win This Week panel, and a What a Questionnaire Can't Show teaser leading into the consultation. The website result page carries the matching Watch-outs section before the consultation button.
- **Strength labels** (D2): talent branches show Very strong / Strong / Moderate / Developing / Emerging instead of bare percentages (bands in config; 0-19 bars keep a visible 8% sliver). Iron Triangle keeps its %.
- **Talent Tree tooltips** (D1): the scores-don't-total-100 explanation moved to an ⓘ tooltip beside the heading.
- **Shared report copy** (D6): the website result page now renders from the same content model as the PDF, so both match word for word.
- **Analytics**: tp_watchouts_view (a2Shown, gapRole, pattern) and tp_advisory_click (titleKey, primaryRole).

### Changed
- **Report is 4 pages** (was 3): Talent → Direction → Role & True Path → Watch-outs & Growth. All visitor-facing 3-page wording updated.
- **Lowest-branch observation rewritten** (D3): labels not percentages, energy lines below 40, ties name both branches, no more 'a reading, not a flaw'.
- **Talent Pattern block** (D4): YOUR TALENT PATTERN label, full-sentence essence ('As a X, you ...'), co-dominant line exactly once, strengths sentence on the website too.
- **Name field** (D7): clearer label/helper; the name is used exactly as typed — no capitalising or splitting.
- **Tree labels** (D5): fixed seats with a ≥24px gap at every viewport; two-line name + strength label.
- **CTA casing and bullets** (D9): Title Case buttons, bullets aligned to the text column, ⓘ icon inline.

### Removed
- **The report QR code** (v2.2 C13 cancelled): no generation, markup or reserved space remains. BOOKING_URL stays in config for the consultation link.

## 2026-10-04 — True Path v2.2 final audit sign-off — True Path v2.2 final audit sign-off

### Fixed
- **PDF download filename with CJK names** (C14): `Content-Disposition` crashed on non-ASCII names (e.g. 陈伟). Now uses RFC 5987 encoding (`filename*=UTF-8''…`) with an ASCII fallback, so every name downloads cleanly.
- **PDF metadata** (C14): the Chromium-rendered PDF never carried an Author. Now post-processed with pdf-lib: personalised Title (`True Path Report — {FirstName}`), Author/Creator = The Full Picture, subject line, and creation date pinned to the record's own instant.
- **Booking QR size** (C13): raised to the brief minimum of 25mm × 25mm, placed beside the consultation link with a "scan or tap" hint; page-3 spacing trimmed (last-page-scoped CSS only) so the report stays exactly 3 pages when the QR is active.

### Verified
- Full v2.2 audit against the Change Brief: C1–C14 individually behavior-tested, 7 dynamic report profiles (Jose / Yvonne / Kelvin / balanced-talent / dual-triangle / balanced-triangle / long-content) all exactly 3 pages with no clipping; full True Path + Lucky + e2e suites 161 pass / 0 fail (1 pre-existing skip).

## 2026-10-03 — Report PDF rendered from the reference HTML

### Changed
- **The PDF is now the reference HTML, printed by Chromium** (`api/true-path-pdf` via `@sparticuz/chromium` + `puppeteer-core`): the supplied improved report HTML became the production template (`true-path/lib/report-html.js`), with dynamic values, the site's canonical Talent Tree SVG (print-dark labels, dominant-branch highlight) and a dynamically weighted Iron Triangle. Typography, cards, chips, colors and page structure are the reference's own — pdfmake is kept only as an automatic fallback renderer (`X-Report-Renderer` header reveals which ran).
- **Fonts**: Noto Serif CJK SC + Noto Sans CJK SC registered in the headless browser, so CJK renders in the reference's faces; typographic apostrophes are straightened (CJK fonts draw U+2019 full-width).
- **C2/C3/C4 visual pass**: serif display headings, burgundy talent bars with gold primary-share accents, reference sentence labels (Energises / Good at / Work you could be paid for / Impact), white role-strength chips, gold-bordered CTA panel.

### Added
- **`tests/true-path-journey-clicks.test.mjs`** (jsdom): boots the real journey app in a real DOM and drives the actual click path — Begin buttons, name gate, fresh/stale sessions, config-fetch failure, booting-state release. Any tweak that breaks "Begin: 12 statements" now fails the suite before deploy.
- **Journey boot hardening**: config fetch times out (5s) and retries, falls back to a localStorage-cached copy; visible "Loading your journey…" state while controls are unbound; on-page error banners for boot failures and pre-bind clicks, so a dead page can never fail silently.
- **Cache busting**: all True Path shells load scripts/CSS with a version query (`?v=2.2.4`), eliminating stale-JS incidents after deploys.

## 2026-10-03 — Save-as-PDF button and session fixes

### Fixed
- **"Save as PDF" fallback**: a failed server save silently opened the browser's print dialog, producing a dark unstyled printout. The PDF now opens as a real tab (native anchor, popup-blocker resistant), and a failed save shows a visible "We couldn't prepare your PDF" message with retry instead of printing.
- **Privacy page links**: policy-body links rendered in default browser blue; restyled to the site palette (beige/gold/ivory).
- **Journey boot**: "Begin: 12 statements" dead-click incidents traced to the unbound boot window and stale tabs — see the 10-03 hardening entry above.

## 2026-10-02 — Site polish and fixes

### Fixed
- **Tool heroes centered again** (`/lucky`, `/daily-almanac`): the full-viewport hero change had overridden the centered page container, slamming content against the left screen edge. Restored proper margins.
- **ZWDS font weight**: the page was silently rendering Inter (body) and Georgia (headings) instead of the site's DM Sans / Cormorant Garamond — `assets/zwds-addon.css` redefined the site font variables. Aligned to site tokens, so ZWDS now matches BaZi's typography exactly.
- **True Path quiz screens**: a later `background:` shorthand was silently wiping the new ambient glow; switched it to `background-color` so the glow renders.

### Changed
- **True Path journey styling**: quiz steps are now vertically centered in the viewport (long views degrade to normal top flow), with a soft crimson radial glow and a faint 道 watermark glyph. Print output unaffected; no logic, content or scoring touched.

## 2026-10-02 — Full-viewport tool heroes

- `/true-path`, `/lucky` and `/daily-almanac` landing heroes now fill the whole first screen (`min-height: 100svh`), keeping the footer below the fold like the home page.

## 2026-10-02 — Unified navigation, footer and typography

### Added
- **Tools section in the navbar**: a dropdown consolidating BaZi (八字), ZWDS (紫微), Daily Almanac (通书), True Path (轨道) and Lucky Today (运). Navbar is now Home · About · Founder · Services · Tools ▾ · Insights · Contact.
- **Tools column in the footer** on every page.
- **`assets/site-chrome.css`**: one shared stylesheet, loaded last on all 23 pages, pinning navbar/footer details (logo sizes, link fonts, spacing, footer grid, responsive breakpoints) to the home page's exact values. All pages now behave identically, including the hamburger-only nav below 1280px.

### Changed
- **Em dashes removed from all frontend copy** across every served page: titles/metas use `|`, body copy rewritten with commas/colons/semicolons. Zero em dashes remain in served HTML. (JS comments and PDF report strings untouched.)
- **Footer unified** to the home page design on all pages; the Privacy Policy link now points at the real `/privacy` page.
- **Mobile menu** lists all eleven destinations consistently on every page.

## 2026-10-02 — Lucky Today regression suite hardening

### Added
- `tests/fixtures/lucky-parity.json`: 30 frozen parity fixtures (both genders, pre/post-2000 births, known/unknown birth times, 15 distinct dates). Every fixture was generated by running the ported engine AND the original minified engine side-by-side under a frozen Singapore clock — 30/30 deep-equal before being written.
- Post-2000 Gua tests, including two lunar-calendar edge cases (born before CNY rolls the lunar year).
- Deterministic `bestTime` testing: tests freeze the global clock for the engine's internal Asia/Singapore read; the engine itself is untouched.
- Score-range assertions (1..10) across the whole fixture set.

### Kept
- All pre-existing expected outputs byte-identical; the engine and pages were not modified.

## 2026-10-02 — Am I Lucky Today migration

- Ported the amiluckytoday.app daily luck calculator into the TFP site:
  - `assets/luck-engine.js` — faithful, readable port of the original LUCK ENGINE V2.7 (all tables, thresholds and output shape preserved).
  - `lucky.html` — the calculator under the TFP shell: birth-details form with unknown-birth-time fallback, score /10, lucky number/color/direction/best window, auspicious and avoid lists, chart summary, share buttons, MailerLite email modal.
  - `assets/lunar.js` — lunar-javascript UMD browser build.
  - `tests/lucky-engine.test.mjs` — 10 tests including a full parity fixture verified field-for-field against the live original.
- Verified by a 40-case randomized differential run against the original engine (0 mismatches). No new serverless functions.

## 2026-10-02 — True Path production integration

- Integrated the approved True Path (轨道) standalone into the production site: static shells, journey controller, authoritative config, persistence/email contracts repaired, server-generated report IDs, three-page server PDF preserved.
- Full suite green (127 tests including the six A–F scoring fixtures); `api/` remains at six serverless functions.
- Deployed to production at `https://tfp-three.vercel.app/true-path`.
