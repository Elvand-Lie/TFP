import path from 'path';

export function buildPdfDefinition(data: any, name: string) {
  const fp = data.chartData?.four_pillars || {};
  const dm = fp.day_pillar?.heavenly_stem?.character || '';
  const dmName = fp.day_pillar?.heavenly_stem?.name || '';
  const strength = data.chartData?.analysis?.dm_strength_label || '';
  const structure = data.chartData?.analysis?.main_structure || '';
  
  // Format the 4 pillars into a table
  const pillarLabels = ['Hour Pillar', 'Day Pillar', 'Month Pillar', 'Year Pillar'];
  const pKeys = ['hour_pillar', 'day_pillar', 'month_pillar', 'year_pillar'];
  
  const headerRow = pillarLabels.map(l => ({ text: l, style: 'tableHeader' }));
  
  const stemRow = pKeys.map(k => {
    const p = fp[k]?.heavenly_stem;
    return p ? { text: p.character + '\n' + p.name, style: 'tableCell' } : { text: '' };
  });
  
  const branchRow = pKeys.map(k => {
    const p = fp[k]?.earthly_branch;
    return p ? { text: p.character + '\n' + p.name, style: 'tableCell' } : { text: '' };
  });

  const hiddenRow = pKeys.map(k => {
    const hStems = fp[k]?.hidden_stems || [];
    const text = hStems.map((h: any) => `${h.character} (${h.name})`).join('\n');
    return { text: text, style: 'hiddenCell' };
  });

  // Profiling Data
  const structuresNatal = data.chartData?.analysis?.profiling?.structures_natal || {};
  const profilingList = Object.entries(structuresNatal).map(([k, v]) => {
    return { text: `${k}: ${v}%`, margin: [0, 2, 0, 2] };
  });

  // Element Balance
  const elements = data.chartData?.analysis?.elements || {};
  const elementsList = Object.entries(elements).map(([k, v]) => {
    return { text: `${k}: ${v}%`, margin: [0, 2, 0, 2] };
  });

  // Luck Pillars
  const luckPillars = data.chartData?.luck_pillars || [];
  const luckHeader = [
    { text: 'Age', style: 'tableHeader' },
    { text: 'Years', style: 'tableHeader' },
    { text: 'Heavenly Stem', style: 'tableHeader' },
    { text: 'Earthly Branch', style: 'tableHeader' }
  ];
  const luckBody = luckPillars.map((lp: any) => [
    { text: lp.age?.toString() || '', style: 'tableCell' },
    { text: `${lp.year_start} - ${lp.year_end}`, style: 'tableCell' },
    { text: lp.heavenly_stem?.character + ' ' + lp.heavenly_stem?.name, style: 'tableCell' },
    { text: lp.earthly_branch?.character + ' ' + lp.earthly_branch?.name, style: 'tableCell' }
  ]);

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [ 40, 60, 40, 60 ],
    defaultStyle: { font: 'NotoSansSC', fontSize: 11, color: '#333333' },
    styles: {
      header: { fontSize: 24, bold: true, alignment: 'center', margin: [0, 0, 0, 10] },
      subheader: { fontSize: 14, alignment: 'center', margin: [0, 0, 0, 30], color: '#666666' },
      sectionTitle: { fontSize: 16, bold: true, margin: [0, 20, 0, 10], color: '#710101' },
      tableHeader: { bold: true, fontSize: 12, color: 'white', fillColor: '#710101', alignment: 'center', margin: [0, 5, 0, 5] },
      tableCell: { fontSize: 14, alignment: 'center', margin: [0, 10, 0, 10] },
      hiddenCell: { fontSize: 10, alignment: 'center', margin: [0, 5, 0, 5], color: '#666' },
      metricLabel: { fontSize: 10, color: '#888888', margin: [0, 0, 0, 2] },
      metricValue: { fontSize: 14, bold: true, margin: [0, 0, 0, 15] }
    },
    content: [
      { text: 'The Full Picture', style: 'header' },
      { text: 'BaZi Destiny Report', style: 'subheader' },
      
      {
        columns: [
          { width: '*', text: [ { text: 'Client Name\n', style: 'metricLabel' }, { text: (name || 'Client') + '\n', style: 'metricValue' } ] },
          { width: '*', text: [ { text: 'Day Master\n', style: 'metricLabel' }, { text: dm + ' (' + dmName + ')\n', style: 'metricValue' } ] },
          { width: '*', text: [ { text: 'Strength\n', style: 'metricLabel' }, { text: strength + '\n', style: 'metricValue' } ] },
          { width: '*', text: [ { text: 'Main Structure\n', style: 'metricLabel' }, { text: structure + '\n', style: 'metricValue' } ] }
        ]
      },
      
      { text: 'Natal Chart (Four Pillars)', style: 'sectionTitle' },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*', '*', '*'],
          body: [ headerRow, stemRow, branchRow, hiddenRow ]
        },
        layout: 'lightHorizontalLines'
      },
      
      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'Destiny Profiling', style: 'sectionTitle' },
              ...profilingList
            ]
          },
          {
            width: '50%',
            stack: [
              { text: 'Five Elements Balance', style: 'sectionTitle' },
              ...elementsList
            ]
          }
        ]
      },

      { text: '10-Year Luck Pillars', style: 'sectionTitle', pageBreak: 'before' },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', '*', '*'],
          body: [ luckHeader, ...luckBody ]
        },
        layout: 'lightHorizontalLines'
      }
    ]
  };

  return docDefinition;
}
