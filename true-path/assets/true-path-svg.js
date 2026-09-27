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
   * Four-branch tree showing the independent Talent scores.
   * A branch is drawn as a limb whose length encodes pct (0-100).
   *
   * @param {Record<string, number>} pct
   * @param {Array<any>} categories talent.json categories
   * @param {any} [options]
   */
  function talentTreeSvg(pct, categories, options) {
    const opts = options || {};
    const width = 420;
    const height = 300;
    const cx = width / 2;
    const baseY = height - 46;
    const maxLen = 168;

    // Two branches left, two right, fanned out from the trunk.
    const layout = [
      { angle: -152, anchor: 'end' },
      { angle: -118, anchor: 'end' },
      { angle: -62, anchor: 'start' },
      { angle: -28, anchor: 'start' }
    ];

    const parts = [];
    parts.push(
      `<svg class="tp-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(
        opts.ariaLabel || 'Talent Tree scores'
      )}" xmlns="http://www.w3.org/2000/svg">`
    );

    // Trunk
    parts.push(
      `<line x1="${cx}" y1="${baseY}" x2="${cx}" y2="${baseY - 34}" stroke="#C6A96B" stroke-width="2" stroke-linecap="round" />`
    );
    parts.push(
      `<circle cx="${cx}" cy="${baseY}" r="4" fill="#710101" stroke="#C6A96B" stroke-width="1.5" />`
    );

    categories.forEach((category, index) => {
      const seat = layout[index] || layout[layout.length - 1];
      const value = Math.max(0, Math.min(100, Number(pct[category.key]) || 0));
      const length = (value / 100) * maxLen;
      const radians = (seat.angle * Math.PI) / 180;
      const originX = cx;
      const originY = baseY - 30;
      const endX = originX + Math.cos(radians) * length;
      const endY = originY + Math.sin(radians) * length;

      // Curve control point for an organic limb.
      const midX = originX + Math.cos(radians) * (length * 0.55);
      const midY = originY + Math.sin(radians) * (length * 0.55) - 14;

      const path = `M ${originX} ${originY} Q ${midX} ${midY} ${endX} ${endY}`;
      const emphasised = value >= 70;

      parts.push(
        `<path d="${path}" fill="none" stroke="${emphasised ? '#E53939' : '#710101'}" stroke-width="${
          emphasised ? 4 : 3
        }" stroke-linecap="round" opacity="0.92" />`
      );
      parts.push(`<circle cx="${endX}" cy="${endY}" r="3.5" fill="#C6A96B" />`);

      // Label placement depends on which side the limb grew.
      const labelX = endX + (seat.anchor === 'end' ? -8 : 8);
      const labelY = endY - 8;
      parts.push(
        `<text class="tp-svg__branch" x="${labelX}" y="${labelY}" text-anchor="${seat.anchor}">${escapeXml(
          category.name
        )}</text>`
      );
      parts.push(
        `<text class="tp-svg__score" x="${labelX}" y="${labelY + 16}" text-anchor="${seat.anchor}">${value}</text>`
      );
    });

    parts.push('</svg>');
    return parts.join('');
  }

  /**
   * Iron Triangle: vertices 帅 (top), 将 (bottom-left), 相 (bottom-right).
   * The visitor's three shares are plotted as an inner filled shape, plus % labels.
   *
   * @param {Record<string, number>} shares percentages summing to 100
   * @param {Array<any>} roles iron-triangle.json roles (commander, general, chancellor)
   * @param {{ animate?: boolean, ariaLabel?: string }} [options]
   */
  function ironTriangleSvg(shares, roles, options) {
    const opts = options || {};
    const width = 420;
    const height = 340;
    const cx = width / 2;
    const cy = 168;
    const radius = 118;

    // Place commander at the apex, general bottom-left, chancellor bottom-right.
    const seatByRole = {
      commander: -90,
      general: 150,
      chancellor: 30
    };

    function pointFor(roleKey, scale) {
      const angle = (seatByRole[roleKey] * Math.PI) / 180;
      const r = radius * scale;
      return {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r
      };
    }

    const total = ['commander', 'general', 'chancellor'].reduce(
      (acc, role) => acc + (Number(shares[role]) || 0),
      0
    );
    const safeTotal = total > 0 ? total : 1;

    const parts = [];
    parts.push(
      `<svg class="tp-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(
        opts.ariaLabel || 'Iron Triangle role shares'
      )}" xmlns="http://www.w3.org/2000/svg">`
    );

    const outer = ['commander', 'general', 'chancellor'].map((role) => pointFor(role, 1));
    const outerPath = `M ${outer[0].x} ${outer[0].y} L ${outer[1].x} ${outer[1].y} L ${outer[2].x} ${outer[2].y} Z`;

    parts.push(
      `<path d="${outerPath}" fill="rgba(198,169,107,0.05)" stroke="#C6A96B" stroke-width="1.5" />`
    );

    // Median guides from each vertex to the opposite midpoint (classic triangle read).
    const midAB = { x: (outer[0].x + outer[1].x) / 2, y: (outer[0].y + outer[1].y) / 2 };
    const midBC = { x: (outer[1].x + outer[2].x) / 2, y: (outer[1].y + outer[2].y) / 2 };
    const midCA = { x: (outer[2].x + outer[0].x) / 2, y: (outer[2].y + outer[0].y) / 2 };
    parts.push(
      `<path d="M ${outer[0].x} ${outer[0].y} L ${midBC.x} ${midBC.y}" stroke="rgba(198,169,107,0.16)" stroke-width="1" fill="none" />` +
        `<path d="M ${outer[1].x} ${outer[1].y} L ${midCA.x} ${midCA.y}" stroke="rgba(198,169,107,0.16)" stroke-width="1" fill="none" />` +
        `<path d="M ${outer[2].x} ${outer[2].y} L ${midAB.x} ${midAB.y}" stroke="rgba(198,169,107,0.16)" stroke-width="1" fill="none" />`
    );

    // Inner shape: each vertex pulled toward the centre proportionally to its share.
    const inner = ['commander', 'general', 'chancellor'].map((role) => {
      const scale = Math.max(0.12, (Number(shares[role]) || 0) / safeTotal);
      const angle = (seatByRole[role] * Math.PI) / 180;
      // Distance from centre grows with the share (min 25% of radius, max full radius).
      const r = radius * (0.25 + 0.75 * scale);
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    });
    const innerPath = `M ${inner[0].x} ${inner[0].y} L ${inner[1].x} ${inner[1].y} L ${inner[2].x} ${inner[2].y} Z`;

    const animate = opts.animate !== false && !prefersReducedMotion();
    parts.push(
      `<path d="${innerPath}" fill="rgba(113,1,1,0.30)" stroke="#C6A96B" stroke-width="1.5"${
        animate ? ' transform-origin="center" opacity="0"' : ''
      } />`
    );

    // Vertex labels, glyphs and % values.
    ['commander', 'general', 'chancellor'].forEach((roleKey) => {
      const role = roles.find((entry) => entry.key === roleKey) || { name: roleKey, glyph: '' };
      const outward = pointFor(roleKey, 1.34);
      const anchor = roleKey === 'commander' ? 'middle' : roleKey === 'general' ? 'end' : 'start';

      parts.push(
        `<text class="tp-svg__glyph" x="${outward.x}" y="${outward.y - 12}" text-anchor="${anchor}">${escapeXml(
          role.glyph
        )}</text>`
      );
      parts.push(
        `<text class="tp-svg__label" x="${outward.x}" y="${outward.y + 8}" text-anchor="${anchor}">${escapeXml(
          role.name
        )}</text>`
      );
      parts.push(
        `<text class="tp-svg__value" x="${outward.x}" y="${outward.y + 28}" text-anchor="${anchor}">${
          Number(shares[roleKey]) || 0
        }%</text>`
      );
    });

    parts.push('</svg>');
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
