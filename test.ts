import fs from 'fs';
import path from 'path';
const PdfPrinter = require('pdfmake/js/printer').default || require('pdfmake/js/printer');
import { buildPdfDefinition } from './api/pdf-generator';

const docDef = buildPdfDefinition({
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
if (!fs.existsSync(fontPath)) {
  console.error("FONT NOT FOUND:", fontPath);
  process.exit(1);
}

const pdfmake = require('pdfmake');

pdfmake.fonts = {
  NotoSansSC: {
    normal: fontPath,
    bold: fontPath,
    italics: fontPath,
    bolditalics: fontPath,
  }
};

try {
  const pdfDoc = pdfmake.createPdf(docDef);
  pdfDoc.getBuffer().then((buffer) => {
    console.log('PDF generated, size:', buffer.length);
  }).catch((e) => {
    console.error('Buffer Error:', e);
  });
} catch (e) {
  console.error("PDFMake Error:", e);
}
