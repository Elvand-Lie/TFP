import path from 'path';

export function buildPdfDefinition(data: any, name: string) {
  // Extract essential data
  const fp = data.chartData?.four_pillars || {};
  const dm = fp.day_pillar?.heavenly_stem?.character || '';
  const dmName = fp.day_pillar?.heavenly_stem?.name || '';
  const strength = data.chartData?.analysis?.dm_strength_label || '';
  
  const structure = data.chartData?.analysis?.main_structure || '';
  
  // Format the 4 pillars into a table
  const pillarLabels = ['Hour', 'Day', 'Month', 'Year'];
  const pKeys = ['hour_pillar', 'day_pillar', 'month_pillar', 'year_pillar'];
  
  const headerRow = pillarLabels.map(l => ({ text: l, style: 'tableHeader' }));
  const stemRow = pKeys.map(k => {
    const p = fp[k]?.heavenly_stem;
    return p ? { text: p.character + '\n' + p.name, style: 'tableCell' } : '';
  });
  const branchRow = pKeys.map(k => {
    const p = fp[k]?.earthly_branch;
    return p ? { text: p.character + '\n' + p.name, style: 'tableCell' } : '';
  });

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [ 40, 60, 40, 60 ],
    defaultStyle: {
      font: 'NotoSansSC' // This must match the font key registered in pdfmake
    },
    styles: {
      header: { fontSize: 24, bold: true, alignment: 'center', margin: [0, 0, 0, 10] },
      subheader: { fontSize: 14, alignment: 'center', margin: [0, 0, 0, 30], color: '#666666' },
      sectionTitle: { fontSize: 16, bold: true, margin: [0, 20, 0, 10], color: '#710101' },
      tableHeader: { bold: true, fontSize: 12, color: 'white', fillColor: '#710101', alignment: 'center', margin: [0, 5, 0, 5] },
      tableCell: { fontSize: 14, alignment: 'center', margin: [0, 10, 0, 10] },
      metricLabel: { fontSize: 10, color: '#888888', margin: [0, 0, 0, 2] },
      metricValue: { fontSize: 14, bold: true, margin: [0, 0, 0, 15] }
    },
    content: [
      { text: 'The Full Picture', style: 'header' },
      { text: 'BaZi Destiny Report', style: 'subheader' },
      
      {
        columns: [
          {
            width: '*',
            text: [
              { text: 'Client Name\n', style: 'metricLabel' },
              { text: (name || 'Client') + '\n', style: 'metricValue' }
            ]
          },
          {
            width: '*',
            text: [
              { text: 'Day Master\n', style: 'metricLabel' },
              { text: dm + ' (' + dmName + ')\n', style: 'metricValue' }
            ]
          },
          {
            width: '*',
            text: [
              { text: 'Strength\n', style: 'metricLabel' },
              { text: strength + '\n', style: 'metricValue' }
            ]
          },
          {
            width: '*',
            text: [
              { text: 'Main Structure\n', style: 'metricLabel' },
              { text: structure + '\n', style: 'metricValue' }
            ]
          }
        ]
      },
      
      { text: 'Natal Chart (Four Pillars)', style: 'sectionTitle' },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*', '*', '*'],
          body: [
            headerRow,
            stemRow,
            branchRow
          ]
        },
        layout: 'lightHorizontalLines'
      },
      
      { text: 'Destiny Profiling', style: 'sectionTitle', pageBreak: 'before' },
      // Simple list for profiling instead of radar chart
      ...Object.entries(data.chartData?.analysis?.profiling?.structures_natal || {}).map(([key, val]) => ({
        text: key + ': ' + val, margin: [0, 5, 0, 5]
      }))
    ]
  };

  return docDefinition;
}
