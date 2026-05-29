import path from 'path';

export function buildPdfDefinition(data: any, name: string) {
  const chartData = data.chartData || {};
  const fp = chartData.four_pillars || {};
  const analysis = chartData.analysis || {};
  const dm = fp.day_pillar?.heavenly_stem?.character || '';
  const dmName = fp.day_pillar?.heavenly_stem?.name || '';
  const strength = analysis.dm_strength_label || '';
  const strengthScore = analysis.dm_strength || '';
  const structure = analysis.main_structure || '';
  const aux = analysis.auxiliary || {};

  // ═══════════════════════════════════════════════════
  // 1. AUXILIARY INFO
  // ═══════════════════════════════════════════════════
  const auxBlock = {
    columns: [
      { width: '*', text: [ { text: 'Tai Yuan (Conception)\n', style: 'metricLabel' }, { text: (aux.tai_yuan || '-') + '\n', style: 'metricValue' } ] },
      { width: '*', text: [ { text: 'Ming Gong (Life Palace)\n', style: 'metricLabel' }, { text: (aux.ming_gong || '-') + '\n', style: 'metricValue' } ] },
      { width: '*', text: [ { text: 'Kong Wang (Emptiness)\n', style: 'metricLabel' }, { text: `Day: ${aux.kong_wang_day || '-'}, Year: ${aux.kong_wang_year || '-'}\n`, style: 'metricValue' } ] }
    ],
    margin: [0, 0, 0, 10] as number[]
  };

  // ═══════════════════════════════════════════════════
  // 2. NATAL CHART (FOUR PILLARS) — Full rows
  // ═══════════════════════════════════════════════════
  const pillarLabels = ['Hour Pillar', 'Day Pillar', 'Month Pillar', 'Year Pillar'];
  const pKeys = ['hour_pillar', 'day_pillar', 'month_pillar', 'year_pillar'];
  
  const headerRow = pillarLabels.map(l => ({ text: l, style: 'tableHeader' }));

  // Ten Gods row
  const tenGodRow = pKeys.map(k => {
    const hs = fp[k]?.heavenly_stem;
    if (k === 'day_pillar') return { text: 'Day Master', style: 'hiddenCell', bold: true };
    const tg = hs?.ten_god;
    return tg ? { text: `${tg.chinese}\n${tg.short}`, style: 'hiddenCell', color: '#C6A96B' } : { text: '', style: 'hiddenCell' };
  });

  const stemRow = pKeys.map(k => {
    const p = fp[k]?.heavenly_stem;
    return p ? { text: `${p.character}\n${p.name}`, style: 'tableCell' } : { text: '' };
  });

  const branchRow = pKeys.map(k => {
    const p = fp[k]?.earthly_branch;
    return p ? { text: `${p.character}\n${p.spelling ? p.spelling.charAt(0).toUpperCase() + p.spelling.slice(1) : ''}\n${p.name}`, style: 'tableCell' } : { text: '' };
  });

  const hiddenRow = pKeys.map(k => {
    const hStems = fp[k]?.hidden_stems || [];
    const text = hStems.map((h: any) => {
      const spelling = h.spelling ? h.spelling.charAt(0).toUpperCase() + h.spelling.slice(1) : '';
      const tgStr = h.ten_god ? ` (${h.ten_god.short})` : '';
      return `${h.character} ${spelling}${tgStr}`;
    }).join('\n');
    return { text: text || '-', style: 'hiddenCell' };
  });

  const lifeCycleRow = pKeys.map(k => {
    const lc = fp[k]?.life_cycle || '';
    const lcc = fp[k]?.life_cycle_chinese || '';
    return { text: lc ? `${lcc} ${lc}` : '-', style: 'hiddenCell' };
  });

  const naYinRow = pKeys.map(k => {
    const ny = fp[k]?.na_yin || '';
    return { text: ny || '-', style: 'hiddenCell' };
  });

  const shenShaRow = pKeys.map(k => {
    const eb = fp[k]?.earthly_branch;
    const stars = eb?.shen_sha || [];
    return { text: stars.length > 0 ? stars.join('\n') : '-', style: 'hiddenCell' };
  });

  // ═══════════════════════════════════════════════════
  // 3. FIVE ELEMENTS BALANCE (from five_factors)
  // ═══════════════════════════════════════════════════
  const fiveFactors = analysis.five_factors || {};
  const elKeys = ['WOOD', 'FIRE', 'EARTH', 'METAL', 'WATER'];
  const elLabels: Record<string, string> = { WOOD: 'Wood', FIRE: 'Fire', EARTH: 'Earth', METAL: 'Metal', WATER: 'Water' };
  const elTotal = elKeys.reduce((sum, k) => sum + (fiveFactors[k] || 0), 0) || 1;
  const elementsList = elKeys.map(k => {
    const val = fiveFactors[k] || 0;
    const pct = Math.round((val / elTotal) * 100);
    return { text: `${elLabels[k]}: ${val} (${pct}%)`, margin: [0, 3, 0, 3] as number[] };
  });

  // ═══════════════════════════════════════════════════
  // 4. DESTINY PROFILING — 5 structures + 10 Gods bars
  // ═══════════════════════════════════════════════════
  const profiling = analysis.profiling || {};
  const structuresNatal = profiling.structures_natal || {};
  const structuresList = Object.entries(structuresNatal).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]) => {
    return { text: `${k}: ${v}%`, margin: [0, 2, 0, 2] as number[] };
  });

  // 10 Gods profiling bars (Friend, Direct Wealth, etc.)
  const natalPct = profiling.natal_percentages || {};
  const annualPct = profiling.annual_percentages || {};
  const sortedGods = Object.entries(natalPct).sort((a: any, b: any) => b[1] - a[1]);
  
  const profilingHeader = [
    { text: 'Ten God', style: 'tableHeader' },
    { text: 'Natal %', style: 'tableHeader' },
    { text: 'Annual %', style: 'tableHeader' }
  ];
  const profilingBody = sortedGods.map(([god, pct]: [string, any]) => {
    const annP = (annualPct as any)[god] || 0;
    return [
      { text: god, style: 'smallVal' },
      { text: `${pct}%`, style: 'tableCell', color: '#C6A96B' },
      { text: `${annP}%`, style: 'tableCell', color: '#710101' }
    ];
  });

  // ═══════════════════════════════════════════════════
  // 5. LUCK PILLARS (10-Year + Annual Pillars inside)
  // ═══════════════════════════════════════════════════
  let luckPillars = chartData.luck_pillars || [];
  if (luckPillars && !Array.isArray(luckPillars) && Array.isArray(luckPillars.luck_pillars)) {
    luckPillars = luckPillars.luck_pillars;
  }
  if (!Array.isArray(luckPillars)) luckPillars = [];

  const luckHeader = [
    { text: 'Age', style: 'tableHeader' },
    { text: 'Years', style: 'tableHeader' },
    { text: 'Heavenly Stem', style: 'tableHeader' },
    { text: 'Earthly Branch', style: 'tableHeader' },
    { text: 'Na Yin', style: 'tableHeader' },
    { text: 'Hidden Stems', style: 'tableHeader' },
    { text: 'Life Cycle', style: 'tableHeader' }
  ];

  const luckBody = luckPillars.map((lp: any) => {
    const hStems = (lp.hidden_stems || []).map((h: any) => h.character).join(' ');
    const lcStage = lp.life_cycle ? (lp.life_cycle.chinese || lp.life_cycle) : '';
    return [
      { text: lp.age?.toString() || '', style: 'tableCell', fontSize: 11 },
      { text: `${lp.year_start}-${lp.year_end}`, style: 'tableCell', fontSize: 10 },
      { text: `${lp.heavenly_stem?.character || ''} ${lp.heavenly_stem?.name || ''}`, style: 'tableCell', fontSize: 11 },
      { text: `${lp.earthly_branch?.character || ''} ${lp.earthly_branch?.name || ''}`, style: 'tableCell', fontSize: 11 },
      { text: lp.na_yin || '', style: 'hiddenCell' },
      { text: hStems || '', style: 'hiddenCell' },
      { text: lcStage || '', style: 'hiddenCell' }
    ];
  });

  // ═══════════════════════════════════════════════════
  // 6. ANNUAL LUCK MATRIX
  // ═══════════════════════════════════════════════════
  const annualMatrixContent: any[] = [];
  luckPillars.forEach((lp: any) => {
    if (lp.annual_pillars && lp.annual_pillars.length > 0) {
      annualMatrixContent.push({
        text: `Age ${lp.age} (${lp.year_start}-${lp.year_end}): ${lp.heavenly_stem?.character || ''}${lp.earthly_branch?.character || ''}`,
        bold: true, fontSize: 11, margin: [0, 10, 0, 5] as number[], color: '#710101'
      });

      const apHeader = lp.annual_pillars.map((ap: any) => ({
        text: `${ap.year}\nAge ${ap.age}`, fontSize: 8, alignment: 'center', bold: true, color: '#666'
      }));
      const apStems = lp.annual_pillars.map((ap: any) => ({
        text: `${ap.stem}${ap.branch}`, fontSize: 12, alignment: 'center', bold: true
      }));
      const apTenGods = lp.annual_pillars.map((ap: any) => ({
        text: ap.ten_god ? ap.ten_god.chinese : '', fontSize: 9, alignment: 'center', color: '#C6A96B'
      }));

      annualMatrixContent.push({
        table: {
          widths: Array(lp.annual_pillars.length).fill('*'),
          body: [apHeader, apStems, apTenGods]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 5] as number[]
      });
    }
  });

  // ═══════════════════════════════════════════════════
  // BUILD DOC DEFINITION
  // ═══════════════════════════════════════════════════
  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    defaultStyle: { font: 'NotoSansSC', fontSize: 11, color: '#333333' },
    styles: {
      header: { fontSize: 24, bold: true, alignment: 'center', margin: [0, 0, 0, 10] },
      subheader: { fontSize: 14, alignment: 'center', margin: [0, 0, 0, 20], color: '#666666' },
      sectionTitle: { fontSize: 16, bold: true, margin: [0, 20, 0, 10], color: '#710101' },
      tableHeader: { bold: true, fontSize: 10, color: 'white', fillColor: '#710101', alignment: 'center', margin: [0, 5, 0, 5] },
      tableCell: { fontSize: 13, alignment: 'center', margin: [0, 8, 0, 8] },
      hiddenCell: { fontSize: 9, alignment: 'center', margin: [0, 4, 0, 4], color: '#666' },
      metricLabel: { fontSize: 10, color: '#888888', margin: [0, 0, 0, 2] },
      metricValue: { fontSize: 13, bold: true, margin: [0, 0, 0, 12] },
      smallLabel: { fontSize: 10, color: '#666', margin: [5, 6, 5, 6] },
      smallVal: { fontSize: 10, bold: true, color: '#333', margin: [5, 6, 5, 6] }
    },
    content: [
      // ── PAGE 1: Title + Summary + Natal Chart ──
      { text: 'The Full Picture', style: 'header' },
      { text: 'BaZi Destiny Report', style: 'subheader' },
      
      // Client Summary
      {
        columns: [
          { width: '*', text: [{ text: 'Client Name\n', style: 'metricLabel' }, { text: (name || 'Client') + '\n', style: 'metricValue' }] },
          { width: '*', text: [{ text: 'Day Master\n', style: 'metricLabel' }, { text: `${dm} (${dmName})\n`, style: 'metricValue' }] },
          { width: '*', text: [{ text: 'Strength\n', style: 'metricLabel' }, { text: `${strengthScore}/10 - ${strength}\n`, style: 'metricValue' }] },
          { width: '*', text: [{ text: 'Structure\n', style: 'metricLabel' }, { text: structure + '\n', style: 'metricValue' }] }
        ]
      },
      auxBlock,

      // Natal Chart
      { text: 'Natal Chart (Four Pillars)', style: 'sectionTitle' },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*', '*', '*'],
          body: [headerRow, tenGodRow, stemRow, branchRow, hiddenRow, lifeCycleRow, naYinRow, shenShaRow]
        },
        layout: 'lightHorizontalLines'
      },

      // ── PAGE 2: Five Elements + Profiling ──
      { text: 'Five Elements Balance', style: 'sectionTitle', pageBreak: 'before' },
      ...elementsList,

      { text: 'Destiny Profiling (5 Structures)', style: 'sectionTitle' },
      ...structuresList,

      // 10 Gods bars
      { text: 'Ten Gods Profiling (Natal vs Annual)', style: 'sectionTitle' },
      profilingBody.length > 0 ? {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body: [profilingHeader, ...profilingBody]
        },
        layout: 'lightHorizontalLines'
      } : { text: 'No profiling data available.', style: 'hiddenCell' },

      // ── PAGE 3: Personal Chart Details + 8 Mansions ──
    ] as any[]
  };

  // ═══════════════════════════════════════════════════
  // JOEY YAP PERSONAL CHART DETAILS
  // ═══════════════════════════════════════════════════
  if (analysis.life_star || analysis.nobleman) {
    const ls = analysis.life_star || {};
    const toStr = (arr: any) => Array.isArray(arr) ? arr.join(', ') : (arr || '-');
    docDefinition.content.push(
      { text: 'Personal Chart Details', style: 'sectionTitle', pageBreak: 'before' },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [{ text: 'Celestial Animal', style: 'smallLabel' }, { text: fp.year_pillar?.earthly_branch?.name || '-', style: 'smallVal' }],
            [{ text: 'Noble People', style: 'smallLabel' }, { text: toStr(analysis.nobleman), style: 'smallVal' }],
            [{ text: 'Intelligence', style: 'smallLabel' }, { text: analysis.intelligence || '-', style: 'smallVal' }],
            [{ text: 'Peach Blossom', style: 'smallLabel' }, { text: analysis.peach_blossom || '-', style: 'smallVal' }],
            [{ text: 'Sky Horse', style: 'smallLabel' }, { text: analysis.sky_horse || '-', style: 'smallVal' }],
            [{ text: 'Solitary (Gu Chen)', style: 'smallLabel' }, { text: analysis.solitary || '-', style: 'smallVal' }],
            [{ text: 'Life Palace', style: 'smallLabel' }, { text: aux.ming_gong || '-', style: 'smallVal' }],
            [{ text: 'Conception', style: 'smallLabel' }, { text: aux.tai_yuan || '-', style: 'smallVal' }],
            [{ text: 'Life Star / Gua', style: 'smallLabel' }, { text: `${analysis.life_gua || ''} ${ls.color || ''} ${ls.element || ''} ${ls.chinese ? '(' + ls.chinese + ')' : ''}`.trim() || '-', style: 'smallVal' }]
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 20] as number[]
      }
    );
  }

  // ═══════════════════════════════════════════════════
  // 8 MANSIONS DIRECTIONS
  // ═══════════════════════════════════════════════════
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
              { text: 'Favorable', bold: true, fontSize: 12, color: '#C6A96B', margin: [0, 0, 0, 8] as number[] },
              { text: `Sheng Qi (Life Generating): ${lucky.wealth || '-'}`, margin: [0, 3, 0, 3] as number[] },
              { text: `Tian Yi (Heavenly Doctor): ${lucky.health || '-'}`, margin: [0, 3, 0, 3] as number[] },
              { text: `Yan Nian (Longevity): ${lucky.romance || '-'}`, margin: [0, 3, 0, 3] as number[] },
              { text: `Fu Wei (Stability): ${lucky.career || '-'}`, margin: [0, 3, 0, 3] as number[] }
            ]
          },
          {
            width: '50%',
            stack: [
              { text: 'Unfavorable', bold: true, fontSize: 12, color: '#710101', margin: [0, 0, 0, 8] as number[] },
              { text: `Huo Hai (Mishaps): ${unlucky.obstacles || '-'}`, margin: [0, 3, 0, 3] as number[] },
              { text: `Wu Gui (Five Ghosts): ${unlucky.quarrels || '-'}`, margin: [0, 3, 0, 3] as number[] },
              { text: `Liu Sha (Six Killings): ${unlucky.setbacks || '-'}`, margin: [0, 3, 0, 3] as number[] },
              { text: `Jue Ming (Life Threatening): ${unlucky.totalLoss || '-'}`, margin: [0, 3, 0, 3] as number[] }
            ]
          }
        ],
        margin: [0, 0, 0, 20] as number[]
      }
    );
  }

  // ═══════════════════════════════════════════════════
  // ANNUAL STARS
  // ═══════════════════════════════════════════════════
  if (analysis.annual_stars) {
    const ast = analysis.annual_stars;
    const renderStars = (stars: any) => {
      let parts: string[] = [];
      if (stars?.auspicious?.length) parts.push(...stars.auspicious.map((s: string) => `[+] ${s}`));
      if (stars?.inauspicious?.length) parts.push(...stars.inauspicious.map((s: string) => `[-] ${s}`));
      return parts.join('\n') || 'None';
    };
    docDefinition.content.push(
      { text: `${ast.year} (${ast.pillar}) Annual Stars`, style: 'sectionTitle', pageBreak: 'before' },
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
            ].map(t => ({ text: t, style: 'tableCell', fontSize: 9, alignment: 'center' }))
          ]
        },
        layout: 'lightHorizontalLines'
      }
    );
  }

  // ═══════════════════════════════════════════════════
  // MONTHLY INFLUENCE (standalone — current year)
  // ═══════════════════════════════════════════════════
  if (analysis.monthly_influence && analysis.monthly_influence.length > 0) {
    const miBody: any[][] = [
      ['Month', 'Stem', 'Branch', 'Ten God', 'Hidden Stems'].map(t => ({ text: t, style: 'tableHeader' }))
    ];
    analysis.monthly_influence.forEach((m: any) => {
      const monthName = new Date(m.gregorian_year, m.gregorian_month - 1).toLocaleString('default', { month: 'short' }).toUpperCase();
      const hStems = (m.hidden_stems || []).map((h: any) => {
        const tg = h.ten_god ? h.ten_god.chinese : '';
        return `${h.character}${tg ? ' ' + tg : ''}`;
      }).join('\n');
      const stemTg = m.stem?.ten_god ? m.stem.ten_god.chinese : '';
      miBody.push([
        { text: `${monthName} ${m.gregorian_year}`, style: 'tableCell', fontSize: 10 },
        { text: m.stem?.character || '', style: 'tableCell', fontSize: 14, bold: true },
        { text: m.branch?.character || '', style: 'tableCell', fontSize: 14, bold: true },
        { text: stemTg, style: 'hiddenCell', color: '#C6A96B' },
        { text: hStems, style: 'hiddenCell' }
      ]);
    });
    docDefinition.content.push(
      { text: 'Monthly Influence (Current Year)', style: 'sectionTitle', pageBreak: 'before' },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', 'auto', '*'],
          body: miBody
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 20] as number[]
      }
    );
  }

  // ═══════════════════════════════════════════════════
  // 10-YEAR LUCK PILLARS TABLE
  // ═══════════════════════════════════════════════════
  if (luckBody.length > 0) {
    docDefinition.content.push(
      { text: '10-Year Luck Pillars', style: 'sectionTitle', pageBreak: 'before' },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', 'auto', '*', 'auto', 'auto'],
          body: [luckHeader, ...luckBody]
        },
        layout: 'lightHorizontalLines'
      }
    );
  }

  // ═══════════════════════════════════════════════════
  // ANNUAL LUCK MATRIX (10 annual pillars per decade)
  // ═══════════════════════════════════════════════════
  if (annualMatrixContent.length > 0) {
    docDefinition.content.push(
      { text: 'Annual Luck Matrix', style: 'sectionTitle', pageBreak: 'before' },
      ...annualMatrixContent
    );
  }

  // ═══════════════════════════════════════════════════
  // QI MEN DUN JIA (QMDJ)
  // ═══════════════════════════════════════════════════
  const qmdj = chartData.qmdj;  // QMDJ is inside chartData, not at top level
  if (qmdj && qmdj.palaces && qmdj.palaces.length > 0) {
    const pMap: Record<number, any> = {};
    qmdj.palaces.forEach((p: any) => { pMap[p.id] = p; });
    
    const kw = qmdj.kong_wang?.palaces || [];
    const tm = qmdj.tian_ma?.palace || null;
    const mgStr = aux.ming_gong || '';
    const mgBranch = mgStr.length >= 2 ? mgStr[1] : '';
    const BRANCH_PALACE: Record<string, number> = {
      '子': 1, '丑': 8, '寅': 8, '卯': 3, '辰': 4, '巳': 4,
      '午': 9, '未': 2, '申': 2, '酉': 7, '戌': 6, '亥': 6
    };
    const mgPalace = mgBranch ? BRANCH_PALACE[mgBranch] : null;

    const formatPalace = (p: any) => {
      if (!p) return { text: '-', style: 'tableCell' };
      let badges: string[] = [];
      if (kw.includes(p.id)) badges.push('[Void]');
      if (tm === p.id) badges.push('[Horse]');
      if (mgPalace === p.id) badges.push('[Destiny]');
      const badgeStr = badges.length ? badges.join(' ') + '\n' : '';

      if (p.id === 5) return { text: `${badgeStr}Center\n${p.heaven_stem || ''}\n${p.earth_stem || ''}`, style: 'tableCell', fontSize: 10 };
      return { text: `${badgeStr}${p.god || ''}\n${p.star || ''}\n${p.door || ''}\n${p.heaven_stem || ''} / ${p.earth_stem || ''}`, style: 'tableCell', fontSize: 10 };
    };

    const luoShuLabels = [
      ['SE 4', 'S 9', 'SW 2'],
      ['E 3', 'C 5', 'W 7'],
      ['NE 8', 'N 1', 'NW 6']
    ];
    const qmdjGrid = [
      [formatPalace(pMap[4]), formatPalace(pMap[9]), formatPalace(pMap[2])],
      [formatPalace(pMap[3]), formatPalace(pMap[5]), formatPalace(pMap[7])],
      [formatPalace(pMap[8]), formatPalace(pMap[1]), formatPalace(pMap[6])]
    ];

    docDefinition.content.push(
      { text: 'Qi Men Dun Jia (Destiny Palace)', style: 'sectionTitle', pageBreak: 'before' },
      { text: `Solar Term: ${qmdj.solar_term || '-'}  |  Ju: ${qmdj.ju || '-'}`, style: 'metricLabel' },
      { text: `Zhi Fu: ${qmdj.duty_star || '-'}  |  Zhi Shi: ${qmdj.duty_door || '-'}`, style: 'metricLabel', margin: [0, 0, 0, 5] as number[] },
      { text: `Kong Wang: ${qmdj.kong_wang?.branches || '-'}  |  Tian Ma: ${qmdj.tian_ma?.branch || '-'}`, style: 'metricLabel', margin: [0, 0, 0, 15] as number[] },
      {
        table: {
          widths: ['*', '*', '*'],
          body: qmdjGrid
        },
        layout: 'lightHorizontalLines'
      }
    );
  }

  return docDefinition;
}
