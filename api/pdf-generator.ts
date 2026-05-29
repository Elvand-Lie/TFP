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
    const text = hStems.map((h: any) => {
      const spelling = h.spelling ? h.spelling.charAt(0).toUpperCase() + h.spelling.slice(1) : '';
      return `${h.character} (${spelling})`;
    }).join('\n');
    return { text: text, style: 'hiddenCell' };
  });

  const shenShaRow = pKeys.map(k => {
    const stars = fp[k]?.shen_sha || [];
    return { text: stars.join('\n'), style: 'hiddenCell' };
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
  let luckPillars = data.chartData?.luck_pillars || [];
  if (luckPillars && !Array.isArray(luckPillars) && Array.isArray(luckPillars.luck_pillars)) {
    luckPillars = luckPillars.luck_pillars;
  }
  if (!Array.isArray(luckPillars)) luckPillars = [];
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
          body: [ headerRow, stemRow, branchRow, hiddenRow, shenShaRow ]
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

  // Append QMDJ if present
  if (data.qmdj && data.qmdj.palaces && data.qmdj.palaces.length > 0) {
    const pMap: Record<number, any> = {};
    data.qmdj.palaces.forEach((p: any) => { pMap[p.id] = p; });
    
    const formatPalace = (p: any) => {
      if (!p) return { text: '' };
      if (p.id === 5) return { text: `Center\n\n${p.heaven_stem || ''}\n${p.earth_stem || ''}`, style: 'tableCell' };
      return { text: `${p.god || ''}\n${p.star || ''}\n${p.door || ''}\n${p.heaven_stem || ''} / ${p.earth_stem || ''}`, style: 'tableCell' };
    };

    const qmdjGrid = [
      [formatPalace(pMap[4]), formatPalace(pMap[9]), formatPalace(pMap[2])],
      [formatPalace(pMap[3]), formatPalace(pMap[5]), formatPalace(pMap[7])],
      [formatPalace(pMap[8]), formatPalace(pMap[1]), formatPalace(pMap[6])]
    ];

    docDefinition.content.push(
      { text: 'Qi Men Dun Jia (Destiny Palace)', style: 'sectionTitle', pageBreak: 'before' } as any,
      { text: `Solar Term: ${data.qmdj.solar_term || '-'}    |    Ju: ${data.qmdj.ju || '-'}`, style: 'metricLabel' } as any,
      { text: `Zhi Fu: ${data.qmdj.duty_star || '-'}    |    Zhi Shi: ${data.qmdj.duty_door || '-'}`, style: 'metricLabel', margin: [0, 0, 0, 15] } as any,
      {
        table: {
          widths: ['*', '*', '*'],
          body: qmdjGrid
        },
        layout: 'lightHorizontalLines'
      } as any
    );
  }

  return docDefinition;
}
