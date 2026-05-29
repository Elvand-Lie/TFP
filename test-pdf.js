const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake');
const { buildPdfDefinition } = require('./api/pdf-generator.ts'); // Need ts-node or compile it.

// Let's just require ts-node
require('ts-node').register();
const gen = require('./api/pdf-generator.ts');

const docDef = gen.buildPdfDefinition({
  chartData: {
    four_pillars: {
      year_pillar: { heavenly_stem: { character: '甲', name: 'Jia' }, earthly_branch: { character: '子', name: 'Rat' } },
      month_pillar: { heavenly_stem: { character: '乙', name: 'Yi' }, earthly_branch: { character: '丑', name: 'Ox' } },
      day_pillar: { heavenly_stem: { character: '丙', name: 'Bing' }, earthly_branch: { character: '寅', name: 'Tiger' } },
      hour_pillar: { heavenly_stem: { character: '丁', name: 'Ding' }, earthly_branch: { character: '卯', name: 'Rabbit' } }
    },
    analysis: { dm_strength_label: 'Strong', main_structure: 'Direct Wealth', profiling: { structures_natal: { 'Direct Wealth': 50 } } }
  }
}, 'Test User');

const fontPath = path.join(__dirname, 'fonts', 'NotoSansSC.ttf');
const fonts = {
  NotoSansSC: {
    normal: fontPath,
    bold: fontPath,
    italics: fontPath,
    bolditalics: fontPath,
  }
};

const printer = new PdfPrinter(fonts);
const pdfDoc = printer.createPdfKitDocument(docDef);
const chunks = [];
pdfDoc.on('data', (chunk) => chunks.push(chunk));
pdfDoc.on('end', () => console.log('PDF generated, size:', Buffer.concat(chunks).length));
pdfDoc.on('error', (e) => console.error('Error generating PDF:', e));
pdfDoc.end();
