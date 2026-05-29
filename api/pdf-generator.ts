import path from 'path';

export function buildPdfDefinition(data: any, name: string) {
  const chartData = data.chartData || {};
  const fp = chartData.four_pillars || {};
  const analysis = chartData.analysis || {};
  const dm = fp.day_pillar?.heavenly_stem?.character || '';
  const dmName = fp.day_pillar?.heavenly_stem?.name || '';
  const strength = analysis.dm_strength_label || '';
  const structure = analysis.main_structure || '';
  const aux = analysis.auxiliary || {};

  // 1. Auxiliary Info
  const auxBlock = {
    columns: [
      { text: [ { text: 'Tai Yuan (Conception)\n', style: 'metricLabel' }, { text: (aux.tai_yuan || '-') + '\n', style: 'metricValue' } ] },
      { text: [ { text: 'Ming Gong (Life Palace)\n', style: 'metricLabel' }, { text: (aux.ming_gong || '-') + '\n', style: 'metricValue' } ] },
      { text: [ { text: 'Kong Wang (Emptiness)\n', style: 'metricLabel' }, { text: `Day ${aux.kong_wang_day || '-'}, Year ${aux.kong_wang_year || '-'}\n`, style: 'metricValue' } ] }
    ],
    margin: [0, 0, 0, 15]
  };

  // 2. Natal Chart Expand
  const pillarLabels = ['Hour Pillar', 'Day Pillar', 'Month Pillar', 'Year Pillar'];
  const pKeys = ['hour_pillar', 'day_pillar', 'month_pillar', 'year_pillar'];
  
  const headerRow = pillarLabels.map(l => ({ text: l, style: 'tableHeader' }));
  const stemRow = pKeys.map(k => {
    const p = fp[k]?.heavenly_stem;
    return p ? { text: `${p.character}\n${p.name}`, style: 'tableCell' } : { text: '' };
  });
  const branchRow = pKeys.map(k => {
    const p = fp[k]?.earthly_branch;
    return p ? { text: `${p.character}\n${p.name}`, style: 'tableCell' } : { text: '' };
  });
  const hiddenRow = pKeys.map(k => {
    const hStems = fp[k]?.hidden_stems || [];
    const text = hStems.map((h: any) => {
      const spelling = h.spelling ? h.spelling.charAt(0).toUpperCase() + h.spelling.slice(1) : '';
      return `${h.character} (${spelling})`;
    }).join('\n');
    return { text: text, style: 'hiddenCell' };
  });
  const lifeCycleRow = pKeys.map(k => {
    const lc = fp[k]?.life_cycle || '';
    const lcc = fp[k]?.life_cycle_chinese || '';
    return { text: lc ? `${lcc}\n${lc}` : '', style: 'hiddenCell' };
  });
  const naYinRow = pKeys.map(k => {
    const ny = fp[k]?.na_yin || '';
    return { text: ny ? `Na Yin:\n${ny}` : '', style: 'hiddenCell' };
  });
  const shenShaRow = pKeys.map(k => {
    const stars = fp[k]?.shen_sha || [];
    return { text: stars.join('\n'), style: 'hiddenCell' };
  });

  // Profiling Data
  const structuresNatal = analysis.profiling?.structures_natal || {};
  const profilingList = Object.entries(structuresNatal).map(([k, v]) => {
    return { text: `${k}: ${v}%`, margin: [0, 2, 0, 2] };
  });

  // Element Balance
  const elements = analysis.elements || {};
  const elementsList = Object.entries(elements).map(([k, v]) => {
    return { text: `${k}: ${v}%`, margin: [0, 2, 0, 2] };
  });

  // 10-Year Luck Pillars with Annual Pillars
  let luckPillars = chartData.luck_pillars || [];
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
  
  const luckBody: any[] = [];
  luckPillars.forEach((lp: any) => {
    luckBody.push([
      { text: lp.age?.toString() || '', style: 'tableCell', bold: true },
      { text: `${lp.year_start} - ${lp.year_end}`, style: 'tableCell', bold: true },
      { text: `${lp.heavenly_stem?.character || ''} ${lp.heavenly_stem?.name || ''}`, style: 'tableCell', bold: true },
      { text: `${lp.earthly_branch?.character || ''} ${lp.earthly_branch?.name || ''}`, style: 'tableCell', bold: true }
    ]);
    
    if (lp.annual_pillars && lp.annual_pillars.length > 0) {
      const apCols = lp.annual_pillars.map((ap: any) => ({
        stack: [
          { text: ap.year?.toString() || '', fontSize: 8, color: '#666', alignment: 'center' },
          { text: ap.age?.toString() || '', fontSize: 7, color: '#999', alignment: 'center' },
          { text: `${ap.stem}${ap.branch}`, fontSize: 11, bold: true, alignment: 'center', margin: [0, 2, 0, 2] }
        ]
      }));
      luckBody.push([
        { 
          colSpan: 4, 
          table: { widths: Array(apCols.length).fill('*'), body: [apCols] },
          layout: 'noBorders',
          margin: [0, 5, 0, 15]
        },
        '', '', ''
      ]);
    }
  });

  const docDefinition: any = {
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
      metricValue: { fontSize: 14, bold: true, margin: [0, 0, 0, 15] },
      smallLabel: { fontSize: 10, color: '#666' },
      smallVal: { fontSize: 10, bold: true, color: '#333' }
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
      auxBlock,
      
      { text: 'Natal Chart (Four Pillars)', style: 'sectionTitle' },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*', '*', '*'],
          body: [ headerRow, stemRow, branchRow, hiddenRow, lifeCycleRow, naYinRow, shenShaRow ]
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
      }
    ]
  };

  // Joey Yap Metrics
  if (analysis.life_star) {
    const ls = analysis.life_star;
    const toAnimals = (arr: any) => arr ? arr.join(', ') : '-';
    docDefinition.content.push(
      { text: 'Personal Chart Details', style: 'sectionTitle', pageBreak: 'before' },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [{ text: 'Celestial Animal', style: 'smallLabel' }, { text: fp.year_pillar?.earthly_branch?.name || '-', style: 'smallVal' }],
            [{ text: 'Noble People', style: 'smallLabel' }, { text: toAnimals(analysis.nobleman), style: 'smallVal' }],
            [{ text: 'Intelligence', style: 'smallLabel' }, { text: analysis.intelligence || '-', style: 'smallVal' }],
            [{ text: 'Peach Blossom', style: 'smallLabel' }, { text: analysis.peach_blossom || '-', style: 'smallVal' }],
            [{ text: 'Sky Horse', style: 'smallLabel' }, { text: analysis.sky_horse || '-', style: 'smallVal' }],
            [{ text: 'Solitary (Gu Chen)', style: 'smallLabel' }, { text: analysis.solitary || '-', style: 'smallVal' }],
            [{ text: 'Life Palace', style: 'smallLabel' }, { text: analysis.auxiliary?.ming_gong || '-', style: 'smallVal' }],
            [{ text: 'Conception', style: 'smallLabel' }, { text: analysis.auxiliary?.tai_yuan || '-', style: 'smallVal' }],
            [{ text: 'Life Star / Gua', style: 'smallLabel' }, { text: `${analysis.life_gua} ${ls.color} ${ls.element} (${ls.chinese})`, style: 'smallVal' }]
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 20]
      }
    );
  }

  // 8 Mansions
  if (analysis.eight_mansions) {
    const em = analysis.eight_mansions;
    const lucky = em.lucky || {};
    const unlucky = em.unlucky || {};
    docDefinition.content.push(
      { text: '8 Mansions Directions', style: 'sectionTitle' },
      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'Favorable Directions', bold: true, margin: [0,0,0,5] },
              { text: `Sheng Qi (Life Generating): ${lucky.wealth || '-'}`, style: 'smallLabel' },
              { text: `Tian Yi (Heavenly Doctor): ${lucky.health || '-'}`, style: 'smallLabel' },
              { text: `Yan Nian (Longevity): ${lucky.romance || '-'}`, style: 'smallLabel' },
              { text: `Fu Wei (Stability): ${lucky.career || '-'}`, style: 'smallLabel' }
            ]
          },
          {
            width: '50%',
            stack: [
              { text: 'Unfavorable Directions', bold: true, margin: [0,0,0,5], color: '#710101' },
              { text: `Huo Hai (Mishaps): ${unlucky.obstacles || '-'}`, style: 'smallLabel' },
              { text: `Wu Gui (Five Ghosts): ${unlucky.quarrels || '-'}`, style: 'smallLabel' },
              { text: `Liu Sha (Six Killings): ${unlucky.setbacks || '-'}`, style: 'smallLabel' },
              { text: `Jue Ming (Life Threatening): ${unlucky.totalLoss || '-'}`, style: 'smallLabel' }
            ]
          }
        ],
        margin: [0, 0, 0, 20]
      }
    );
  }

  // Annual Stars
  if (analysis.annual_stars) {
    const ast = analysis.annual_stars;
    const renderStars = (stars: any) => {
      let out = '';
      if (stars?.auspicious?.length) out += stars.auspicious.map((s: string) => `★ ${s}`).join('\n') + '\n';
      if (stars?.inauspicious?.length) out += stars.inauspicious.map((s: string) => `✦ ${s}`).join('\n');
      return out || 'None';
    };
    docDefinition.content.push(
      { text: `${ast.year} (${ast.pillar}) Annual Stars`, style: 'sectionTitle' },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*', '*', '*'],
          body: [
            ['Hour Branch', 'Day Branch', 'Month Branch', 'Year Branch'].map(t => ({ text: t, style: 'tableHeader' })),
            [
              renderStars(ast.hour_branch_stars),
              renderStars(ast.day_branch_stars),
              renderStars(ast.month_branch_stars),
              renderStars(ast.year_branch_stars)
            ].map(t => ({ text: t, style: 'tableCell', fontSize: 10 }))
          ]
        },
        layout: 'lightHorizontalLines'
      }
    );
  }

  // Monthly Influence
  if (analysis.monthly_influence && analysis.monthly_influence.length > 0) {
    docDefinition.content.push({ text: 'Monthly Influence', style: 'sectionTitle', pageBreak: 'before' });
    const miBody = [
      ['Month', 'Stem', 'Branch', 'Hidden Stems'].map(t => ({ text: t, style: 'tableHeader' }))
    ];
    analysis.monthly_influence.forEach((m: any) => {
      const monthName = new Date(m.gregorian_year, m.gregorian_month - 1).toLocaleString('default', { month: 'short' }).toUpperCase();
      const hStems = (m.hidden_stems || []).map((h:any) => `${h.character}`).join(' ');
      miBody.push([
        { text: `${monthName} ${m.gregorian_year}`, style: 'tableCell', fontSize: 12 },
        { text: m.stem?.character || '', style: 'tableCell', fontSize: 16, bold: true },
        { text: m.branch?.character || '', style: 'tableCell', fontSize: 16, bold: true },
        { text: hStems, style: 'hiddenCell', margin: [0, 10, 0, 10] }
      ] as any);
    });
    docDefinition.content.push({
      table: {
        headerRows: 1,
        widths: ['auto', 'auto', 'auto', '*'],
        body: miBody
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 20]
    });
  }

  // Luck Pillars (10 Year + Annuals)
  docDefinition.content.push(
    { text: '10-Year Luck Pillars', style: 'sectionTitle', pageBreak: 'before' },
    {
      table: {
        headerRows: 1,
        widths: ['auto', 'auto', '*', '*'],
        body: [ luckHeader, ...luckBody ]
      },
      layout: 'lightHorizontalLines'
    }
  );

  // QMDJ
  if (data.qmdj && data.qmdj.palaces && data.qmdj.palaces.length > 0) {
    const pMap: Record<number, any> = {};
    data.qmdj.palaces.forEach((p: any) => { pMap[p.id] = p; });
    
    // Badges logic
    const kw = data.qmdj.kong_wang?.palaces || [];
    const tm = data.qmdj.tian_ma?.palace || null;
    const mgStr = analysis.auxiliary?.ming_gong || '';
    const mgBranch = mgStr.length >= 2 ? mgStr[1] : '';
    const BRANCH_PALACE: Record<string, number> = {
      '子': 1, '丑': 8, '寅': 8, '卯': 3, '辰': 4, '巳': 4,
      '午': 9, '未': 2, '申': 2, '酉': 7, '戌': 6, '亥': 6
    };
    const mgPalace = mgBranch ? BRANCH_PALACE[mgBranch] : null;

    const formatPalace = (p: any) => {
      if (!p) return { text: '' };
      let badges = [];
      if (kw.includes(p.id)) badges.push('空');
      if (tm === p.id) badges.push('馬');
      if (mgPalace === p.id) badges.push('命');
      const badgeStr = badges.length ? `[${badges.join(',')}]` : '';

      if (p.id === 5) return { text: `Center ${badgeStr}\n\n${p.heaven_stem || ''}\n${p.earth_stem || ''}`, style: 'tableCell' };
      return { text: `${badgeStr}\n${p.god || ''}\n${p.star || ''}\n${p.door || ''}\n${p.heaven_stem || ''} / ${p.earth_stem || ''}`, style: 'tableCell' };
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
