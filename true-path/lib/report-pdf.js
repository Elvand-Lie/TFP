// @ts-check
/**
 * True Path — PDF document definition (LOGIC ONLY).
 *
 * Turns the neutral page model from `report-model.js` into a pdfmake document definition. It is
 * deliberately pure: no pdfmake import, no font registration, no file system. That keeps it
 * testable in Node and guarantees the PDF cannot drift from the on-screen report — the browser
 * view (`assets/true-path-report.js`) and this module both read the SAME model and the SAME SVG.
 *
 * `api/true-path-pdf-generator.ts` supplies the two platform-dependent pieces: the pdfmake
 * instance and the embedded CJK font.
 *
 * Brief 8 / 17: three pages, journey order, Chinese characters render, and the layout matches
 * what the visitor read online.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).TruePathReportPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Brand palette (Brief 11), shared with the on-screen report. */
  const C = {
    crimson: '#710101',
    gold: '#C6A96B',
    ivory: '#F5F2ED',
    medGrey: '#E8E5E0',
    textDark: '#1C1C1E',
    textMed: '#555555',
    textLight: '#888580',
    panel: '#FDFCFB'
  };

  const FONT = 'NotoSansSC';

  /**
   * Small-caps style label, matching `.tp-label` on the page.
   * @param {string} [text]
   * @returns {Array<any>}
   */
  function label(text) {
    if (!text) return [];
    return [
      {
        text: String(text).toUpperCase(),
        fontSize: 7.5,
        bold: true,
        color: C.gold,
        characterSpacing: 0.6,
        margin: [0, 0, 0, 0]
      }
    ];
  }

  /**
   * A bordered panel, the PDF equivalent of `.tp-panel`.
   * @param {Array<any>} content
   * @returns {any}
   */
  function panel(content) {
    return {
      table: { widths: ['*'], body: [[{ stack: content, margin: [8, 3, 8, 3] }]] },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.8 : 0),
        vLineWidth: (i) => (i === 0 || i === 1 ? 0.8 : 0),
        hLineColor: () => C.medGrey,
        vLineColor: () => C.medGrey,
        fillColor: () => C.panel,
        paddingTop: () => 0,
        paddingBottom: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0
      },
      margin: [0, 0, 0, 1]
    };
  }

  /** A score/share bar, drawn as vector rectangles so it needs no glyphs and cannot tofu. */
  function scoreBar(value, max) {
    const pct = Math.max(0, Math.min(100, ((Number(value) || 0) / (max || 100)) * 100));
    const width = 300;
    return {
      canvas: [
        { type: 'rect', x: 0, y: 1, w: width, h: 3, r: 1.5, color: C.medGrey },
        {
          type: 'rect',
          x: 0,
          y: 1,
          w: (width * pct) / 100,
          h: 3,
          r: 1.5,
          color: pct >= 100 ? C.crimson : C.gold
        }
      ],
      margin: [0, 1, 0, 1]
    };
  }

  /** Talent percentages and role shares use the same bar, with different maxima. */
  function scoresBlock(block) {
    const isShare = (block.rows || []).every(
      (row) => typeof row.value === 'number' && row.value <= 100
    );
    const body = (block.rows || []).map((row) => [
      { text: String(row.name), fontSize: 9, color: C.textDark, margin: [0, 3, 8, 3] },
      {
        text: isShare ? String(row.value) + '%' : String(row.value),
        fontSize: 9,
        bold: true,
        alignment: 'right',
        color: C.crimson,
        width: 34,
        margin: [0, 3, 0, 3]
      },
      { stack: [scoreBar(row.value, isShare ? 100 : 15)], width: 60, margin: [6, 0, 0, 0] }
    ]);

    return panel(
      label(block.label).concat([
        { table: { widths: ['*', 34, 66], body }, layout: 'noBorders', margin: [0, 0, 0, 0] }
      ])
    );
  }

  /**
   * The True Path title, the closing "result" of the journey. Built here so the block can carry
   * its own copy instead of being assembled by the caller.
   */
  function titleBlock(block) {
    const content = label(block.label).concat([
      {
        text: String(block.title || ''),
        fontSize: 17,
        bold: true,
        color: C.crimson,
        alignment: 'center',
        margin: [0, 0, 0, 2]
      }
    ]);

    if (block.essence) {
      content.push({
        text: String(block.essence),
        fontSize: 10,
        color: C.crimson,
        alignment: 'center',
        margin: [0, 0, 0, 2]
      });
    }
    if (block.subtitle) {
      content.push({
        text: String(block.subtitle),
        fontSize: 8.5,
        color: C.textLight,
        alignment: 'center'
      });
    }

    return {
      table: { widths: ['*'], body: [[{ stack: content, margin: [8, 4, 8, 4] }]] },
      layout: {
        hLineWidth: () => 1.2,
        vLineWidth: () => 1.2,
        hLineColor: () => C.gold,
        vLineColor: () => C.gold,
        fillColor: () => C.ivory,
        paddingTop: () => 0,
        paddingBottom: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0
      },
      margin: [0, 2, 0, 6]
    };
  }

  /**
   * Map one neutral model block onto pdfmake content. Mirrors `renderBlock` in
   * `assets/true-path-report.js`, so both read the same model into the same structure.
   *
   * @param {any} block
   * @param {any} ctx { Svg }
   */
  function renderBlock(block, ctx) {
    if (!block) return null;

    switch (block.kind) {
      case 'talent-tree':
        return { svg: ctx.Svg.talentTreeSvg(block.pct, block.categories), width: 300, alignment: 'center', margin: [0, 2, 0, 8] };

      case 'iron-triangle':
        return { svg: ctx.Svg.ironTriangleSvg(block.shares, block.roles), width: 150, alignment: 'center', margin: [0, 1, 0, 3] };

      case 'scores':
        return scoresBlock(block);

      case 'pair': {
        const joined = block.coDominant
          ? block.dominant + ' = ' + block.secondary
          : block.dominant + ' + ' + block.secondary;
        /** @type {Array<any>} */
        const content = label(block.label).concat([
          { text: joined, fontSize: 14, bold: true, color: C.textDark, margin: [0, 0, 0, 4] }
        ]);
        if (block.archetype) {
          content.push({
            text: [
              { text: block.archetype.name, bold: true, color: C.crimson },
              { text: ' \u2014 ' + block.archetype.essence, color: C.textMed }
            ],
            fontSize: 9.5,
            margin: [0, 0, 0, 2]
          });
        }
        if (block.balancedProfile) {
          content.push({ text: 'Balanced profile', fontSize: 8.5, color: C.textLight });
        }
        return panel(content);
      }

      case 'selections':
        return panel(
          label(block.label).concat([
            {
              table: {
                widths: ['35%', '*'],
                body: block.rows.map((row) => [
                  { text: String(row.label), fontSize: 9, color: C.textMed, margin: [0, 3, 8, 3] },
                  { text: String(row.value), fontSize: 9.5, color: C.textDark, margin: [0, 3, 0, 3] }
                ])
              },
              layout: 'noBorders'
            }
          ])
        );

      case 'list-block': {
        const items = (block.items || []).filter(Boolean);
        return panel(
          label(block.label).concat([
            items.length
              ? {
                  ul: items.map((item) => ({
                    text: String(item),
                    fontSize: 9.5,
                    color: C.textDark,
                    margin: [0, 1, 0, 1]
                  }))
                }
              : { text: '\u2014', fontSize: 9.5, color: C.textLight }
          ])
        );
      }

      case 'text':
        return panel(
          label(block.label).concat([
            { text: String(block.text || '\u2014'), fontSize: 10, color: C.textDark, lineHeight: 1.35 }
          ])
        );

      case 'role-card': {
        /** @type {Array<any>} */
        const content = label(block.label).concat([
          {
            text: [
              { text: String(block.glyph || '') + '  ', fontSize: 15, color: C.gold },
              { text: block.name + ' ' + block.chinese, fontSize: 13, bold: true, color: C.textDark }
            ],
            margin: [0, 0, 0, 1]
          },
          { text: String(block.subtitle || ''), fontSize: 8.5, color: C.textLight, margin: [0, 0, 0, 2] },
          { text: String(block.essence || ''), fontSize: 10, color: C.crimson, margin: [0, 0, 0, 2] },
          { text: String(block.oneLine || ''), fontSize: 9, color: C.textMed, margin: [0, 0, 0, 2] }
        ]);
        if ((block.naturalStrengths || []).length) {
          // Inline rather than a bulleted list: same content, a fraction of the vertical cost.
          content.push({
            text: (block.naturalStrengths || []).map(String).join('   \u00b7   '),
            fontSize: 9,
            color: C.textDark,
            margin: [0, 0, 0, 2]
          });
        }
        content.push({
          text: String(block.contribution || ''),
          fontSize: 9,
          color: C.textMed,
          margin: [0, 1, 0, 1]
        });
        if (block.watchOut) {
          content.push({
            text: 'Watch-out: ' + String(block.watchOut),
            fontSize: 8.5,
            color: C.textLight,
            margin: [0, 1, 0, 0]
          });
        }
        return panel(content);
      }

      case 'title':
        return titleBlock(block);

      case 'invite':
        // Brief 8/11: the soft consultation invite closes page 3. The PDF keeps it as a link.
        return {
          stack: [
            { text: String(block.headline || ''), fontSize: 13, bold: true, color: C.crimson, alignment: 'center', margin: [0, 1, 0, 3] },
            { text: String(block.text || ''), fontSize: 9.5, color: C.textMed, alignment: 'center', margin: [0, 0, 0, 4] },
            {
              text: String(block.ctaLabel || ''),
              fontSize: 10,
              bold: true,
              color: C.crimson,
              alignment: 'center',
              link: block.ctaHref || '/contact',
              decoration: 'underline'
            },
            { text: '', margin: [0, 0, 0, 1] }
          ]
        };

      default:
        return null;
    }
  }

  /** Page heading: a gold rule, "PAGE n", and the config-driven page title. */
  function pageHeading(page) {
    return {
      columns: [
        {
          width: 'auto',
          canvas: [{ type: 'line', x1: 0, y1: 14, x2: 34, y2: 14, lineWidth: 1.6, lineColor: C.gold }]
        },
        {
          width: '*',
          stack: [
            { text: 'PAGE ' + String(page.n), fontSize: 7.5, bold: true, color: C.gold, characterSpacing: 0.6 },
            { text: String(page.heading), fontSize: 15, bold: true, color: C.crimson }
          ]
        }
      ],
      margin: [0,0,0,4]
    };
  }

  /**
   * Build the pdfmake document definition for a report model.
   *
   * @param {any} model output of ReportModel.buildReportModel
   * @param {any} ctx { Svg } — the same SVG module the browser renders with
   */
  function buildReportPdfDefinition(model, ctx) {
    /** @type {Array<any>} */
    const content = [];

    content.push({
      text: 'TRUE PATH \u00b7 \u8f68\u9053',
      fontSize: 8,
      bold: true,
      color: C.gold,
      characterSpacing: 1.2,
      alignment: 'center',
      margin: [0, 0, 0, 3]
    });
    content.push({
      text: String(model.headline || 'Your 3-Page True Path Report'),
      fontSize: 15,
      bold: true,
      color: C.crimson,
      alignment: 'center',
      margin: [0, 0, 0, 4]
    });
    content.push({
      text:
        String(model.resultId || '') +
        (model.createdAt ? '  \u00b7  ' + String(model.createdAt).slice(0, 10) : ''),
      fontSize: 8,
      color: C.textLight,
      alignment: 'center',
      margin: [0, 0, 0, 6]
    });

    model.pages.forEach((page, index) => {
      const heading = pageHeading(page);
      // One page per journey stage (Brief 8), so page 2 and 3 start fresh.
      if (index > 0) heading.pageBreak = 'before';
      content.push(heading);

      page.blocks.forEach((block) => {
        const rendered = renderBlock(block, ctx);
        if (rendered) content.push(rendered);
      });
    });

    content.push({
      text: String(model.disclaimer || ''),
      fontSize: 8,
      italics: true,
      color: C.textLight,
      alignment: 'center',
      margin: [0, 8, 0, 4]
    });

    return {
      pageSize: 'A4',
      pageMargins: [34, 20, 34, 28],
      // lineHeight is 1.05, not the 1.14 a screen would use: page 3's copy grows with the number
      // of Ikigai picks, and at 1.14 it spills past the page bottom for a large share of valid
      // journeys, so the document rendered 4 pages while declaring 3 (and cta.json promises
      // "3-Page"). 1.05 keeps every valid journey — 1..3 picks on each of the 4 screens, all 5
      // talent levels and all 3 roles, 1215 shapes — at exactly 3 pages without trimming copy.
      defaultStyle: { font: FONT, fontSize: 9, color: C.textDark, lineHeight: 1.05 },
      info: {
        title: String(model.headline || 'True Path Report'),
        author: 'The Full Picture',
        subject: 'True Path \u8f68\u9053 \u2014 3-page report',
        creator: 'The Full Picture'
      },
      content,
      footer: (currentPage, pageCount) => ({
        columns: [
          { text: String(model.brand || ''), fontSize: 7.5, color: C.textLight, margin: [38, 0, 0, 0] },
          {
            text: currentPage + ' / ' + pageCount,
            fontSize: 7.5,
            color: C.textLight,
            alignment: 'right',
            margin: [0, 0, 38, 0]
          }
        ],
        margin: [0, 14, 0, 0]
      })
    };
  }

  /**
   * Render the report to a PDF buffer.
   *
   * pdfmake and the font location are injected rather than imported, so this module keeps no
   * platform dependency (a test or a different host can supply its own) while still owning the
   * whole render pipeline. `api/true-path-pdf-generator.ts` is the production caller.
   *
   * @param {any} model output of ReportModel.buildReportModel
   * @param {any} ctx { Svg }
   * @param {any} deps { pdfmake, fontPath } — fontPath is the on-disk Noto Sans SC file
   */
  function renderReportPdf(model, ctx, deps) {
    if (!deps || !deps.pdfmake) throw new Error('renderReportPdf requires a pdfmake instance');
    if (!deps.fontPath || typeof deps.fontPath !== 'string') {
      // Without the CJK font, 才 / 道 / 位 / 帅 / 将 / 相 would print as tofu boxes (Brief 17).
      throw new Error('renderReportPdf requires a CJK font path');
    }

    const pdfmake = deps.pdfmake;
    // pdfmake resolves fonts from a path or URL, so the file has to ship with the function.
    pdfmake.fonts = pdfmake.fonts || {};
    pdfmake.fonts[FONT] = {
      normal: deps.fontPath,
      bold: deps.fontPath,
      italics: deps.fontPath,
      bolditalics: deps.fontPath
    };

    const definition = buildReportPdfDefinition(model, ctx);
    return pdfmake.createPdf(definition).getBuffer();
  }

  return Object.freeze({
    COLORS: C,
    FONT,
    buildReportPdfDefinition,
    renderReportPdf,
    renderBlock,
    scoreBar
  });
});
