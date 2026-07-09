## The Full Picture — **紫微⽃数** (ZWDS) Browser Calculator 

## Developer Brief for Elvand — Phase 1 & Phase 2 

Project owner: Jose | The Full Picture Build type: Browser-only calculator (no app). Embedded on existing website. Engine: `iztro` — open-source, MIT-licensed JS library for ZWDS chart calculation. Do NOT build calculation logic from scratch — this library already handles star placement, luck cycles, and four-transformation logic to the depth we need. Optional front-end accelerator: `react-iztro` (React component wrapper for iztro) — use if the site’s stack is React/Next.js. If not, integrate iztro directly via its vanilla JS/CDN build. 

## PHASE 1 — Core Chart Engine (Target: 2–3 weeks) 

## Objective 

A working, branded natal chart generator on the site — not a demo, a production-ready v1. 

## Functional Scope 

- Input form: DOB (solar/lunar toggle), birth time (with unknown-time fallback if possible), gender. 

- Output: Full 12-palace natal chart (命宫 through 福德宫), matching the visual density/clarity of the reference app screenshots Jose provided (not a stripped-down layout). 

## Time-based views ( **运限** ): Toggle between: 

- ⼤限 (10-year luck cycle — same meaning as ⼤运) 

- ⼩限 (annual age-based cycle — note: this is calculated differently from 流年. It has no 流耀 and no self-generated 四化; its 四化 is derived from the palace’s own 宫⼲. Do not conflate with 流年 in the code logic.) 

- 流年 / 流⽉ / 流⽇ / 流时 (standard iztro horoscope() outputs) 

## Technical Notes 

- Use `astrolabe.horoscope(date, hour)` for all time-based views — iztro’s API already separates ⼤限/⼩限/流年/流⽉/流⽇/流时 correctly. 

- Confirm chart renders correctly for both solar and lunar birth dates ( `astro.bySolar()` / `astro.byLunar()` ). 

## Branding Requirements 

- Full Picture visual identity: dark background, gold/burgundy accent palette (match the ⼗天⼲化曜表 graphic style already in brand assets — see Phase 2 reference). 

- Logo placement consistent with existing site header. 

- Mobile-responsive — most traffic will be mobile. 

## Phase 1 Deliverable Checklist 

- Working input form (solar/lunar/time/gender) 

- 12-palace chart renders correctly 

- ⼤限 / ⼩限 / 流年 / 流⽉ / 流⽇ / 流时 toggle functional 

- Branded UI (not default iztro/react-iztro styling) 

- Mobile responsive 

- QA: cross-check 3–5 known charts (Jose to supply test cases) against the reference app for accuracy 

## PHASE 2 — Flying Star Visualization ( **⻜星四化** ) (Target: +1–2 weeks after Phase 1) 

## Concept (for Elvand’s understanding — confirmed methodology) 

In 紫微⽃数⻜星理论 (flying star theory), each palace has its own **宫⼲** (the Heavenly Stem assigned to that palace’s position on the chart — not the person’s birth-year stem). That 宫 ⼲ generates its own set of **四化** (禄/权/科/忌), which then “flies” — i.e., lands on / affects — one of the other palaces. 

## Confirmed project-specific rule: 

- 11 of the 12 palaces each generate flying 四化 from their own 宫⼲, which land on other palaces. 

- **福德宫** is the one exception: its own 宫⼲ does not generate outgoing flying 四化 (it doesn’t “fly out”). 

- However, **福德宫** CAN still receive incoming flying 四化 lines emitted from the other 11 palaces. It’s a valid _destination_ , just never a _source_ . 

## Reference Asset: **⼗天⼲化曜表** ( **北派** ) 

Jose has supplied the exact mutagen table this calculator must use — **北派紫微⽃数** fourtransformation rules. This is the branded reference table (attached separately as image) and must be configured as the fixed default mutagen ruleset — do not use iztro’s built-in default table without verifying it matches this exact table stem-for-stem. 

|**天⼲**|**化禄**|**化权**|**化科**|**化忌**|
|---|---|---|---|---|
|甲|廉贞|破军|武曲|太阳|
|⼄|天机|天梁|紫微|太阴|
|丙|天同|天机|⽂昌|廉贞|
|丁|太阴|天同|天机|巨⻔|
|戊|贪狼|太阴|右弼|天机|
|⼰|武曲|贪狼|天梁|⽂曲|
|庚|太阳|武曲|太阴|天同|
|辛|巨⻔|太阳|⽂曲|⽂昌|
|壬|天梁|紫微|左辅|武曲|
|癸|破军|巨⻔|太阴|贪狼|



Implementation: Use iztro’s `configure()` global override (available since v2.3.0) to replace the default mutagen table with the above — do not rely on iztro’s stock configuration. 

`import { configure } from 'iztro'; configure({ mutagen: {` 甲 `: {` 廉贞 `: '` 禄 `',` 破军 `: '` 权 `',` 武曲 `: '` 科 `',` 太阳 `: '` 忌 `' },` ⼄ `: {` 天机 `: '` 禄 `',` 天梁 `: '` 权 `',` 紫微 `: '` 科 `',` 太阴 `: '` 忌 `' },` 

丙 `: {` 天同 `: '` 禄 `',` 天机 `: '` 权 `',` ⽂昌 `: '` 科 `',` 廉贞 `: '` 忌 `' },` 丁 `: {` 太阴 `: '` 禄 `',` 天同 `: '` 权 `',` 天机 `: '` 科 `',` 巨⻔ `: '` 忌 `' },` 戊 `: {` 贪狼 `: '` 禄 `',` 太阴 `: '` 权 `',` 右弼 `: '` 科 `',` 天机 `: '` 忌 `' },` ⼰ `: {` 武曲 `: '` 禄 `',` 贪狼 `: '` 权 `',` 天梁 `: '` 科 `',` ⽂曲 `: '` 忌 `' },` 庚 `: {` 太阳 `: '` 禄 `',` 武曲 `: '` 权 `',` 太阴 `: '` 科 `',` 天同 `: '` 忌 `' },` 辛 `: {` 巨⻔ `: '` 禄 `',` 太阳 `: '` 权 `',` ⽂曲 `: '` 科 `',` ⽂昌 `: '` 忌 `' },` 壬 `: {` 天梁 `: '` 禄 `',` 紫微 `: '` 权 `',` 左辅 `: '` 科 `',` 武曲 `: '` 忌 `' },` 癸 `: {` 破军 `: '` 禄 `',` 巨⻔ `: '` 权 `',` 太阴 `: '` 科 `',` 贪狼 `: '` 忌 `' }, } });` 

## Functional Scope — Flying Star Interaction 

## Confirmed UX (per Jose): Click-to-reveal model. 

- User clicks 1 palace on the chart. 

- The tool displays that palace’s 4 flight lines (one per 四化 type: 禄/权/科/忌), each showing which of the other 11 palaces it flies to, based on that palace’s 宫⼲ and the table above. 

- Use iztro’s native `.palace(name).flyTo(targetPalace, mutagenType)` method to check/render each flight. 

- Special case handling: if the clicked palace is 福德宫, do not render any outgoing lines (it has none) — but 福德宫 should still visually light up as a valid _landing point_ when other palaces are clicked and their flight paths land there. 

- Visual style: flight lines should be clearly color-coded per 四化 type (e.g., 禄=one color, 权=another, 科=another, 忌=another) — consistent with brand palette from the reference table graphic. 

## Phase 2 Deliverable Checklist 

- iztro `configure()` override implemented and verified against the ⼗天⼲化曜表 above (test all 10 stems) 

- Click-a-palace interaction triggers 4 flight lines 

- 福德宫 exception handled correctly (no outgoing, but valid incoming target) 

- Color-coded lines per 四化 type 

QA: Jose to verify 5–10 known flying-star combinations manually before go-live 

## Explicitly Out of Scope (Phase 1 & 2) 

- Interpretation text / meaning-per-combination content (Phase 3 — Jose supplies this separately as a structured content module) 

- Multi-school selector (architect for future extensibility, do not build UI for it now) 

App/native build of any kind — browser only 

## Positioning Note for Internal Use 

This build — flying-star visualization + 北派-specific configuration + (later) proprietary interpretation layer — is not available combined anywhere else in the SEA ZWDS market currently reviewed (ziwei.pub, iziwei.com.cn, shenjige.cn, windada.com). This is a legitimate first-mover claim for marketing once live. 

