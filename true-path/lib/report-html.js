// @ts-check
/**
 * True Path — HTML report template (the PDF source of truth).
 *
 * This is the supplied reference report HTML, turned into a dynamic template: the DOM hierarchy,
 * CSS classes, dimensions, margins, typography, card layout, spacing, page boundaries and colors
 * are the reference's own. Only the hard-coded sample values became template variables, and the
 * two SVGs are generated dynamically following the reference geometry.
 *
 * Output is a full HTML document; a headless Chromium prints it to PDF (A4, no margins,
 * printBackground). `true-path/lib/server/html-pdf.ts` is the production caller.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).TruePathReportHtml = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The site's original Talent Tree artwork. When the canonical SVG module is available (Node
  // and the browser bundle both ship it), it is rendered with print inks; the simplified
  // reference-geometry tree below is only a fallback for hosts without it.
  let canonicalSvg = null;
  try {
    if (typeof module === 'object' && module.exports) {
      canonicalSvg = require('../assets/true-path-svg.js');
    } else if (root && root.TruePathSvg) {
      canonicalSvg = root.TruePathSvg;
    }
  } catch (error) { /* fall back to the reference-geometry tree */
  }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”‟]/g, '"')
      .replace(/…/g, '...')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** The reference's Talent Tree, dynamic: branch length/weight and leaf count follow the
   *  percentages, the dominant branch is highlighted, a balanced profile is left uniform.
   *  Labels print dark (#1F1F1F) for white paper, as the reference specifies. */
  function talentTreeSvg(tree) {
    const pct = tree.pct || {};
    const categories = tree.categories || [];
    const values = categories.map((c) => Math.max(0, Math.min(100, Number(pct[c.key]) || 0)));
    const dominant = tree.balancedProfile ? null : (tree.dominant || null);

    const crown = { x: 300, y: 205 };
    // The reference's four limb directions (endpoints of its 100% branches).
    const directions = [
      { dx: -148, dy: -54 },  // left
      { dx: -58,  dy: -137 }, // upper left
      { dx: 61,   dy: -138 }, // upper right
      { dx: 168,  dy: -54 }   // right
    ];
    const labelSpots = [
      { x: 105, y: 105, tx: 120, ty: 126 },
      { x: 190, y: 34,  tx: 208, ty: 55 },
      { x: 345, y: 34,  tx: 391, ty: 55 },
      { x: 468, y: 105, tx: 485, ty: 126 }
    ];

    let parts = '';
    parts += '<defs><linearGradient id="trunk" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#4E3B30"/><stop offset="1" stop-color="#765646"/>' +
      '</linearGradient></defs>';
    parts += '<path d="M286 335 C298 290 300 235 298 188 L313 188 C311 235 314 292 326 335Z" fill="url(#trunk)"/>';

    categories.forEach((category, i) => {
      const v = values[i];
      const dir = directions[i];
      const spot = labelSpots[i];
      const isDominant = dominant === category.key;
      const reach = 0.62 + 0.38 * (v / 100);
      const endX = crown.x + dir.dx * reach;
      const endY = crown.y + dir.dy * reach;
      const ctrlX = crown.x + dir.dx * reach * 0.45;
      const ctrlY = crown.y + dir.dy * reach * 0.85;
      const limb = isDominant ? '#8A4046' : '#6E4B3E';
      const leaf = isDominant ? '#A0455A' : '#7F774F';
      const width = 10 + (v / 100) * 3.5;

      parts += `<path d="M${crown.x} ${crown.y - (i === 1 || i === 2 ? 7 : 0)} Q${ctrlX.toFixed(0)} ${ctrlY.toFixed(0)} ${endX.toFixed(0)} ${endY.toFixed(0)}" stroke="${limb}" stroke-width="${width.toFixed(1)}" fill="none" stroke-linecap="round"/>`;

      const count = 6 + Math.round((v / 100) * 3);
      const leaves = [];
      for (let j = 0; j < count; j += 1) {
        const t = 0.4 + (0.6 * j) / Math.max(1, count - 1);
        const inv = 1 - t;
        const px = inv * inv * crown.x + 2 * inv * t * ctrlX + t * t * endX;
        const py = inv * inv * crown.y + 2 * inv * t * ctrlY + t * t * endY;
        const tx = 2 * inv * (ctrlX - crown.x) + 2 * t * (endX - ctrlX);
        const ty = 2 * inv * (ctrlY - crown.y) + 2 * t * (endY - ctrlY);
        const len = Math.max(1, Math.sqrt(tx * tx + ty * ty));
        const nx = -ty / len;
        const ny = tx / len;
        const side = j % 2 ? 1 : -1;
        const off = 13;
        const lx = px + nx * side * off;
        const ly = py + ny * side * off;
        const theta = (Math.atan2(ty, tx) * 180) / Math.PI;
        const spin = theta + side * 28;
        leaves.push(`<ellipse cx="${lx.toFixed(0)}" cy="${ly.toFixed(0)}" rx="11" ry="4.5" transform="rotate(${spin.toFixed(0)} ${lx.toFixed(0)} ${ly.toFixed(0)})"/>`);
      }
      parts += `<g fill="${leaf}" opacity=".88">${leaves.join('')}</g>`;

      parts += `<g font-family="'Noto Sans CJK SC', Arial" font-size="16" fill="#1F1F1F" font-weight="700">` +
        `<text x="${spot.x}" y="${spot.y}">${esc(category.name)}</text>` +
        `<text x="${spot.tx}" y="${spot.ty}">${v}%</text></g>`;
    });

    return `<svg class="tree-svg" viewBox="0 0 600 360" aria-label="Talent Tree">${parts}</svg>`;
  }

  /** Render the Talent Tree: the site's canonical artwork when the SVG module is present
   *  (print inks, dark labels), otherwise the simplified reference-geometry fallback. */
  function renderTree(tree) {
    if (canonicalSvg && typeof canonicalSvg.talentTreeSvg === 'function') {
      try {
        return canonicalSvg.talentTreeSvg(tree.pct, tree.categories, {
          raw: tree.raw,
          dominant: tree.dominant,
          balancedProfile: tree.balancedProfile,
          print: true,
          ariaLabel: 'Talent Tree'
        });
      } catch (error) { /* fall through to the fallback */
      }
    }
    return talentTreeSvg(tree);
  }

  /** The reference's Iron Triangle: fixed outer triangle, inner shape reweighted from the three
   *  shares by homothety about the weighted centroid. Labels dark and bold at the corners. */
  function ironTriangleSvg(shares) {
    const s = (key) => Math.max(0, Number(shares && shares[key]) || 0);
    const sc = s('commander'), sg = s('general'), sch = s('chancellor');
    const total = Math.max(1, sc + sg + sch);
    const A = { x: 150, y: 20 }, B = { x: 32, y: 220 }, C = { x: 268, y: 220 };
    const px = (A.x * sc + B.x * sg + C.x * sch) / total;
    const py = (A.y * sc + B.y * sg + C.y * sch) / total;
    const k = 0.3;
    const inner = [A, B, C].map((v) => ({
      x: px + (v.x - px) * k,
      y: py + (v.y - py) * k
    })).map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ');

    return `<svg class="triangle-svg" viewBox="0 0 300 250" aria-label="Iron Triangle">` +
      `<polygon points="150,20 32,220 268,220" fill="none" stroke="#1F1F1F" stroke-width="2"/>` +
      `<polygon points="${inner}" fill="#E7D6D9" stroke="#A8823F" stroke-width="2"/>` +
      `<g font-family="'Noto Sans CJK SC', Arial" font-size="15" fill="#1F1F1F" font-weight="700">` +
      `<text x="150" y="14" text-anchor="middle">帅 ${sc}%</text>` +
      `<text x="26" y="240">将 ${sg}%</text>` +
      `<text x="235" y="240">相 ${sch}%</text></g></svg>`;
  }

  /** Sentence labels per the reference (the four Ikigai directions). */
  const SENTENCE_LABELS = ['Energises', 'Good at', 'Work you could be paid for', 'Impact'];

  /** Build the full report document. `model` is ReportModel.buildReportModel output;
   *  `meta` carries { firstName, reportDate, resultId }; `opts.qrDataUrl` optionally embeds the
   *  booking QR under the CTA. */
  function buildReportHtml(model, meta, opts) {
    meta = meta || {};
    opts = opts || {};
    const byKind = (page, kind) => page.blocks.filter((b) => b.kind === kind);
    const first = (page, kind) => byKind(page, kind)[0] || null;
    const p1 = model.pages[0];
    const p2 = model.pages[1];
    const p3 = model.pages[2];

    const hero = first(p1, 'hero');
    const tree = first(p1, 'talent-tree');
    const p1Scores = first(p1, 'scores');
    const pair = first(p1, 'pair');
    const p1Insight = first(p1, 'insight');

    const p2Texts = byKind(p2, 'text');
    const sentences = p2Texts.slice(0, 4).map((b, i) => ({ label: SENTENCE_LABELS[i] || b.label, text: b.text, bold: i === 0 }));
    const p2Lists = byKind(p2, 'list-block');
    const possibleAreas = p2Lists.find((b) => /possible areas/i.test(b.label || ''));
    const valueCreation = p2Texts.length > 4 ? p2Texts[4] : null;
    const alignment = p2Lists.find((b) => /alignment/i.test(b.label || ''));
    const p2Insight = first(p2, 'insight');

    const tri = first(p3, 'iron-triangle');
    const role = first(p3, 'role-card');
    const p3Scores = first(p3, 'scores');
    const p3Texts = byKind(p3, 'text');
    const gap = p3Texts.find((b) => /gap/i.test(b.label || ''));
    const thrive = p3Texts.find((b) => /thrive/i.test(b.label || ''));
    const growth = p3Texts.find((b) => /growth/i.test(b.label || ''));
    const title = first(p3, 'title');
    const reflection = byKind(p3, 'list-block').find((b) => /reflection/i.test(b.label || ''));
    const invite = first(p3, 'invite');

    const firstName = meta.firstName || '';
    const reportDate = meta.reportDate || '';

    const scorePills = (rows) => (rows || []).map((row) => {
      const w = Math.max(0, Math.min(100, Number(row.value) || 0));
      return `<div class="score-pill"><div class="score-name">${esc(row.name)}</div>` +
        `<div class="score-val">${esc(row.value)}%</div>` +
        `<div class="bar"><span style="width:${w}%"></span></div></div>`;
    }).join('');

    // Share bars: gold for the field, burgundy for the primary (largest) share, as the
    // reference specifies.
    const sharePills = (() => {
      const rows = (p3Scores && p3Scores.rows) || [];
      const maxIndex = rows.reduce((best, row, i) => (Number(row.value) > Number((rows[best] || {}).value) ? i : best), 0);
      return rows.map((row, i) => {
        const color = i === maxIndex ? '#7A1F2B' : '#A8823F';
        const w = Math.max(0, Math.min(100, Number(row.value) || 0));
        return `<div class="score-pill"><div class="score-name">${esc(row.name)}</div>` +
          `<div class="score-val">${esc(row.value)}%</div>` +
          `<div class="bar"><span style="width:${w}%;background:${color}"></span></div></div>`;
      }).join('');
    })();

    const chipList = (items) => (items || []).map((item) =>
      `<span class="chip">${esc(String(item).replace(/^./, (ch) => ch.toUpperCase()))}</span>`
    ).join('');

    const alignmentLines = ((alignment && alignment.items) || []).map((line, i) =>
      `<p${i ? ' style="margin-top:2mm"' : ''}>${esc(line).replace(/^([A-Za-z ]+):/, '<b>$1:</b>')}</p>`
    ).join('');

    const pageFooter = (n) => `<div class="footer"><span>The Full Picture · Ancient Wisdom. Modern Strategy. · thefullpicture.asia${n === 3 ? ' · Result ID kept for support' : ''}</span><span>${n} / 3</span></div>`;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>True Path Report${firstName ? ' - ' + esc(firstName) : ''}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#fff; color:#1f1f1f; }
  body {
    font-family: "Noto Sans CJK SC", "Noto Sans", Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 210mm;
    height: 297mm;
    padding: 16mm 15mm 14mm 15mm;
    page-break-after: always;
    position: relative;
    overflow: hidden;
    background: #fff;
  }
  .page:last-child { page-break-after: auto; }
  .serif { font-family: "Noto Serif CJK SC", Georgia, serif; }
  .eyebrow {
    color:#7A1F2B;
    letter-spacing:.17em;
    font-size:8.3pt;
    text-transform:uppercase;
    font-weight:700;
  }
  .topline {
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:4mm;
    font-size:7.8pt;
    color:#6c6c6c;
  }
  .rule { height:1px; background:#A8823F; width:100%; margin:2.3mm 0 4.5mm; }
  h1,h2,h3,p { margin:0; }
  h1 { font-size:23pt; line-height:1.08; color:#7A1F2B; font-weight:600; }
  h2 { font-size:18pt; line-height:1.12; color:#7A1F2B; font-weight:600; }
  h3 { font-size:11pt; line-height:1.25; color:#1f1f1f; font-weight:700; }
  .muted { color:#4A4A4A; }
  .hero {
    border:1px solid #A8823F;
    background:#FAF7F2;
    padding:6mm 7mm;
    text-align:center;
    margin-bottom:5mm;
  }
  .hero .prepared { font-size:8.7pt; color:#4A4A4A; margin-bottom:2mm; }
  .hero .lead { font-size:11pt; color:#4A4A4A; margin-bottom:1mm; }
  .hero .title { font-size:24pt; text-transform:uppercase; letter-spacing:.02em; color:#7A1F2B; margin-bottom:1.7mm; }
  .hero .tagline { font-size:10pt; color:#1f1f1f; margin-bottom:1.5mm; }
  .hero .sub { font-size:8.7pt; color:#4A4A4A; }

  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:4mm; }
  .card {
    border:1px solid #DDD6CD;
    background:#FAF7F2;
    padding:4mm;
    border-radius:1.2mm;
  }
  .card .label {
    color:#7A1F2B;
    text-transform:uppercase;
    letter-spacing:.12em;
    font-size:7.5pt;
    font-weight:700;
    margin-bottom:1.6mm;
  }
  .card p, .card li { font-size:8.9pt; line-height:1.42; color:#1f1f1f; }
  .card ul { margin:1mm 0 0 4.5mm; padding:0; }

  .tree-wrap { height:92mm; display:flex; align-items:center; justify-content:center; margin:1mm 0 3mm; }
  .tree-wrap svg { width:auto; max-width:145mm; height:88mm; }
  .score-pill { display:flex; align-items:center; gap:3mm; margin:1.5mm 0; }
  .score-name { width:30mm; font-size:8.8pt; color:#1f1f1f; }
  .score-val { width:13mm; text-align:right; font-size:8.8pt; font-weight:700; }
  .bar { flex:1; height:2.2mm; background:#E7E1DA; border-radius:9px; overflow:hidden; }
  .bar > span { display:block; height:100%; background:#7A1F2B; }

  .insight {
    margin-top:4mm;
    border-left:3px solid #7A1F2B;
    padding:3mm 4mm;
    background:#FAF7F2;
  }
  .insight .big { font-size:13pt; color:#7A1F2B; margin-bottom:1.2mm; }
  .insight p { font-size:8.8pt; line-height:1.42; }

  .sentence-block {
    padding:3.3mm 4mm;
    border-bottom:1px solid #E1DBD4;
  }
  .sentence-block:last-child { border-bottom:0; }
  .sentence-block .label {
    color:#7A1F2B; font-weight:700; font-size:7.5pt;
    text-transform:uppercase; letter-spacing:.12em; margin-bottom:1mm;
  }
  .sentence-block p { font-size:9.5pt; line-height:1.48; }

  .section-title { display:flex; align-items:end; gap:3mm; margin-bottom:3mm; }
  .section-title .n { color:#A8823F; font-size:8pt; text-transform:uppercase; letter-spacing:.12em; }
  .section-title h2 { color:#7A1F2B; }

  .triangle-wrap { display:grid; grid-template-columns:72mm 1fr; gap:5mm; align-items:center; margin:2mm 0 4mm; }
  .triangle-svg { width:68mm; height:62mm; }
  .role-title { font-size:17pt; color:#7A1F2B; margin-bottom:1mm; }
  .role-sub { font-size:9pt; color:#4A4A4A; margin-bottom:2mm; }
  .role-copy { font-size:8.8pt; line-height:1.42; }
  .role-list { display:flex; flex-wrap:wrap; gap:1.7mm 3mm; margin:2mm 0; font-size:8.2pt; color:#4A4A4A; }
  .chip { border:1px solid #CFC7BE; padding:1mm 2mm; border-radius:10px; background:#fff; }

  .reflection { margin-top:3mm; }
  .reflection li { font-size:8.5pt; line-height:1.45; margin-bottom:1mm; }

  .cta {
    margin-top:3mm;
    padding:4mm;
    background:#FAF7F2;
    border:1px solid #A8823F;
    text-align:center;
  }
  .cta .title { color:#7A1F2B; font-size:13pt; margin-bottom:1mm; }
  .cta p { font-size:8.2pt; line-height:1.4; }
  .cta .link { color:#7A1F2B; text-decoration:underline; margin-top:2mm; font-weight:700; }

  /* Page 3 carries the most content; when the QR row is present these trims keep everything,
     footer included, inside the fixed A4 page. */
  .page:last-child .triangle-svg { height:54mm; }
  .page:last-child .triangle-wrap { margin:1mm 0 3mm; }
  .page:last-child .grid2 { gap:3mm; }
  .page:last-child .card { padding:3.2mm; }
  .page:last-child .cta { padding:3mm; }
  .page:last-child .cta .title { font-size:12pt; }

  .footer {
    position:absolute;
    left:15mm; right:15mm; bottom:8mm;
    display:flex; justify-content:space-between;
    color:#777; font-size:7.1pt;
    border-top:1px solid #E3DDD6;
    padding-top:2mm;
  }
</style>
</head>
<body>

<section class="page">
  <div class="topline"><span class="eyebrow">TRUE PATH · 轨道</span><span>Page 1 of 3</span></div>
  <div class="hero">
    <div class="prepared">Prepared for ${esc(firstName)}${reportDate ? ' · ' + esc(reportDate) : ''}</div>
    <div class="lead serif">${esc(hero && hero.intro)}</div>
    <div class="title serif">${esc(hero && hero.title)}</div>
    <div class="tagline">${esc(hero && hero.tagline)}</div>
    <div class="sub">${esc(hero && hero.subtitle)}</div>
  </div>

  <div class="section-title">
    <div class="n">Talent Tree 才</div>
    <h2 class="serif">How you naturally think</h2>
  </div>

  <div class="tree-wrap">${renderTree(tree)}</div>

  <div class="grid2">
    <div class="card">
      <div class="label">Talent Pattern 才</div>
      ${scorePills((p1Scores && p1Scores.rows) || [])}
    </div>
    <div class="card">
      <div class="label">${esc(pair && pair.archetypeHeading)}</div>
      <p>${esc(pair && pair.leadLine)}</p>
      <p style="margin-top:2mm"><b>${esc(pair && pair.strengthsSentence)}</b></p>
    </div>
  </div>

  <div class="insight">
    <div class="big serif">${esc(p1Insight && p1Insight.title)}</div>
    <p>${esc(p1Insight && p1Insight.body)}</p>
  </div>

  ${pageFooter(1)}
</section>

<section class="page">
  <div class="topline"><span class="eyebrow">TRUE PATH · 轨道</span><span>Page 2 of 3</span></div>
  <div class="section-title">
    <div class="n">Direction 道</div>
    <h2 class="serif">Where your strengths could matter</h2>
  </div>
  <div class="rule"></div>

  <div class="card" style="padding:0; overflow:hidden">
    ${sentences.map((s) => `<div class="sentence-block"><div class="label">${esc(s.label)}</div><p>${s.bold ? '<b>' : ''}${esc(s.text)}${s.bold ? '</b>' : ''}</p></div>`).join('\n    ')}
  </div>

  <div style="height:5mm"></div>

  <div class="grid2">
    <div class="card">
      <div class="label">${esc(possibleAreas && possibleAreas.label)}</div>
      <ul>
        ${(possibleAreas && possibleAreas.items || []).map((item) => `<li>${esc(item)}</li>`).join('\n        ')}
      </ul>
    </div>
    <div class="card">
      <div class="label">${esc(valueCreation && valueCreation.label)}</div>
      <p>${esc(valueCreation && valueCreation.text)}</p>
    </div>
  </div>

  <div style="height:5mm"></div>

  <div class="card">
    <div class="label">${esc(alignment && alignment.label)}</div>
    ${alignmentLines}
  </div>

  <div style="height:6mm"></div>

  <div class="insight">
    <div class="big serif">${esc(p2Insight && p2Insight.title)}</div>
    <p>${esc(p2Insight && p2Insight.body)}</p>
  </div>

  ${pageFooter(2)}
</section>

<section class="page">
  <div class="topline"><span class="eyebrow">TRUE PATH · 轨道</span><span>Page 3 of 3</span></div>
  <div class="section-title">
    <div class="n">Role 位</div>
    <h2 class="serif">Your Iron Triangle and True Path</h2>
  </div>
  <div class="rule"></div>

  <div class="triangle-wrap">
    ${ironTriangleSvg(tri && tri.shares)}

    <div>
      <div class="eyebrow">${esc(role && role.label)}</div>
      <div class="role-title serif">${esc(role && role.name)} ${esc(role && role.chinese)}</div>
      <div class="role-sub">${esc(role && role.subtitle)}</div>
      <div class="role-copy">${esc(role && role.oneLine)}</div>
      <div class="role-list">${chipList(role && role.naturalStrengths)}</div>
      <div class="role-copy">${esc(role && role.contribution)}</div>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="label">${esc(p3Scores && p3Scores.label)}</div>
      ${sharePills}
    </div>
    <div class="card">
      <div class="label">Watch-out and allies</div>
      <p><b>Watch-out:</b> ${esc(role && role.watchOut)}</p>
      <p style="margin-top:2mm"><b>Natural allies:</b> ${esc(role && role.allies)}</p>
    </div>
  </div>

  <div style="height:4mm"></div>

  <div class="grid2">
    <div class="card">
      <div class="label">${esc(gap && gap.label)}</div>
      <p>${esc(gap && gap.text)}</p>
    </div>
    <div class="card">
      <div class="label">${esc(thrive && thrive.label)}</div>
      <p>${esc(thrive && thrive.text)}</p>
      <div class="label" style="margin-top:3mm">${esc(growth && growth.label)}</div>
      <p>${esc(growth && growth.text)}</p>
    </div>
  </div>

  <div class="hero" style="margin-top:3mm; margin-bottom:3mm; padding:3.5mm 6mm;">
    <div class="lead serif">${esc(title && title.label)}</div>
    <div class="title serif" style="font-size:19pt; text-transform:none">${esc(title && title.title)}</div>
    <div class="tagline">${esc(title && title.essence)}</div>
    <div class="sub">${esc(title && title.subtitle)}</div>
  </div>

  <div class="card reflection">
    <div class="label">${esc(reflection && reflection.label)}</div>
    <ul>
      ${(reflection && reflection.items || []).map((item) => `<li>${esc(item)}</li>`).join('\n      ')}
    </ul>
  </div>

  <div class="cta">
    <div class="title serif">${esc(invite && invite.headline)}</div>
    <p>${esc(invite && invite.text)}</p>
    ${opts.qrDataUrl
      ? `<div style="display:flex;align-items:center;justify-content:center;gap:5mm;margin-top:2mm">
           <img src="${opts.qrDataUrl}" alt="Booking QR" style="width:25mm;height:25mm"/>
           <div style="text-align:left"><div class="link" style="margin-top:0"><a href="${esc(invite && invite.ctaHref)}" style="color:#7A1F2B">${esc(invite && invite.ctaLabel)}</a></div>
           <p style="margin-top:1.5mm;color:#4A4A4A">Scan the code or tap the link to book.</p></div>
         </div>`
      : `<div class="link"><a href="${esc(invite && invite.ctaHref)}" style="color:#7A1F2B">${esc(invite && invite.ctaLabel)}</a></div>`}
  </div>

  ${pageFooter(3)}
</section>

</body>
</html>`;
  }

  return Object.freeze({ buildReportHtml, talentTreeSvg, ironTriangleSvg });
});
