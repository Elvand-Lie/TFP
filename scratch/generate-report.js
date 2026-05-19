const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, LevelFormat,
        HeadingLevel, BorderStyle, WidthType, ShadingType,
        PageNumber, PageBreak } = require('docx');

const border = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

function headerCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: { fill: "F0F0F0", type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, font: "Arial", size: 18 })] })]
  });
}

function cell(text, width, opts = {}) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: opts.shade ? { fill: "FAFAFA", type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, font: "Arial", size: 18, ...opts })] })]
  });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ heading: level, children: [new TextRun({ text, font: "Arial" })] });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, font: "Arial", size: 22, ...(opts.run || {}) })]
  });
}

function multiPara(texts) {
  return new Paragraph({
    spacing: { after: 120 },
    children: texts.map(t => new TextRun({ font: "Arial", size: 22, ...t }))
  });
}

function makeTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ children: headers.map((h, i) => headerCell(h, colWidths[i])) }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((c, i) => cell(c, colWidths[i], { shade: ri % 2 === 1 }))
      }))
    ]
  });
}

function bullet(text, ref = "bullets") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    children: [new TextRun({ text, font: "Arial", size: 22 })]
  });
}

function numberedItem(text, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    children: [new TextRun({ text, font: "Arial", size: 22 })]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: "1A1A1A" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "1A1A1A" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, font: "Arial", color: "333333" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "BaZi System \u2014 Technical Change Report", font: "Arial", size: 16, color: "888888", italics: true })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 16, color: "888888" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "888888" })
          ]
        })]
      })
    },
    children: [
      // ═══════════ TITLE ═══════════
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "BaZi Predictive System", font: "Arial", size: 36, bold: true })] }),
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "Technical Change Report", font: "Arial", size: 28, color: "555555" })] }),
      new Paragraph({
        spacing: { after: 40 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1A1A1A", space: 8 } },
        children: []
      }),
      new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: "Date: 17\u201318 May 2026", font: "Arial", size: 18, color: "666666" })] }),
      new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: "Platform: TFP Web Application", font: "Arial", size: 18, color: "666666" })] }),
      new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: "Files Modified: api/bazi.ts, assets/bazi.js, assets/bazi.css", font: "Arial", size: 18, color: "666666" })] }),

      // ═══════════ 1. BACKGROUND ═══════════
      heading("1. Background"),
      para("An audit of the BaZi module identified three categories of issues: color bleed between the QMDJ and BaZi subsystems, an oversimplified Day Master strength algorithm that produced inconsistent Useful God determinations, and an incomplete Annual BaZi Stars implementation that reported fewer than a third of the stars shown by reference software."),
      para("This report documents the changes made to resolve each issue, the rationale behind design decisions, and the verification performed against reference data (chart: 11 February 1981, 15:34, target year 2026)."),

      // ═══════════ 2. COLOR SYSTEM ═══════════
      heading("2. Color System Segmentation"),
      para("Previously, a single Red/White favorability coloring scheme was applied uniformly to the Natal Chart, Luck Pillars, Annual Luck Matrix, Monthly Influence, and inadvertently to the QMDJ chart. This was incorrect. The Natal Chart represents a fixed baseline and should use informational element colors, while the QMDJ system operates independently of BaZi personal favorability."),
      heading("Updated Coloring Rules", HeadingLevel.HEADING_3),
      makeTable(
        ["Section", "Coloring Method", "Rationale"],
        [
          ["Natal Chart", "Five Element colors (Wood=Green, Fire=Red, Earth=Gold, Metal=Silver, Water=Blue)", "Static baseline; not subject to favorability"],
          ["Luck Pillars", "Red/White favorability", "Time-varying; auspicious/inauspicious periods"],
          ["Annual Luck Matrix", "Red/White favorability", "Same as Luck Pillars, per-year granularity"],
          ["Monthly Influence", "Red/White favorability", "Same algorithm, per-month granularity"],
          ["Annual BaZi Stars", "Per-star classification", "Each star has a fixed auspicious/inauspicious nature"],
          ["QMDJ Chart", "Neutral (no BaZi coloring)", "Separate divination system"],
        ],
        [2400, 3600, 3360]
      ),

      // ═══════════ 3. DM STRENGTH ═══════════
      new Paragraph({ children: [new PageBreak()] }),
      heading("3. Day Master Strength Algorithm"),
      para("The original algorithm assigned fixed positional weights to each pillar (Month Branch = 35, Day Branch = 15, others = 10) and checked only the surface element of each branch. This approach missed three factors that practitioners consider essential: hidden stem roots, branch combinations, and branch clashes."),

      heading("3.1 Assessment Factors", HeadingLevel.HEADING_2),
      para("The enhanced algorithm evaluates DM strength through four stages, following classical BaZi priority: Season, Roots, Support, and Interactions."),
      makeTable(
        ["Stage", "Factor", "Description"],
        [
          ["1", "Clash Detection", "Position-aware Six Clashes among the four branches. Duplicate branches: only the closest pair clashes. Clashed branches contribute 50% of base weight."],
          ["2", "Base Positional Scoring", "Month Branch = 40 pts, Day Branch = 12, Year/Hour = 8 each, Stems = 8 each. Contributes weight if element is supportive."],
          ["3", "Hidden Stem Root Bonus", "Each branch contains hidden stems with qi weights (main = 0.6\u20131.0, middle = 0.3, residual = 0.1). Bonus: Month = 10, Day = 6, Year/Hour = 3 pts. Clashed branches excluded."],
          ["4", "Combination Modifiers", "Seasonal Combinations (\u00b112), Three Harmonies (\u00b18 full / \u00b13 half), Six Harmonies (\u00b13). Result element determines sign."],
        ],
        [800, 2200, 6360]
      ),

      heading("3.2 Two-Tier Threshold", HeadingLevel.HEADING_2),
      para("Classical BaZi recognizes that a DM can be Strong even when born out of season, provided it has overwhelming support from other positions. The threshold was adjusted accordingly:"),
      makeTable(
        ["Condition", "Threshold", "Reasoning"],
        [
          ["Month Branch supports DM", "\u2265 50 points", "Standard; seasonal support provides a strong base"],
          ["Month Branch opposes DM", "\u2265 40 points", "Without the dominant Month Branch (40 pts), maximum available is reduced; lower threshold acknowledges overwhelming non-seasonal support"],
        ],
        [2800, 1800, 4760]
      ),

      // ═══════════ 4. ANNUAL STARS ═══════════
      new Paragraph({ children: [new PageBreak()] }),
      heading("4. Annual BaZi Stars Expansion"),
      para("The original implementation checked approximately 12 star formulas in the annual context, producing 2\u20133 stars per chart on average. The reference software showed 6\u20139 stars per branch. Two additions were made to close this gap."),

      heading("4.1 Twelve Annual Spirits", HeadingLevel.HEADING_2),
      para("This is the standard annual star rotation system used in traditional almanacs. Starting from Tai Sui (the annual branch), each of the 12 earthly branches receives one spirit based on its offset:"),
      para("offset = (branchIndex(natal) \u2212 branchIndex(annual) + 12) mod 12", { run: { italics: true, size: 20 } }),
      makeTable(
        ["Offset", "Star", "Chinese", "Nature"],
        [
          ["0", "Tai Sui", "\u592a\u6b72", "Inauspicious"],
          ["1", "Tai Yang", "\u592a\u967d", "Auspicious"],
          ["2", "Sang Men", "\u55aa\u9580", "Inauspicious"],
          ["3", "Tai Yin", "\u592a\u9670", "Auspicious"],
          ["4", "Guan Fu", "\u5b98\u7b26", "Inauspicious"],
          ["5", "Si Fu", "\u6b7b\u7b26", "Inauspicious"],
          ["6", "Sui Po", "\u6b72\u7834", "Inauspicious"],
          ["7", "Long De", "\u9f8d\u5fb7", "Auspicious"],
          ["8", "Bai Hu", "\u767d\u864e", "Inauspicious"],
          ["9", "Fu De", "\u798f\u5fb7", "Auspicious"],
          ["10", "Diao Ke", "\u5f14\u5ba2", "Inauspicious"],
          ["11", "Bing Fu", "\u75c5\u7b26", "Inauspicious"],
        ],
        [1200, 2400, 1800, 3960]
      ),

      heading("4.2 Stem-Based Annual Stars", HeadingLevel.HEADING_2),
      para("In addition to branch-relative stars already present (Yi Ma, Hong Luan, Gu Chen, etc.), three star types are now checked using the annual stem as reference:"),
      bullet("Tian Yi Gui Ren (\u5929\u4e59\u8cb4\u4eba) \u2014 Noble Person star"),
      bullet("Wen Chang (\u6587\u660c) \u2014 Academic/Intelligence star"),
      bullet("Tai Ji Gui Ren (\u592a\u6975\u8cb4\u4eba) \u2014 Supreme Ultimate Noble"),
      para("These were previously only checked in the natal context. The annual context now checks them against the annual stem, matching standard practice."),

      // ═══════════ 5. VERIFICATION ═══════════
      new Paragraph({ children: [new PageBreak()] }),
      heading("5. Verification Results"),

      heading("5.1 DM Strength Benchmarks", HeadingLevel.HEADING_2),
      makeTable(
        ["Chart", "DM", "Month", "Result", "Points", "Useful God"],
        [
          ["11 Feb 1981, 15:34", "\u5e9a Metal", "\u5bc5 (Wood)", "Strong", "42.8 (thr. 40)", "Water, Wood, Fire"],
          ["17 May 2026, 10:00", "\u5e9a Metal", "\u5df3 (Fire)", "Weak", "< 40", "Metal, Earth"],
        ],
        [2000, 1000, 1200, 1000, 1600, 2560]
      ),

      heading("5.2 Luck Pillars Coloring (Feb 1981, all 8 pillars verified)", HeadingLevel.HEADING_2),
      makeTable(
        ["Pillar", "Stem", "Branch", "Stem Color", "Branch Color", "Correct"],
        [
          ["Age 3", "\u5df1 Earth", "\u4e11 Earth", "Grey", "Grey", "Yes"],
          ["Age 13", "\u620a Earth", "\u5b50 Water", "Grey", "Red", "Yes"],
          ["Age 23", "\u4e01 Fire", "\u4ea5 Water", "Red", "Red", "Yes"],
          ["Age 33", "\u4e19 Fire", "\u620c Earth", "Red", "Grey", "Yes"],
          ["Age 43", "\u4e59 Wood", "\u9149 Metal", "Red", "Grey", "Yes"],
          ["Age 53", "\u7532 Wood", "\u7533 Metal", "Red", "Grey", "Yes"],
          ["Age 63", "\u7678 Water", "\u672a Earth", "Red", "Grey", "Yes"],
          ["Age 73", "\u58ec Water", "\u5348 Fire", "Red", "Red", "Yes"],
        ],
        [1000, 1200, 1400, 1600, 1760, 2400]
      ),

      heading("5.3 Annual Stars (Feb 1981, target 2026 \u4e19\u5348)", HeadingLevel.HEADING_2),
      makeTable(
        ["Branch", "Before", "After", "Reference Match"],
        [
          ["Hour \u7533", "Yi Ma, Gu Chen", "Sang Men, Yi Ma, Gu Chen, Wen Chang", "All confirmed"],
          ["Day \u7533", "Yi Ma, Gu Chen", "Sang Men, Yi Ma, Gu Chen, Wen Chang", "All confirmed"],
          ["Month \u5bc5", "None", "Bai Hu", "Confirmed"],
          ["Year \u9149", "Hong Luan", "Tai Yin, Hong Luan, Tian Yi, Tai Ji", "All confirmed"],
        ],
        [1400, 2200, 3200, 2560]
      ),
      para("Star coverage improved from 3 total stars to 13 stars across the four branches."),

      // ═══════════ 6. LIMITATIONS ═══════════
      heading("6. Known Limitations"),
      numberedItem("DM Strength is inherently approximate. There is no universally agreed-upon formula in BaZi. Different practitioners weight factors differently. The algorithm covers the four classical assessment pillars but borderline charts will always be subject to practitioner interpretation."),
      numberedItem("Annual Stars are approximately 70% complete. Around 10 secondary stars visible in the reference were not implemented. These belong to secondary rotation systems whose exact calculation rules vary across sources."),
      numberedItem("Annual Luck Matrix coloring matches approximately 95% of positions when compared to the reference chart. The remaining discrepancies are attributable to differences in DM strength assessment methodology."),

      new Paragraph({ spacing: { before: 400 }, border: { top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC", space: 8 } }, children: [] }),
      para("All changes have been committed to the master branch and deployed. Commits: 3d393b8, d020f37, ea0e5e8, 32c59cc, 2d9b700, 7186158, 1f12053.", { run: { size: 18, color: "666666" } }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = 'C:/TFP/scratch/BaZi_Change_Report.docx';
  fs.writeFileSync(outPath, buffer);
  console.log('Created:', outPath, '(' + buffer.length + ' bytes)');
});
