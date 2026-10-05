// @ts-check
/**
 * True Path — SVG visualisations.
 *
 * Talent Tree (four independent branches) and Iron Triangle (three roles as a share
 * of 100). Both are plain SVG so they render identically on screen, in print, and in
 * the server-side PDF. Animation happens once on reveal and is suppressed when the
 * visitor prefers reduced motion (Brief 11).
 */

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).TruePathSvg = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function prefersReducedMotion() {
    try {
      if (root && root.matchMedia) {
        return root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  function escapeXml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Canonical tree geometry (bundle `true-path.html`, `tree()`).
   *
   * Four branches grow from one trunk inside a fixed 260x250 footprint. Branch length encodes the
   * talent score, so the drawing reads as an organism rather than a chart, and the four labels sit
   * in fixed seats (two low on the outside, two high inside) so the tree never reflows.
   */
  const TREE = {
    width: 260,
    height: 250,
    // The trunk: a tapered silhouette from the soil line up into the crown.
    trunk: 'M121 242C125 215 127 185 126 150L134 150C133 185 135 215 139 242Z',
    trunkFill: '#5a4636',
    // Label seats, in fixed branch order (organiser, analyst, communicator, creative).
    // v2.3 D5: Analyst top-left, Communicator top-right, Organiser left, Creative right —
    // at least 24px between any pair, so labels can never merge.
    labelX: [44, 74, 186, 216],
    labelY: [120, 26, 26, 120],
    // Fan angles in degrees, measured from straight up.
    angles: [-62, -24, 24, 62],
    crownX: 130,
    limbBase: 52,
    limbRange: 60,
    minLeaves: 6,
    leafSpread: 0.3,
    limbInk: '#7a5a4a',
    limbInkLit: '#b04458',
    leafInk: '#7d7048',
    leafInkLit: '#9b2c3f',
    labelInk: '#f3ecdf',
    labelInkLit: '#e8b4be'
  };

  /** Deterministic pseudo-random in [0,1), so the foliage is irregular but never re-rolls. */
  function hashNoise(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  /**
   * Four-branch tree showing the independent Talent scores.
   *
   * Geometry is the canonical one from the approved bundle, including `hi`: the branches drawn in
   * the highlighted colour are the ones TIED with the dominant branch — EXCEPT for a balanced
   * profile, where nothing is highlighted because no single branch leads. A balanced profile must
   * not render a forced glow.
   *
   * `raw` is what "tied" is decided on (10-15 integers), never `pct`, which saturates at 100.
   *
   * @param {Record<string, number>} pct 0-100 score per category key
   * @param {Array<any>} categories talent categories ({ key, name })
   * @param {any} [options] { raw, balancedProfile, dominant, info, ariaLabel }
   */
  function talentTreeSvg(pct, categories, options) {
    const opts = options || {};
    const seats = categories || [];

    // Canonical highlight rule. Without `raw` we cannot tell ties apart, so nothing glows.
    const raw = opts.raw || null;
    const dominant = opts.dominant || null;
    const highlight = [];
    if (raw && dominant && !opts.balancedProfile && raw[dominant] !== undefined) {
      seats.forEach((category) => {
        if (raw[category.key] === raw[dominant]) highlight.push(category.key);
      });
    }

    const values = seats.map((category) =>
      Math.max(0, Math.min(100, Number(pct && pct[category.key]) || 0))
    );

    const parts = [];
    parts.push(
      `<svg class="tp-svg" viewBox="0 0 ${TREE.width} ${TREE.height}" role="img" aria-label="${escapeXml(
        opts.ariaLabel ||
          'Talent Tree: ' +
            seats.map((category, index) => category.name + ' ' + values[index] + '%').join(', ')
      )}" xmlns="http://www.w3.org/2000/svg">`
    );
    parts.push(`<path d="${TREE.trunk}" fill="${TREE.trunkFill}" />`);

    seats.forEach((category, index) => {
      const value = values[index];
      const lit = highlight.indexOf(category.key) !== -1;
      const length = TREE.limbBase + value * (TREE.limbRange / 100);
      const radians = ((TREE.angles[index] === undefined ? TREE.angles[0] : TREE.angles[index]) * Math.PI) / 180;
      const sin = Math.sin(radians);
      const cos = Math.cos(radians);
      // Two branches start low (outside), two higher up (inside), as in the canonical drawing.
      const originY = index % 3 ? 152 : 176;
      const endX = TREE.crownX + length * sin;
      const endY = originY - length * cos;
      const ctrlX = TREE.crownX + length * 0.3 * sin;
      const ctrlY = originY - length * 0.72 * cos;

      // Foliage: leaves placed along the limb's quadratic curve, alternating sides.
      let leaves = '';
      const count = TREE.minLeaves + Math.round(value * TREE.leafSpread);
      for (let j = 0; j < count; j += 1) {
        const u = 0.3 + (0.7 * j) / count;
        const inv = 1 - u;
        const px =
          inv * inv * TREE.crownX + 2 * inv * u * ctrlX + u * u * endX;
        const py = inv * inv * originY + 2 * inv * u * ctrlY + u * u * endY;
        const tx = 2 * inv * (ctrlX - TREE.crownX) + 2 * u * (endX - ctrlX);
        const ty = 2 * inv * (ctrlY - originY) + 2 * u * (endY - ctrlY);
        const theta = Math.atan2(ty, tx);
        const side = j % 2 ? 1 : -1;
        const offset = 3 + hashNoise(j + index * 50) * 8;
        const lx = px - side * offset * Math.sin(theta);
        const ly = py + side * offset * Math.cos(theta);
        const spin = (theta * 180) / Math.PI + side * (28 + hashNoise(j + 9 + index * 50) * 34);
        const opacity = (0.55 + hashNoise(j + index * 50 + 3) * 0.35).toFixed(2);
        leaves +=
          `<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="5.2" ry="2.6"` +
          ` transform="rotate(${spin.toFixed(0)} ${lx.toFixed(1)} ${ly.toFixed(1)})"` +
          ` fill="${lit ? TREE.leafInkLit : TREE.leafInk}" opacity="${opacity}" />`;
      }

      // `br` is the canonical reveal hook; the inline style only carries the (harmless in print)
      // delay and glow, so the PDF loses the animation but keeps the drawing.
      parts.push(
        `<g class="br tp-svg__limb" style="animation-delay:${(index * 0.12).toFixed(2)}s${
          lit ? ';filter:drop-shadow(0 0 5px rgba(176,68,88,.55))' : ''
        }">` +
          `<path d="M${TREE.crownX} ${originY}Q${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${endX.toFixed(
            1
          )} ${endY.toFixed(1)}" fill="none" stroke="${lit ? TREE.limbInkLit : TREE.limbInk}"` +
          ` stroke-width="${(2.2 + value * 0.055).toFixed(1)}" stroke-linecap="round" />${leaves}</g>`
      );

      // Explicit font-size/fill as well as the class: the on-screen page styles these through CSS,
      // while the PDF renderer has no CSS and would otherwise print them at the wrong size.
      // `opts.print` swaps to dark paper inks: the light beige labels are correct on the dark
      // screen but all but invisible once printed.
      // v2.3 D2/D5: two-line labels — branch name over its strength label; percentages are no
      // longer shown to visitors anywhere on the tree.
      const print = !!(opts && opts.print);
      const ink = print ? (lit ? '#7A1F2B' : '#1F1F1F') : lit ? TREE.labelInkLit : TREE.labelInk;
      const strengthLabel =
        (opts && opts.strengthLabels && opts.strengthLabels[category.key]) || '';
      const nameSize = print ? 12.5 : 10.5;
      const subSize = print ? 11 : 9.5;
      parts.push(
        `<text class="tp-svg__branch" x="${TREE.labelX[index]}" y="${TREE.labelY[index]}" fill="${ink}" font-size="${nameSize}" font-weight="${print ? 700 : 400}" text-anchor="middle">${escapeXml(
          category.name
        )}</text>`
      );
      if (strengthLabel) {
        parts.push(
          `<text class="tp-svg__score" x="${TREE.labelX[index]}" y="${
            TREE.labelY[index] + (print ? 15 : 13)
          }" fill="${ink}" font-size="${subSize}" font-weight="${print ? 700 : 600}" text-anchor="middle">${escapeXml(
            strengthLabel
          )}</text>`
        );
      }
    });

    parts.push('</svg>');
    // The explanation travels as the canonical disclosure; print CSS hides `.nop`, and the PDF
    // renderer strips it entirely so the file never carries a <details> element.
    if (opts.info) {
      parts.push(
        `<details class="info nop"><summary aria-label="About this visual">i</summary><p>${escapeXml(
          opts.info
        )}</p></details>`
      );
    }
    return parts.join('');
  }

  /**
   * Canonical triangle geometry (bundle `true-path.html`, `tri()`).
   *
   * Corner seats in the same 300x262 frame the canonical drawing uses; the visitor's shape is the
   * same outer triangle with every corner pulled toward the centroid by its role share.
   */
  const TRI = {
    width: 300,
    height: 262,
    centroid: { x: 150, y: 159 },
    // Canonical seats: commander at the apex, general bottom-left, chancellor bottom-right.
    seats: { commander: [150, 28], general: [36, 226], chancellor: [264, 226] },
    outline: '150,28 36,226 264,226',
    order: ['commander', 'general', 'chancellor'],
    // Label anchors, placed just outside each corner.
    labelAnchor: { commander: 'middle', general: 'middle', chancellor: 'middle' },
    outlineInk: '#3d3434',
    shapeFill: 'rgba(122,31,46,.3)',
    shapeStroke: '#a8823f',
    labelInk: '#a8823f'
  };

  /**
   * Iron Triangle: vertices 帅 (top), 将 (bottom-left), 相 (bottom-right).
   *
   * Each corner of the visitor's shape is pulled along the line to the centroid in proportion to
   * that role's share, so the shape reads as "where your contribution sits".
   *
   * @param {Record<string, number>} shares percentages summing to 100
   * @param {Array<any>} roles iron-triangle roles ({ key, name, glyph })
   * @param {any} [options] { animate, info, ariaLabel }
   */
  function ironTriangleSvg(shares, roles, options) {
    const opts = options || {};

    // Explicit font-size/fill so the PDF renderer (which has no stylesheet) prints the labels at
    // the same size the page shows, instead of falling back to the document default.
    const points = TRI.order
      .map((roleKey) => {
        const seat = TRI.seats[roleKey];
        const k = (Number(shares && shares[roleKey]) || 0) / 100;
        return `${(TRI.centroid.x + (seat[0] - TRI.centroid.x) * k).toFixed(1)},${(
          TRI.centroid.y +
          (seat[1] - TRI.centroid.y) * k
        ).toFixed(1)}`;
      })
      .join(' ');

    // `grow` is the canonical reveal hook for the inner shape.
    const parts = [];
    parts.push(
      `<svg class="tp-svg" viewBox="0 0 ${TRI.width} ${TRI.height}" role="img" aria-label="${escapeXml(
        opts.ariaLabel || 'Iron Triangle role shares'
      )}" xmlns="http://www.w3.org/2000/svg">`
    );
    parts.push(
      `<polygon points="${TRI.outline}" fill="none" stroke="${TRI.outlineInk}" stroke-width="2" />`
    );
    parts.push(
      `<polygon class="grow" points="${points}" fill="${TRI.shapeFill}" stroke="${TRI.shapeStroke}" stroke-width="2" />`
    );

    TRI.order.forEach((roleKey) => {
      const seat = TRI.seats[roleKey];
      const role = (roles || []).find((entry) => entry.key === roleKey);
      const glyph = role && role.glyph ? role.glyph : '';
      // The canonical label is "<glyph> <share>%"; keep the seat offsets from the canonical frame.
      const value = Number(shares && shares[roleKey]) || 0;
      const y = roleKey === 'commander' ? seat[1] - 12 : seat[1] + 22;
      parts.push(
        `<text class="tp-svg__value" x="${seat[0]}" y="${y}" fill="${TRI.labelInk}" font-size="14" text-anchor="${
          TRI.labelAnchor[roleKey]
        }">${escapeXml(glyph + ' ' + value + '%')}</text>`
      );
    });

    parts.push('</svg>');
    if (opts.info) {
      parts.push(
        `<details class="info nop"><summary aria-label="About this visual">i</summary><p>${escapeXml(
          opts.info
        )}</p></details>`
      );
    }
    return parts.join('');
  }

  /**
   * Small horizontal bar used by the snapshots and the report.
   */
  function scoreBar(label, value, options) {
    const opts = options || {};
    const max = opts.max !== undefined ? opts.max : 100;
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    const balancedClass = opts.balanced ? ' tp-bar--balanced' : '';
    return (
      `<div class="tp-bar${balancedClass}">` +
      `<div class="tp-bar__head"><span class="tp-bar__name">${escapeXml(label)}</span>` +
      `<span class="tp-bar__value">${escapeXml(value)}</span></div>` +
      `<div class="tp-bar__track"><span class="tp-bar__fill" data-value="${pct}" style="width:${pct}%"></span></div>` +
      '</div>'
    );
  }

  return Object.freeze({
    talentTreeSvg,
    ironTriangleSvg,
    scoreBar,
    prefersReducedMotion,
    escapeXml
  });
});
