// @ts-check
/**
 * True Path — PDF document definition (LOGIC ONLY).
 *
 * Turns the neutral page model from `report-model.js` into a pdfmake document definition. It is
 * deliberately pure: no pdfmake import, no font registration, no file system. That keeps it
 * testable in Node and guarantees the PDF cannot drift from the on-screen report — the browser
 * view (`assets/true-path-app.js`) and this module use the same configuration and SVG geometry.
 *
 * `true-path/lib/server/pdf-generator.ts` supplies the two platform-dependent pieces: the pdfmake
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

  /** Print palette (v2.2 C2): dark text on white, gold for lines and bars only. */
  const C = {
    crimson: '#710101',
    burgundy: '#7A1F2B',
    gold: '#C6A96B',
    ivory: '#F5F2ED',
    medGrey: '#E8E5E0',
    textDark: '#1F1F1F',
    textMed: '#4A4A4A',
    textLight: '#4A4A4A',
    panel: '#FAF7F2'
  };

  const FONT = 'NotoSansSC';
  // Display serif for the Latin-only headings (hero title, section titles, True Path title),
  // matching the on-screen Cormorant Garamond. Registered only when the caller supplies a font
  // file; otherwise every heading falls back to the CJK face so the report still renders.
  const SERIF = 'Cormorant';
  let serifActive = false;
  /** The display face actually registered for this render. */
  function display() { return serifActive ? SERIF : FONT; }
  /** The serif face carries no CJK glyphs — any string with Han characters stays in the CJK face. */
  function displaySafe(text) {
    return /[一-鿿　-〿＀-￯]/.test(String(text)) ? FONT : display();
  }

  /**
   * v2.2 C9: the embedded CJK font draws typographic quotes and apostrophes with full-width
   * spacing ("you’ re"). ASCII punctuation is proportional in the same font, so the print layer
   * normalises the typographic variants; the site keeps the typographic forms.
   */
  function latinizePunctuation(value) {
    return String(value)
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”‟]/g, '"')
      .replace(/…/g, '...')
      .replace(/[​  ]/g, ' ');
  }

  /** Deeply normalise every string in the pdfmake content tree (C9). */
  function sanitizeContent(node) {
    if (typeof node === 'string') return latinizePunctuation(node);
    if (Array.isArray(node)) return node.map(sanitizeContent);
    if (node && typeof node === 'object') {
      const out = {};
      for (const key of Object.keys(node)) out[key] = sanitizeContent(node[key]);
      return out;
    }
    return node;
  }

  /**
   * Small-caps style label, matching `.tp-label` on the page.
   * v2.2 C2: section labels print burgundy bold — never pale gold.
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
        color: C.burgundy,
        characterSpacing: 0.6,
        margin: [0, 0, 0, 0]
      }
    ];
  }

  /**
   * A bordered panel, the PDF equivalent of `.tp-panel`.
   *
   * The 1pt inter-panel gap the screen can afford is removed here: page 3 stacks seven panels and
   * the report is capped at three pages, so the gap is exactly the kind of pure spacing that has to
   * give way before any copy does.
   * @param {Array<any>} content
   * @returns {any}
   */
  function panel(content) {
    return {
      table: { widths: ['*'], body: [[{ stack: content, margin: [8, 2, 8, 2] }]] },
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
      margin: [0, 0, 0, 0]
    };
  }

  /** A score/share bar, drawn as vector rectangles so it needs no glyphs and cannot tofu.
   *  Colours follow the reference: talent bars burgundy; role shares gold with a burgundy primary. */
  function scoreBar(value, max, fillColor) {
    const pct = Math.max(0, Math.min(100, ((Number(value) || 0) / (max || 100)) * 100));
    const width = 60;
    return {
      canvas: [
        { type: 'rect', x: 0, y: 1, w: width, h: 3.5, r: 1.75, color: '#E7E1DA' },
        {
          type: 'rect',
          x: 0,
          y: 1,
          w: (width * pct) / 100,
          h: 3.5,
          r: 1.75,
          color: fillColor || C.gold
        }
      ],
      margin: [0, 1, 0, 1]
    };
  }

  /** Talent percentages and role shares use the same bar, with different maxima and colours.
   *  Role shares total exactly 100; talent percentages do not, so the sum tells them apart. */
  function scoresBlock(block) {
    const rows = block.rows || [];
    const total = rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
    const isShare = total === 100;
    // v2.3 D2: Talent rows carry visitor-facing labels instead of bare percentages. Iron
    // Triangle rows are shares of a whole and keep their %.
    const hasLabels = rows.every((row) => row.label);
    const maxRow = isShare
      ? rows.reduce((best, row) => (Number(row.value) > Number(best.value) ? row : best), rows[0] || {})
      : null;
    const barColor = (row) =>
      isShare ? (row === maxRow ? C.burgundy : C.gold) : C.burgundy;
    // v2.3 D2: a 0–19 band shows a minimum visible 8% sliver so the bar is never empty.
    const barFill = (row) => {
      const v = Number(row.value) || 0;
      return hasLabels && v < 8 ? 8 : v;
    };
    const body = rows.map((row) => [
      { text: String(row.name), fontSize: 8.8, color: C.textDark, margin: [0, 3, 8, 3] },
      {
        text: hasLabels ? String(row.label) : isPct(isShare, rows) ? String(row.value) + '%' : String(row.value),
        fontSize: 8.8,
        bold: true,
        alignment: 'right',
        color: C.textDark,
        width: 58,
        margin: [0, 3, 0, 3]
      },
      { stack: [scoreBar(barFill(row), 100, barColor(row))], width: 60, margin: [6, 0, 0, 0] }
    ]);

    return panel(
      label(block.label).concat([
        { table: { widths: ['*', 58, 66], body }, layout: 'noBorders', margin: [0, 0, 0, 0] }
      ])
    );
  }

  function isPct(isShare, rows) {
    return isShare || rows.every((row) => Number(row.value) >= 0 && Number(row.value) <= 100);
  }

  /**
   * The True Path title, the closing "result" of the journey. Built here so the block can carry
   * its own copy instead of being assembled by the caller.
   */
  function titleBlock(block) {
    const content = label(block.label).concat([
      {
        text: String(block.title || ''),
        font: displaySafe(block.title),
        fontSize: 22,
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
   * Drop the canonical `<details class="info nop">` disclosures from an SVG before it goes into the
   * PDF. They are an on-screen affordance: print CSS hides them, and a PDF has no disclosure widget,
   * so what remains would be an "i" marker and a sentence stranded outside any visual context.
   * The copy itself is carried as report text instead.
   */
  function stripSvgDisclosures(markup) {
    return String(markup || '').replace(/<details[\s\S]*?<\/details>/gi, '');
  }

  /**
   * Map one neutral model block onto pdfmake content. Mirrors `renderBlock` in
   * the approved on-screen report, using the shared model and SVG geometry.
   *
   * @param {any} block
   * @param {any} ctx { Svg }
   */
  function renderBlock(block, ctx) {
    if (!block) return null;

    switch (block.kind) {
      case 'talent-tree':
        // The canonical highlight rule (and the balanced-profile "no glow" case) is decided from the
        // raw scores, so they travel with the block; a balanced profile renders with no highlight.
        // v2.3 D2: the strengthLabels map feeds the two-line tree labels (no bare percentages).
        return {
          svg: stripSvgDisclosures(
            ctx.Svg.talentTreeSvg(block.pct, block.categories, {
              raw: block.raw,
              dominant: block.dominant,
              balancedProfile: block.balancedProfile,
              print: true,
              strengthLabels: block.strengthLabels || {},
              ariaLabel: block.ariaLabel || block.label || 'Talent Tree'
            })
          ),
          width: 300,
          alignment: 'center',
          margin: [0, 2, 0, 8]
        };

      case 'iron-triangle':
        return {
          svg: stripSvgDisclosures(
            ctx.Svg.ironTriangleSvg(block.shares, block.roles, {
              ariaLabel: block.ariaLabel || block.label || 'Iron Triangle'
            })
          ),
          width: 170,
          alignment: 'center',
          margin: [0, 1, 0, 3]
        };

      case 'scores':
        return scoresBlock(block);

      case 'hero':
        // v2.2 C3: the headline result opens page 1.
        /** @type {Array<any>} */
        {
          const heroContent = [];
          if (block.preparedFor) {
            heroContent.push({
              text: String(block.preparedFor),
              fontSize: 9,
              color: C.textMed,
              alignment: 'center',
              margin: [0, 0, 0, 2]
            });
          }
          heroContent.push({
            text: String(block.intro || ''),
            font: displaySafe(block.intro),
            fontSize: 11,
            color: C.textDark,
            alignment: 'center',
            margin: [0, 0, 0, 2]
          });
          heroContent.push({
            text: String(block.title || '').toUpperCase(),
            font: displaySafe(block.title),
            fontSize: 27,
            bold: true,
            characterSpacing: 1,
            color: C.burgundy,
            alignment: 'center',
            margin: [0, 0, 0, 2]
          });
          if (block.tagline) {
            heroContent.push({
              text: String(block.tagline),
              fontSize: 10,
              color: C.textDark,
              alignment: 'center',
              margin: [0, 0, 0, 2]
            });
          }
          heroContent.push({
            text: String(block.subtitle || ''),
            fontSize: 8.5,
            color: C.textMed,
            alignment: 'center'
          });
          return {
            table: { widths: ['*'], body: [[{ stack: heroContent, margin: [8, 4, 8, 5] }]] },
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
            margin: [0, 0, 0, 6]
          };
        }

      case 'pair': {
        // Canonical page 1: the heading reads the tree, the lead line interprets it, and v2.2 C10
        // carries one natural-strengths sentence instead of raw lists.
        /** @type {Array<any>} */
        const content = label(block.label).concat([
          {
            text: String(block.archetypeHeading || ''),
            fontSize: 14,
            bold: true,
            color: C.textDark,
            margin: [0, 0, 0, 3]
          }
        ]);
        if (block.leadLine) {
          content.push({ text: String(block.leadLine), fontSize: 10, color: C.textDark, margin: [0, 0, 0, 3] });
        }
        const joined = block.coDominant
          ? block.dominant + ' = ' + block.secondary
          : block.dominant + ' + ' + block.secondary;
        content.push({ text: joined, fontSize: 9, color: C.textMed, margin: [0, 0, 0, 2] });
        if (block.strengthsSentence) {
          content.push({
            text: String(block.strengthsSentence),
            fontSize: 9.5,
            color: C.textDark,
            margin: [0, 0, 0, 2]
          });
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
            // v2.2 C12: the heading reads "Commander 帅才"; the single glyph is a separate badge.
            text: [
              { text: String(block.glyph || '') + '  ', fontSize: 15, color: C.burgundy },
              { text: block.name + ' ' + block.chinese, fontSize: 13, bold: true, color: C.textDark }
            ],
            margin: [0, 0, 0, 1]
          },
          { text: String(block.subtitle || ''), fontSize: 8.5, color: C.textLight, margin: [0, 0, 0, 2] },
          { text: String(block.essence || ''), fontSize: 10, color: C.crimson, margin: [0, 0, 0, 2] },
          { text: String(block.oneLine || ''), fontSize: 9, color: C.textMed, margin: [0, 0, 0, 2] }
        ]);
        if ((block.naturalStrengths || []).length) {
          // The reference's role chips: strengths as outlined tags instead of a sentence.
          content.push(chipTable((block.naturalStrengths || []).map(String)));
        }
        content.push({
          text: String(block.contribution || ''),
          fontSize: 9,
          color: C.textMed,
          margin: [0, 1, 0, 1]
        });
        if (block.allies) {
          // Canonical role box: natural allies are part of the role's read (who covers your edge).
          content.push({
            text: 'Natural allies: ' + String(block.allies),
            fontSize: 9,
            color: C.textDark,
            margin: [0, 1, 0, 1]
          });
        }
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

      case 'invite': {
        // The soft consultation invite closes page 4. v2.3: the QR code is cancelled — the
        // button/link system carries the destination, with no QR markup anywhere.
        /** @type {Array<any>} */
        const stack = [
          { text: String(block.headline || ''), font: displaySafe(block.headline), fontSize: 13.5, color: C.burgundy, alignment: 'center', margin: [0, 1, 0, 3] },
          { text: String(block.text || ''), fontSize: 9.5, color: C.textMed, alignment: 'center', margin: [0, 0, 0, 4] },
          {
            text: String(block.ctaLabel || ''),
            fontSize: 10,
            bold: true,
            color: C.crimson,
            alignment: 'center',
            link: block.ctaHref || '/contact',
            decoration: 'underline'
          }
        ];
        stack.push({ text: '', margin: [0, 0, 0, 1] });
        // The reference's .cta: a gold-bordered panel, not bare centred text.
        return {
          table: { widths: ['*'], body: [[{ stack, margin: [6, 4, 6, 4] }]] },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => C.gold,
            vLineColor: () => C.gold,
            fillColor: () => C.panel,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0
          },
          margin: [0, 2, 0, 0]
        };
      }

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
            { text: 'PAGE ' + String(page.n), fontSize: 7.5, bold: true, color: C.burgundy, characterSpacing: 0.6 },
            { text: String(page.heading), fontSize: 15, bold: true, color: C.crimson }
          ]
        }
      ],
      margin: [0,0,0,4]
    };
  }

  /**
   * A STABLE timestamp for the PDF metadata.
   *
   * pdfkit stamps `CreationDate: new Date()` into every document it opens, and it derives the PDF
   * file ID from that timestamp (plus the info dictionary), so two renders of the SAME record —
   * a Resend retry, a re-download — produced different bytes and therefore different attachment
   * bytes for the same visitor. Pinning the instant to the record's own `createdAt` makes the
   * whole document byte-identical across renders and wallclock time.
   *
   * @param {any} value ISO string, epoch millis or Date
   * @returns {Date} a valid Date — never an Invalid Date, which pdfkit would print as "NaN"
   */
  function stableDate(value) {
    let parsed = null;
    if (value instanceof Date) {
      parsed = new Date(value.getTime());
    } else if (typeof value === 'number' && isFinite(value)) {
      parsed = new Date(value);
    } else if (typeof value === 'string' && value.trim()) {
      const candidate = new Date(value);
      if (!isNaN(candidate.getTime())) parsed = candidate;
    }
    // The FALLBACK must be a fixed instant too: falling back to the current time would reintroduce
    // exactly the per-render drift this function exists to remove. Epoch 0 is the conventional
    // "unknown timestamp" sentinel.
    if (!parsed || isNaN(parsed.getTime())) return new Date(0);
    return parsed;
  }

  /**
   * Build the pdfmake document definition for a report model.
   *
   * v2.2 visual pass: the layout mirrors the approved reference composition — topline, hero,
   * section titles with gold rules, two-column cards, sentence blocks, insight boxes — while every
   * dynamic value still comes from the one shared model. The approved Talent Tree / Iron Triangle
   * geometry is untouched.
   *
   * @param {any} model output of ReportModel.buildReportModel
   * @param {any} ctx { Svg } — the same SVG module the browser renders with
   * @param {any} [configs] the adapted config bundle (section titles and insight copy)
   */
  /** A hairline gold rule between sections (the reference's .rule). */
  function goldRule() {
    return {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 527, y2: 0, lineWidth: 1, lineColor: C.gold }],
      margin: [0, 2, 0, 6]
    };
  }

  /** The topline: eyebrow left, page marker right (the reference's .topline). */
  function topline(pageIndex) {
    return {
      columns: [
        {
          text: 'TRUE PATH \u00b7 \u8f68\u9053',
          fontSize: 8.3,
          bold: true,
          color: C.burgundy,
          characterSpacing: 1.2
        },
        {
          text: 'Page ' + pageIndex + ' of 4',
          fontSize: 7.8,
          color: C.textMed,
          alignment: 'right'
        }
      ],
      margin: [0, 0, 0, 2]
    };
  }

  /** Section opener: gold kicker + burgundy serif title (the reference's .section-title). */
  function sectionTitle(section) {
    return {
      columns: [
        {
          width: 'auto',
          text: String(section.kicker || ''),
          fontSize: 8,
          bold: true,
          color: C.gold,
          characterSpacing: 1.4,
          margin: [0, 6, 12, 0]
        },
        {
          text: String(section.title || ''),
          font: displaySafe(section.title),
          fontSize: 21,
          bold: true,
          color: C.burgundy
        }
      ],
      margin: [0, 0, 0, 4]
    };
  }

  /** A two-column row of cards. */
  function cardRow(left, right, widths) {
    return {
      columns: [
        { width: (widths && widths[0]) || '*', stack: left },
        { width: (widths && widths[1]) || '*', stack: right }
      ],
      columnGap: 12,
      margin: [0, 0, 0, 6]
    };
  }

  /** The insight box: burgundy left border, serif heading, body (the reference's .insight). */
  function insightBlock(block) {
    return {
      table: { widths: ['*'], body: [[{ stack: [
        { text: String(block.title || ''), font: displaySafe(block.title), fontSize: 13, color: C.burgundy, margin: [0, 0, 0, 2] },
        { text: String(block.body || ''), fontSize: 8.8, color: C.textDark, lineHeight: 1.42 }
      ] }]] },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i) => (i === 0 ? 3 : 0),
        hLineColor: () => 'transparent',
        vLineColor: () => C.burgundy,
        fillColor: () => C.panel,
        paddingTop: () => 6,
        paddingBottom: () => 6,
        paddingLeft: () => 8,
        paddingRight: () => 6
      },
      margin: [0, 0, 0, 4]
    };
  }

  /** A sentence card: labelled sentences separated by hairlines (the reference's .sentence-block).
   *  Labels follow the reference wording; the first sentence prints bold, as in the reference. */
  function sentenceCard(sentences) {
    const REFERENCE_LABELS = ['Energises', 'Good at', 'Work you could be paid for', 'Impact'];
    const stack = [];
    sentences.forEach((entry, index) => {
      const labelText = REFERENCE_LABELS[index] || String(entry.label || '');
      stack.push({ text: labelText.toUpperCase(), fontSize: 7.5, bold: true, color: C.burgundy, characterSpacing: 0.8, margin: [0, index === 0 ? 0 : 5, 0, 1] });
      stack.push({ text: String(entry.text || ''), bold: index === 0, fontSize: 9.5, color: C.textDark, lineHeight: 1.48, margin: [0, 0, 0, index === sentences.length - 1 ? 0 : 2] });
      if (index < sentences.length - 1) {
        stack.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 500, y2: 0, lineWidth: 0.6, lineColor: '#E1DBD4' }],
          margin: [0, 0, 0, 0]
        });
      }
    });
    return panel(stack);
  }

  /** Small labelled card (list or sentence), the reference's .card. */
  function smallCard(labelText, body) {
    return panel(label(labelText).concat(body));
  }

  /**
   * The reference's .tag chips (page 3, role strengths): a two-column grid of hairline-outlined
   * cells. pdfmake has no rounded rects, so the outline is the chip.
   */
  function chipTable(items) {
    const chipLayout = {
      hLineWidth: () => 0.75,
      vLineWidth: () => 0.75,
      hLineColor: () => '#CFC7BE',
      vLineColor: () => '#CFC7BE',
      fillColor: () => '#FFFFFF',
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 6,
      paddingRight: () => 6
    };
    const cell = (text) => ({
      text: String(text).replace(/^./, (ch) => ch.toUpperCase()),
      fontSize: 8.5,
      color: C.textDark,
      alignment: 'center'
    });
    const rows = [];
    for (let i = 0; i < items.length; i += 2) {
      rows.push([cell(items[i]), items[i + 1] !== undefined ? cell(items[i + 1]) : { text: '' }]);
    }
    return { table: { widths: ['*', '*'], body: rows }, layout: chipLayout, margin: [0, 1, 0, 3] };
  }

  function buildReportPdfDefinition(model, ctx, configs) {
    configs = configs || {};
    /** @type {Array<any>} */
    const content = [];
    const pdfCfg = (configs && configs.truthPath && configs.truthPath.pdf) || {};
    const sections = pdfCfg.sections || {};
    const page1 = model.pages[0];
    const page2 = model.pages[1];
    const page3 = model.pages[2];
    const byKind = (page, kind) => page.blocks.filter((block) => block.kind === kind);

    // ─── Page 1 ──────────────────────────────────────────────────────────────
    content.push(topline(1));
    const heroBlock = byKind(page1, 'hero')[0];
    if (heroBlock) content.push(renderBlock(heroBlock, ctx));

    content.push(sectionTitle(sections.talent || { kicker: 'Talent Tree 才', title: 'How you naturally think' }));
    // v2.3 D1: the "scores are independent" explanation lives beside the heading, not as an
    // observation bullet.
    const treeNote = (configs.talent && configs.talent.snapshot && configs.talent.snapshot.talentTreeNote) ||
      'Each branch is scored on its own, so the four don’t need to add up to 100%.';
    if (treeNote) {
      content.push({
        text: [{ text: 'ⓘ ', color: C.gold, bold: true }, { text: treeNote }],
        fontSize: 8,
        color: C.textMed,
        margin: [0, 0, 0, 2]
      });
    }

    const tree = byKind(page1, 'talent-tree')[0];
    if (tree) {
      const renderedTree = renderBlock(tree, ctx);
      renderedTree.width = 330;
      content.push(renderedTree);
    }

    const p1Scores = byKind(page1, 'scores')[0];
    const p1Pair = byKind(page1, 'pair')[0];
    if (p1Scores && p1Pair) {
      // The reference styles the pattern name as a card label (small, burgundy, uppercase).
      const pairInner = label(p1Pair.archetypeHeading || p1Pair.label).concat([
        { text: String(p1Pair.leadLine || ''), fontSize: 8.9, color: C.textDark, lineHeight: 1.42 }
      ]);
      if (p1Pair.strengthsSentence) {
        pairInner.push({ text: String(p1Pair.strengthsSentence), fontSize: 8.9, color: C.textDark, lineHeight: 1.35, margin: [0, 3, 0, 0] });
      }
      content.push(cardRow([renderBlock(p1Scores, ctx)], pairInner, ['55%', '*']));
    }

    byKind(page1, 'insight').forEach((block) => content.push(insightBlock(block)));

    // ─── Page 2 ──────────────────────────────────────────────────────────────
    content.push(Object.assign({}, topline(2), { pageBreak: 'before' }));
    content.push(sectionTitle(sections.direction || { kicker: 'Direction 道', title: 'Where your strengths could matter' }));
    content.push(goldRule());

    const p2Texts = byKind(page2, 'text');
    const sentences = p2Texts.slice(0, 4).map((block) => ({ label: block.label, text: block.text }));
    if (sentences.length) content.push(sentenceCard(sentences));
    content.push({ text: '', margin: [0, 0, 0, 3] });

    const p2Lists = byKind(page2, 'list-block');
    const possibleAreas = p2Lists.find((block) => /possible areas/i.test(String(block.label || '')));
    const valueCreation = p2Texts.length > 4 ? p2Texts[4] : null;
    if (possibleAreas && valueCreation) {
      content.push(cardRow(
        [renderBlock(possibleAreas, ctx)],
        [smallCard(valueCreation.label, [{ text: String(valueCreation.text || ''), fontSize: 8.9, color: C.textDark, lineHeight: 1.4 }])],
        ['*', '*']
      ));
    }

    const alignment = p2Lists.find((block) => /alignment/i.test(String(block.label || '')));
    if (alignment) content.push(renderBlock(alignment, ctx));
    byKind(page2, 'insight').forEach((block) => content.push(insightBlock(block)));

    // ─── Page 3 ──────────────────────────────────────────────────────────────
    content.push(Object.assign({}, topline(3), { pageBreak: 'before' }));
    content.push(sectionTitle(sections.role || { kicker: 'Role 位', title: 'Your Iron Triangle and True Path' }));
    content.push(goldRule());

    const p3Triangle = byKind(page3, 'iron-triangle')[0];
    const p3Role = byKind(page3, 'role-card')[0];
    const p3Scores = byKind(page3, 'scores')[0];
    const p3Texts = byKind(page3, 'text');
    const thrive = p3Texts.find((block) => /thrive/i.test(String(block.label || '')));
    const growth = p3Texts.find((block) => /growth/i.test(String(block.label || '')));
    const p3Title = byKind(page3, 'title')[0];
    const p3Reflection = byKind(page3, 'list-block').find((block) => /reflection/i.test(String(block.label || '')));

    if (p3Triangle && p3Role) {
      const triangleRendered = renderBlock(p3Triangle, ctx);
      triangleRendered.width = 150;
      const roleStack = [
        { text: String(p3Role.label || '').toUpperCase(), fontSize: 7.5, bold: true, color: C.burgundy, characterSpacing: 0.8, margin: [0, 0, 0, 2] },
        // Mixed Latin + CJK: the serif face has no CJK glyphs, so this heading stays in the
        // CJK face — only pure-Latin strings may use display().
        { text: [
          { text: p3Role.name + ' ', font: displaySafe(p3Role.name), fontSize: 19, bold: true, color: C.burgundy },
          { text: String(p3Role.chinese || ''), fontSize: 16, bold: true, color: C.burgundy }
        ], margin: [0, 0, 0, 1] },
        { text: String(p3Role.subtitle || ''), fontSize: 9, color: C.textMed, margin: [0, 0, 0, 2] },
        { text: String(p3Role.essence || ''), fontSize: 9.5, color: C.textDark, lineHeight: 1.35, margin: [0, 0, 0, 2] },
        { text: String(p3Role.oneLine || ''), fontSize: 8.8, color: C.textMed, lineHeight: 1.35 }
      ];
      if ((p3Role.naturalStrengths || []).length) {
        roleStack.push(chipTable((p3Role.naturalStrengths || []).map(String)));
      }
      if (p3Role.contribution) {
        roleStack.push({ text: String(p3Role.contribution), fontSize: 8.8, color: C.textDark, lineHeight: 1.35, margin: [0, 3, 0, 0] });
      }
      content.push({
        columns: [
          { width: 160, stack: [triangleRendered] },
          { width: '*', stack: roleStack }
        ],
        columnGap: 12,
        margin: [0, 0, 0, 6]
      });
    }

    if (p3Scores && p3Role) {
      const watchAllies = [];
      if (p3Role.watchOut) watchAllies.push({ text: [{ text: 'Watch-out: ', bold: true }, { text: String(p3Role.watchOut) }], fontSize: 8.8, color: C.textDark, lineHeight: 1.35, margin: [0, 0, 0, 3] });
      if (p3Role.allies) watchAllies.push({ text: [{ text: 'Natural allies: ', bold: true }, { text: String(p3Role.allies) }], fontSize: 8.8, color: C.textDark, lineHeight: 1.35 });
      content.push(cardRow(
        [renderBlock(p3Scores, ctx)],
        [smallCard('Watch-out and allies', watchAllies)],
        ['*', '*']
      ));
    }

    if (thrive || growth) {
      const right = [];
      if (thrive) right.push(renderBlock(thrive, ctx));
      if (growth) right.push(renderBlock(growth, ctx));
      content.push(cardRow([{ text: '' }], right, ['*', '*']));
    }

    if (p3Title) content.push(renderBlock(p3Title, ctx));
    if (p3Reflection) content.push(renderBlock(p3Reflection, ctx));

    // ─── v2.3 D10: Page 4 — Watch-outs & Growth 留意 ───
    const page4 = model.pages[3];
    if (page4) {
      content.push(Object.assign({}, topline(4), { pageBreak: 'before' }));
      content.push(sectionTitle(sections.watchouts || { kicker: '留意', title: 'Watch-outs & Growth' }));
      content.push(goldRule());
      if (page4.intro) {
        content.push({ text: String(page4.intro), fontSize: 9, color: C.textMed, margin: [0, 0, 0, 6] });
      }

      const watchCards = byKind(page4, 'watch-card');
      watchCards.forEach((card) => {
        const cardStack = [
          {
            text: (card.number ? card.number + ' · ' : '') + String(card.title || '') +
              (card.talent ? ' (' + card.talent + ')' : ''),
            fontSize: 9.5, bold: true, color: C.burgundy, margin: [0, 0, 2, 2]
          },
          { text: String(card.watchOut || ''), fontSize: 9, color: C.textDark, lineHeight: 1.35, margin: [0, 0, 2, 0] }
        ];
        if (card.ally) {
          cardStack.push({ text: String(card.ally), fontSize: 9, color: C.textDark, lineHeight: 1.35, margin: [0, 0, 2, 0] });
        }
        if (card.signal) {
          cardStack.push({ text: String(card.signal), italics: true, fontSize: 8.8, color: C.textMed, lineHeight: 1.35 });
        }
        content.push({
          // Ivory panel with a thin gold left border — guidance, not a warning.
          table: { widths: ['*'], body: [[{ stack: cardStack, margin: [8, 3, 8, 3] }]] },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i) => (i === 0 ? 2 : 0),
            hLineColor: () => 'transparent',
            vLineColor: () => C.gold,
            fillColor: () => C.ivory,
            paddingTop: () => 4,
            paddingBottom: () => 4,
            paddingLeft: () => 8,
            paddingRight: () => 6
          },
          margin: [0, 0, 0, 5]
        });
      });

      const underPressure = byKind(page4, 'text').find((b) => /pressure/i.test(String(b.label || '')));
      if (underPressure) {
        content.push(renderBlock(underPressure, ctx));
      }

      const quickWin = byKind(page4, 'quick-win')[0];
      if (quickWin) {
        content.push({
          table: { widths: ['auto', '*'], body: [[
            { text: '✓', fontSize: 12, bold: true, color: C.burgundy, alignment: 'center', margin: [0, 0, 6, 0] },
            { stack: [
              { text: 'One Quick Win This Week', fontSize: 7.5, bold: true, color: C.burgundy, characterSpacing: 0.8, margin: [0, 0, 0, 2] },
              { text: String(quickWin.text || ''), fontSize: 9.5, color: C.textDark }
            ] }
          ]] },
          layout: {
            hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.8 : 0),
            vLineWidth: () => 0.8,
            hLineColor: () => C.gold,
            vLineColor: () => C.gold,
            fillColor: () => C.ivory,
            paddingTop: () => 4,
            paddingBottom: () => 4,
            paddingLeft: () => 8,
            paddingRight: () => 8
          },
          margin: [0, 2, 0, 6]
        });
      }

      const teaser = byKind(page4, 'teaser')[0];
      if (teaser) {
        const teaserStack = [
          { text: String(teaser.heading || ''), font: displaySafe(teaser.heading), fontSize: 13, color: C.burgundy, margin: [0, 0, 3, 0] },
          { text: String(teaser.intro || ''), fontSize: 9, color: C.textDark, margin: [0, 0, 4, 0] }
        ];
        (teaser.bullets || []).forEach((bullet) => {
          teaserStack.push({ text: [{ text: '•  ', color: C.gold }, { text: String(bullet) }], fontSize: 9, color: C.textDark, lineHeight: 1.35, margin: [0, 0, 0, 2] });
        });
        content.push({
          // Slightly darker panel so it reads as the natural next step.
          table: { widths: ['*'], body: [[{ stack: teaserStack, margin: [8, 4, 8, 4] }]] },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            fillColor: () => '#EFE9E1',
            paddingTop: () => 4,
            paddingBottom: () => 4,
            paddingLeft: () => 6,
            paddingRight: () => 6
          },
          margin: [0, 4, 0, 2]
        });
      }

      const invite4 = byKind(page4, 'invite')[0];
      if (invite4) content.push(renderBlock(invite4, ctx));

      if (teaser && teaser.advisoryLine) {
        content.push({
          text: String(teaser.advisoryLine),
          italics: true,
          fontSize: 8.5,
          color: C.textMed,
          alignment: 'center',
          link: teaser.advisoryHref || undefined,
          margin: [0, 2, 0, 0]
        });
      }

      content.push({
        text: String(model.disclaimer || ''),
        fontSize: 8,
        italics: true,
        color: C.textMed,
        alignment: 'center',
        margin: [0, 4, 0, 0]
      });
    }

    return {
      pageSize: 'A4',
      pageMargins: [34, 20, 34, 28],
      // lineHeight is 1.05, not the 1.14 a screen would use: page 3's copy grows with the number
      // of Ikigai picks, and at 1.14 it spills past the page bottom for a large share of valid
      // journeys, so the document rendered 4 pages while declaring 3 (and cta.json promises
      // "3-Page"). 1.05 keeps every valid journey — 1..3 picks on each of the 4 screens, all 5
      // talent levels and all 3 roles, 1215 shapes — at exactly 3 content pages without trimming copy (v2.3 adds page 4).
      defaultStyle: { font: FONT, fontSize: 9, color: C.textDark, lineHeight: 1.05 },
      info: {
        title: asPdfName(model)
          ? 'True Path Report — ' + asPdfName(model)
          : String(model.headline || 'True Path Report'),
        author: 'The Full Picture',
        subject: 'True Path \u8f68\u9053 \u2014 4-page report',
        creator: 'The Full Picture',
        // Deterministic metadata: pdfkit defaults CreationDate to `new Date()` and derives the PDF
        // file ID from it, so an unpinned document differs on every render. Both dates are pinned
        // to the record's own instant (never `Date.now`) so the same record always yields the same
        // bytes — required for identical-payload retries (Resend) and re-downloads.
        creationDate: stableDate(model.createdAt),
        modDate: stableDate(model.createdAt)
      },
      content: sanitizeContent(content),
      footer: (currentPage, pageCount) => ({
        columns: [
          {
            // v2.2 C14: the result id lives in small footer print (support), not in the header.
            text:
              String(model.brand || '') +
              (model.resultId ? ' · ' + String(model.resultId) : ''),
            fontSize: 7.5,
            color: C.textLight,
            margin: [38, 0, 0, 0]
          },
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

  /** C14: the sanitised first name for the document title. */
  function asPdfName(model) {
    const name = model && model.profile && model.profile.firstName;
    if (!name) return '';
    return String(name).replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40);
  }

  /**
   * Render the report to a PDF buffer.
   *
   * pdfmake and the font location are injected rather than imported, so this module keeps no
   * platform dependency (a test or a different host can supply its own) while still owning the
   * whole render pipeline. `true-path/lib/server/pdf-generator.ts` is the production caller.
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
    serifActive = !!(deps.serifPath && typeof deps.serifPath === 'string');
    if (serifActive) {
      pdfmake.fonts[SERIF] = {
        normal: deps.serifPath,
        bold: deps.serifPath,
        italics: deps.serifPath,
        bolditalics: deps.serifPath
      };
    }

    const definition = buildReportPdfDefinition(model, ctx, deps.configs);
    return pdfmake.createPdf(definition).getBuffer();
  }

  return Object.freeze({
    COLORS: C,
    FONT,
    stableDate,
    buildReportPdfDefinition,
    renderReportPdf,
    renderBlock,
    stripSvgDisclosures,
    scoreBar
  });
});
