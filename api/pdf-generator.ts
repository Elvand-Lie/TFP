import * as path from 'path';

// ─── COLOR PALETTE ─────────────────────────────────────────
const C = {
  crimson: '#710101',
  darkRed: '#591F16',
  gold: '#C6A96B',
  darkGold: '#9A7D3F',
  ivory: '#F5F2ED',
  lightGrey: '#F8F8F6',
  medGrey: '#E8E5E0',
  textDark: '#1C1C1E',
  textMed: '#555555',
  textLight: '#888580',
  white: '#FFFFFF',
  green: '#2D6A4F',
  red: '#C0392B',
};

// ─── CUSTOM TABLE LAYOUTS ──────────────────────────────────
const natalLayout = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1.5 : 0.5,
  vLineWidth: () => 0.5,
  hLineColor: (i: number) => i <= 1 ? C.crimson : C.medGrey,
  vLineColor: () => C.medGrey,
  paddingTop: () => 6,
  paddingBottom: () => 6,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  fillColor: (rowIndex: number) => rowIndex === 0 ? C.crimson : (rowIndex % 2 === 0 ? C.lightGrey : null),
};

const cleanLayout = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
  vLineWidth: () => 0,
  hLineColor: (i: number) => i <= 1 ? C.crimson : '#E0E0E0',
  paddingTop: () => 5,
  paddingBottom: () => 5,
  paddingLeft: () => 8,
  paddingRight: () => 8,
  fillColor: (rowIndex: number) => rowIndex === 0 ? C.crimson : (rowIndex % 2 === 0 ? '#FAFAFA' : null),
};

const qmdjLayout = {
  hLineWidth: () => 1.5,
  vLineWidth: () => 1.5,
  hLineColor: () => C.crimson,
  vLineColor: () => C.crimson,
  paddingTop: () => 10,
  paddingBottom: () => 10,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  fillColor: () => '#FDFCFB',
};

const cardLayout = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0 : 0.5,
  vLineWidth: () => 0,
  hLineColor: () => '#E8E5E0',
  paddingTop: () => 6,
  paddingBottom: () => 6,
  paddingLeft: () => 10,
  paddingRight: () => 10,
  fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? '#FAFAF8' : null,
};

// ─── HELPER: Section divider ────────────────────────────────
function sectionTitle(title: string, subtitle?: string, pageBreak?: boolean): any[] {
  const items: any[] = [];
  if (pageBreak) items.push({ text: '', pageBreak: 'before' });
  items.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 50, y2: 0, lineWidth: 2, lineColor: C.crimson }], margin: [0, 20, 0, 6] as number[] });
  items.push({ text: title, fontSize: 16, bold: true, color: C.crimson, margin: [0, 0, 0, subtitle ? 2 : 12] as number[] });
  if (subtitle) items.push({ text: subtitle, fontSize: 9, color: C.textLight, margin: [0, 0, 0, 10] as number[] });
  return items;
}

// ═══════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════
export function buildPdfDefinition(data: any, name: string) {
  const chartData = data.chartData || {};
  const fp = chartData.four_pillars || {};
  const analysis = chartData.analysis || {};
  const aux = analysis.auxiliary || {};

  const dm = fp.day_pillar?.heavenly_stem?.character || '';
  const dmName = fp.day_pillar?.heavenly_stem?.name || '';
  const strength = analysis.dm_strength_label || '';
  const strengthScore = analysis.dm_strength || '';
  const structure = analysis.main_structure || '';

  // Resolve luck_pillars array
  let luckPillarsArr: any[] = [];
  const lpRaw = chartData.luck_pillars;
  if (Array.isArray(lpRaw)) luckPillarsArr = lpRaw;
  else if (lpRaw && Array.isArray(lpRaw.luck_pillars)) luckPillarsArr = lpRaw.luck_pillars;

  // ═══════════════════════════════════════════════════
  // DATA PREPARATION
  // ═══════════════════════════════════════════════════
  const pKeys = ['hour_pillar', 'day_pillar', 'month_pillar', 'year_pillar'];
  const pillarLabels = ['', '時 Hour', '日 Day', '月 Month', '年 Year'];

  // Natal Chart rows (with row labels)
  const headerRow = pillarLabels.map((l, i) => ({ text: l, bold: true, fontSize: 9, color: C.white, fillColor: C.crimson, alignment: 'center', margin: [0, 6, 0, 6] as number[] }));

  // Ten God + Heavenly Stem COMBINED into one row
  const stemRow = [{ text: 'Heavenly\nStem 天干', fontSize: 8, color: C.textDark, alignment: 'center' }, ...pKeys.map(k => {
    const p = fp[k]?.heavenly_stem;
    if (!p) return { text: '-', alignment: 'center' };
    const tg = p.ten_god;
    if (k === 'day_pillar') {
      return { stack: [
        { text: 'Day Master', fontSize: 8, bold: true, color: C.crimson, alignment: 'center' },
        { text: p.character, fontSize: 18, bold: true, alignment: 'center', margin: [0, 2, 0, 0] as number[] },
        { text: p.name, fontSize: 9, alignment: 'center', color: C.textDark }
      ], alignment: 'center' };
    }
    return { stack: [
      tg ? { text: `${tg.chinese} ${tg.short}`, fontSize: 9, color: C.gold, alignment: 'center' } : { text: '', alignment: 'center' },
      { text: p.character, fontSize: 18, bold: true, alignment: 'center', margin: [0, 2, 0, 0] as number[] },
      { text: p.name, fontSize: 9, alignment: 'center', color: C.textDark }
    ], alignment: 'center' };
  })];

  const branchRow = [{ text: 'Earthly\nBranch 地支', fontSize: 8, color: C.textDark, alignment: 'center' }, ...pKeys.map(k => {
    const p = fp[k]?.earthly_branch;
    if (!p) return { text: '-', alignment: 'center' };
    const spelling = p.spelling ? p.spelling.charAt(0).toUpperCase() + p.spelling.slice(1) : '';
    return { text: `${p.character}\n${spelling}\n${p.name || ''}`, fontSize: 12, bold: true, alignment: 'center', color: C.textDark };
  })];

  const hiddenRow = [{ text: 'Hidden\nStems 藏干', fontSize: 8, color: C.textDark, alignment: 'center' }, ...pKeys.map(k => {
    const hStems = fp[k]?.hidden_stems || [];
    const text = hStems.map((h: any) => {
      const tgStr = h.ten_god ? ` (${h.ten_god.short})` : '';
      return `${h.character}${tgStr}`;
    }).join('\n');
    return { text: text || '-', fontSize: 9, alignment: 'center', color: C.textDark };
  })];

  const lifeCycleRow = [{ text: 'Life\nCycle 長生', fontSize: 8, color: C.textDark, alignment: 'center' }, ...pKeys.map(k => {
    const lc = fp[k]?.life_cycle || '';
    const lcc = fp[k]?.life_cycle_chinese || '';
    return { text: lc ? `${lcc} ${lc}` : '-', fontSize: 9, alignment: 'center', color: C.textDark };
  })];

  const naYinRow = [{ text: 'Na Yin\n納音', fontSize: 8, color: C.textDark, alignment: 'center' }, ...pKeys.map(k => {
    return { text: fp[k]?.na_yin || '-', fontSize: 9, alignment: 'center', color: C.textDark };
  })];

  const shenShaRow = [{ text: 'Shen Sha\n神煞', fontSize: 8, color: C.textDark, alignment: 'center' }, ...pKeys.map(k => {
    const stars = fp[k]?.earthly_branch?.shen_sha || [];
    return { text: stars.length > 0 ? stars.join('\n') : '-', fontSize: 8, alignment: 'center', color: C.textDark };
  })];

  // ═══════════════════════════════════════════════════
  // BUILD DOCUMENT
  // ═══════════════════════════════════════════════════
  const content: any[] = [];

  // ─── COVER / HEADER ───
  content.push(
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 3, color: C.crimson }], margin: [0, 0, 0, 20] as number[] },
    { text: 'THE FULL PICTURE', fontSize: 10, letterSpacing: 4, color: C.gold, alignment: 'center', margin: [0, 0, 0, 4] as number[] },
    { text: 'BaZi Destiny Report', fontSize: 26, bold: true, color: C.textDark, alignment: 'center', margin: [0, 0, 0, 4] as number[] },
    { text: '八字命理報告', fontSize: 14, color: C.textLight, alignment: 'center', margin: [0, 0, 0, 20] as number[] },
    { canvas: [{ type: 'line', x1: 200, y1: 0, x2: 315, y2: 0, lineWidth: 1, lineColor: C.crimson }], margin: [0, 0, 0, 20] as number[] }
  );

  // ─── CLIENT SUMMARY CARD ───
  content.push({
    table: {
      widths: ['*', '*', '*', '*'],
      body: [[
        { stack: [{ text: 'CLIENT', fontSize: 7, color: C.gold, letterSpacing: 1.5 }, { text: name || 'Client', fontSize: 13, bold: true, color: C.textDark, margin: [0, 3, 0, 0] as number[] }], margin: [10, 8, 0, 8] as number[] },
        { stack: [{ text: 'DAY MASTER', fontSize: 7, color: C.gold, letterSpacing: 1.5 }, { text: `${dm} ${dmName}`, fontSize: 13, bold: true, color: C.textDark, margin: [0, 3, 0, 0] as number[] }], margin: [10, 8, 0, 8] as number[] },
        { stack: [{ text: 'STRENGTH', fontSize: 7, color: C.gold, letterSpacing: 1.5 }, { text: `${strengthScore}/10 — ${strength}`, fontSize: 13, bold: true, color: C.textDark, margin: [0, 3, 0, 0] as number[] }], margin: [10, 8, 0, 8] as number[] },
        { stack: [{ text: 'STRUCTURE', fontSize: 7, color: C.gold, letterSpacing: 1.5 }, { text: structure, fontSize: 11, bold: true, color: C.textDark, margin: [0, 3, 0, 0] as number[] }], margin: [10, 8, 0, 8] as number[] }
      ]]
    },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => i === 0 || i === 4 ? 0 : 0.5, vLineColor: () => C.medGrey, fillColor: () => C.lightGrey, paddingTop: () => 0, paddingBottom: () => 0, paddingLeft: () => 0, paddingRight: () => 0 },
    margin: [0, 0, 0, 8] as number[]
  });

  // Auxiliary info
  content.push({
    table: {
      widths: ['*', '*', '*'],
      body: [[
        { stack: [{ text: 'Tai Yuan (Conception)', fontSize: 8, color: C.textLight }, { text: aux.tai_yuan || '-', fontSize: 11, bold: true, margin: [0, 2, 0, 0] as number[] }], margin: [10, 6, 0, 6] as number[] },
        { stack: [{ text: 'Ming Gong (Life Palace)', fontSize: 8, color: C.textLight }, { text: aux.ming_gong || '-', fontSize: 11, bold: true, margin: [0, 2, 0, 0] as number[] }], margin: [10, 6, 0, 6] as number[] },
        { stack: [{ text: 'Kong Wang (Emptiness)', fontSize: 8, color: C.textLight }, { text: `Day: ${aux.kong_wang_day || '-'}  Year: ${aux.kong_wang_year || '-'}`, fontSize: 11, bold: true, margin: [0, 2, 0, 0] as number[] }], margin: [10, 6, 0, 6] as number[] }
      ]]
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#FAFAF8' },
    margin: [0, 0, 0, 15] as number[]
  });

  // ─── NATAL CHART ───
  content.push(...sectionTitle('Natal Chart', 'Four Pillars of Destiny · 本命八字'));
  content.push({
    table: {
      headerRows: 1,
      widths: [55, '*', '*', '*', '*'],
      body: [headerRow, stemRow, branchRow, hiddenRow, lifeCycleRow, naYinRow, shenShaRow]
    },
    layout: natalLayout
  });

  // ─── LUCK PILLARS ───
  if (luckPillarsArr.length > 0) {
    content.push(...sectionTitle('Luck Pillars', '10-Year Luck Cycles · 大運', true));
    const lpHeader = ['Age', 'Years', 'Stem', 'Branch', 'Na Yin', 'Hidden', 'Life Cycle'].map(t => ({
      text: t, fontSize: 9, bold: true, color: C.white, fillColor: C.crimson, alignment: 'center', margin: [0, 5, 0, 5] as number[]
    }));
    const lpBody = luckPillarsArr.map((lp: any) => {
      const hStems = (lp.hidden_stems || []).map((h: any) => h.character || '').join(' ');
      const lcStage = lp.life_cycle ? (typeof lp.life_cycle === 'object' ? lp.life_cycle.chinese || '' : lp.life_cycle) : '';
      return [
        { text: lp.age?.toString() || '', fontSize: 10, bold: true, alignment: 'center' },
        { text: `${lp.year_start || ''}-${lp.year_end || ''}`, fontSize: 9, alignment: 'center', color: C.textMed },
        { text: `${lp.heavenly_stem?.character || ''} ${lp.heavenly_stem?.name || ''}`, fontSize: 10, alignment: 'center' },
        { text: `${lp.earthly_branch?.character || ''} ${lp.earthly_branch?.name || ''}`, fontSize: 10, alignment: 'center' },
        { text: lp.na_yin || '-', fontSize: 8, alignment: 'center', color: C.textMed },
        { text: hStems || '-', fontSize: 9, alignment: 'center', color: C.textMed },
        { text: lcStage || '-', fontSize: 8, alignment: 'center', color: C.textMed }
      ];
    });
    content.push({ table: { headerRows: 1, widths: ['auto', 'auto', '*', '*', 'auto', 'auto', 'auto'], body: [lpHeader, ...lpBody] }, layout: cleanLayout });
  }

  // ─── PERSONAL CHART DETAILS + 8 MANSIONS ───
  content.push(...sectionTitle('Personal Chart Details', '命理資訊', true));
  const ls = analysis.life_star || {};
  const toStr = (arr: any) => Array.isArray(arr) ? arr.join(', ') : (arr || '-');
  const detailRows = [
    ['Celestial Animal', fp.year_pillar?.earthly_branch?.name || '-'],
    ['Noble People', toStr(analysis.nobleman)],
    ['Intelligence', analysis.intelligence || '-'],
    ['Peach Blossom', analysis.peach_blossom || '-'],
    ['Sky Horse', analysis.sky_horse || '-'],
    ['Solitary (Gu Chen)', analysis.solitary || '-'],
    ['Life Palace', aux.ming_gong || '-'],
    ['Conception', aux.tai_yuan || '-'],
    ['Life Star / Gua', `${analysis.life_gua || ''} ${ls.color || ''} ${ls.element || ''} ${ls.chinese ? '(' + ls.chinese + ')' : ''}`.trim() || '-']
  ].map(([label, val]) => [
    { text: label, fontSize: 10, color: C.textMed, margin: [10, 5, 5, 5] as number[] },
    { text: val, fontSize: 10, bold: true, color: C.textDark, margin: [5, 5, 10, 5] as number[] }
  ]);
  content.push({ table: { widths: ['40%', '*'], body: detailRows }, layout: cardLayout, margin: [0, 0, 0, 15] as number[] });

  // 8 Mansions
  if (analysis.eight_mansions) {
    const em = analysis.eight_mansions;
    const lucky = em.lucky || {};
    const unlucky = em.unlucky || {};
    content.push(...sectionTitle('8 Mansions Directions', '八宅風水'));
    content.push({
      columns: [
        {
          width: '48%',
          stack: [
            { text: '[+] FAVORABLE', fontSize: 9, bold: true, color: C.green, letterSpacing: 1, margin: [0, 0, 0, 8] as number[] },
            { text: `Sheng Qi (Wealth): ${lucky.wealth || '-'}`, fontSize: 10, margin: [0, 3, 0, 3] as number[] },
            { text: `Tian Yi (Health): ${lucky.health || '-'}`, fontSize: 10, margin: [0, 3, 0, 3] as number[] },
            { text: `Yan Nian (Romance): ${lucky.romance || '-'}`, fontSize: 10, margin: [0, 3, 0, 3] as number[] },
            { text: `Fu Wei (Career): ${lucky.career || '-'}`, fontSize: 10, margin: [0, 3, 0, 3] as number[] }
          ]
        },
        { width: '4%', text: '' },
        {
          width: '48%',
          stack: [
            { text: '[-] UNFAVORABLE', fontSize: 9, bold: true, color: C.red, letterSpacing: 1, margin: [0, 0, 0, 8] as number[] },
            { text: `Huo Hai (Mishaps): ${unlucky.obstacles || '-'}`, fontSize: 10, margin: [0, 3, 0, 3] as number[] },
            { text: `Wu Gui (Five Ghosts): ${unlucky.quarrels || '-'}`, fontSize: 10, margin: [0, 3, 0, 3] as number[] },
            { text: `Liu Sha (Six Killings): ${unlucky.setbacks || '-'}`, fontSize: 10, margin: [0, 3, 0, 3] as number[] },
            { text: `Jue Ming (Total Loss): ${unlucky.totalLoss || '-'}`, fontSize: 10, margin: [0, 3, 0, 3] as number[] }
          ]
        }
      ],
      margin: [0, 0, 0, 15] as number[]
    });
  }

  // ─── PROFILING ───
  const profiling = analysis.profiling || {};
  const structuresNatal = profiling.structures_natal || {};
  const natalPct = profiling.natal_percentages || {};
  const annualPct = profiling.annual_percentages || {};

  if (Object.keys(structuresNatal).length > 0 || Object.keys(natalPct).length > 0) {
    content.push(...sectionTitle('BaZi Profiling System', '五型格 & 十神格', true));
  }

  if (Object.keys(structuresNatal).length > 0) {
    content.push({ text: '5 Structures (Natal)', fontSize: 11, bold: true, color: C.textDark, margin: [0, 0, 0, 6] as number[] });
    const structRows = Object.entries(structuresNatal).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: [string, any]) => [
      { text: k, fontSize: 10, margin: [10, 4, 5, 4] as number[] },
      { text: `${v}%`, fontSize: 10, bold: true, color: C.gold, alignment: 'right', margin: [5, 4, 10, 4] as number[] }
    ]);
    content.push({ table: { widths: ['*', 60], body: structRows }, layout: cardLayout, margin: [0, 0, 0, 15] as number[] });
  }

  const sortedGods = Object.entries(natalPct).sort((a: any, b: any) => b[1] - a[1]);
  if (sortedGods.length > 0) {
    content.push({ text: 'Ten Gods Profiling', fontSize: 11, bold: true, color: C.textDark, margin: [0, 10, 0, 6] as number[] });
    const godHeader = ['Ten God', 'Natal %', 'Annual %'].map(t => ({ text: t, fontSize: 9, bold: true, color: C.white, fillColor: C.crimson, alignment: 'center', margin: [0, 5, 0, 5] as number[] }));
    const godBody = sortedGods.map(([god, pct]: [string, any]) => {
      const annP = (annualPct as any)[god] || 0;
      return [
        { text: god, fontSize: 10, margin: [8, 4, 4, 4] as number[] },
        { text: `${pct}%`, fontSize: 10, bold: true, color: C.gold, alignment: 'center' },
        { text: `${annP}%`, fontSize: 10, bold: true, color: C.crimson, alignment: 'center' }
      ];
    });
    content.push({ table: { headerRows: 1, widths: ['*', 70, 70], body: [godHeader, ...godBody] }, layout: cleanLayout });
  }

  // ─── FIVE ELEMENTS ───
  const fiveFactors = analysis.five_factors || {};
  const elKeys = ['WOOD', 'FIRE', 'EARTH', 'METAL', 'WATER'];
  const elLabels: Record<string, string> = { WOOD: '木 Wood', FIRE: '火 Fire', EARTH: '土 Earth', METAL: '金 Metal', WATER: '水 Water' };
  const elColors: Record<string, string> = { WOOD: '#2D6A4F', FIRE: '#C0392B', EARTH: '#8B6914', METAL: '#7D7D7D', WATER: '#2471A3' };
  const elTotal = elKeys.reduce((sum, k) => sum + (fiveFactors[k] || 0), 0) || 1;

  content.push(...sectionTitle('Five Elements Balance', '五行平衡'));
  const elRows = elKeys.map(k => {
    const val = fiveFactors[k] || 0;
    const pct = Math.round((val / elTotal) * 100);
    return [
      { text: elLabels[k], fontSize: 10, color: elColors[k], bold: true, margin: [10, 4, 5, 4] as number[] },
      { text: val.toString(), fontSize: 10, alignment: 'center' },
      { text: `${pct}%`, fontSize: 10, bold: true, alignment: 'right', color: C.textDark, margin: [5, 4, 10, 4] as number[] }
    ];
  });
  content.push({ table: { widths: ['*', 50, 60], body: elRows }, layout: cardLayout, margin: [0, 0, 0, 15] as number[] });

  // ─── ANNUAL LUCK MATRIX ───
  if (luckPillarsArr.some((lp: any) => lp.annual_pillars?.length > 0)) {
    content.push(...sectionTitle('Annual Luck Matrix', '六十甲子 — Ages 1 to 90', true));
    luckPillarsArr.forEach((lp: any) => {
      if (!lp.annual_pillars || lp.annual_pillars.length === 0) return;
      content.push({
        text: `Age ${lp.age} (${lp.year_start}–${lp.year_end}): ${lp.heavenly_stem?.character || ''}${lp.earthly_branch?.character || ''}`,
        bold: true, fontSize: 10, color: C.crimson, margin: [0, 10, 0, 4] as number[]
      });
      const apHeader = lp.annual_pillars.map((ap: any) => ({ text: `${ap.year}\nAge ${ap.age}`, fontSize: 7, alignment: 'center', bold: true, color: C.textLight }));
      const apStems = lp.annual_pillars.map((ap: any) => ({ text: `${ap.stem}${ap.branch}`, fontSize: 11, alignment: 'center', bold: true, color: C.textDark }));
      const apTenGods = lp.annual_pillars.map((ap: any) => ({ text: ap.ten_god ? ap.ten_god.chinese : '', fontSize: 8, alignment: 'center', color: C.gold }));
      content.push({
        table: { widths: Array(lp.annual_pillars.length).fill('*'), body: [apHeader, apStems, apTenGods] },
        layout: { hLineWidth: (i: number) => i === 0 ? 0 : 0.5, vLineWidth: () => 0, hLineColor: () => '#E8E5E0', paddingTop: () => 3, paddingBottom: () => 3 },
        margin: [0, 0, 0, 2] as number[]
      });
    });
  }

  // ─── MONTHLY INFLUENCE ───
  if (analysis.monthly_influence?.length > 0) {
    content.push(...sectionTitle('Monthly Influence', '流月運程', true));
    const miHeader = ['Month', 'Stem', 'Branch', 'Ten God', 'Hidden Stems'].map(t => ({ text: t, fontSize: 9, bold: true, color: C.white, fillColor: C.crimson, alignment: 'center', margin: [0, 5, 0, 5] as number[] }));
    const miBody = analysis.monthly_influence.map((m: any) => {
      const monthName = new Date(m.gregorian_year, m.gregorian_month - 1).toLocaleString('default', { month: 'short' }).toUpperCase();
      const hStems = (m.hidden_stems || []).map((h: any) => {
        const tg = h.ten_god ? h.ten_god.chinese : '';
        return `${h.character}${tg ? ' ' + tg : ''}`;
      }).join('\n');
      const stemTg = m.stem?.ten_god ? m.stem.ten_god.chinese : '';
      return [
        { text: `${monthName} ${m.gregorian_year}`, fontSize: 10, alignment: 'center' },
        { text: m.stem?.character || '', fontSize: 14, bold: true, alignment: 'center' },
        { text: m.branch?.character || '', fontSize: 14, bold: true, alignment: 'center' },
        { text: stemTg, fontSize: 10, alignment: 'center', color: C.gold },
        { text: hStems, fontSize: 9, alignment: 'center', color: C.textMed }
      ];
    });
    content.push({ table: { headerRows: 1, widths: ['auto', 'auto', 'auto', 'auto', '*'], body: [miHeader, ...miBody] }, layout: cleanLayout });
  }

  // ─── ANNUAL STARS ───
  if (analysis.annual_stars) {
    const ast = analysis.annual_stars;
    const renderStarsRich = (stars: any) => {
      const items: any[] = [];
      if (stars?.auspicious?.length) {
        stars.auspicious.forEach((s: string) => items.push({ text: `[+] ${s}`, fontSize: 9, color: C.green, margin: [0, 1, 0, 1] as number[] }));
      }
      if (stars?.inauspicious?.length) {
        stars.inauspicious.forEach((s: string) => items.push({ text: `[-] ${s}`, fontSize: 9, color: C.red, margin: [0, 1, 0, 1] as number[] }));
      }
      if (items.length === 0) items.push({ text: 'None', fontSize: 9, color: C.textDark });
      return { stack: items, alignment: 'center', margin: [4, 6, 4, 6] as number[] };
    };
    content.push(...sectionTitle(`${ast.year} Annual Stars`, `流年吉凶星 · ${ast.pillar}`, true));
    const starsHeader = ['Hour Branch', 'Day Branch', 'Month Branch', 'Year Branch'].map(t => ({ text: t, fontSize: 9, bold: true, color: C.white, fillColor: C.crimson, alignment: 'center', margin: [0, 5, 0, 5] as number[] }));
    const starsRow = [
      renderStarsRich(ast.hour_branch_stars),
      renderStarsRich(ast.day_branch_stars),
      renderStarsRich(ast.month_branch_stars),
      renderStarsRich(ast.year_branch_stars)
    ];
    content.push({ table: { headerRows: 1, widths: ['*', '*', '*', '*'], body: [starsHeader, starsRow] }, layout: cleanLayout });
  }

  // ─── QI MEN DUN JIA ───
  const qmdj = chartData.qmdj;
  if (qmdj?.palaces?.length > 0) {
    content.push(...sectionTitle('Qi Men Dun Jia', '奇門遁甲 · Destiny Palace', true));
    content.push({
      table: {
        widths: ['auto', '*', 'auto', '*', 'auto', '*'],
        body: [[
          { text: 'Solar Term:', fontSize: 9, color: C.textLight }, { text: qmdj.solar_term || '-', fontSize: 9, bold: true },
          { text: 'Ju:', fontSize: 9, color: C.textLight }, { text: qmdj.ju || '-', fontSize: 9, bold: true },
          { text: 'Kong Wang:', fontSize: 9, color: C.textLight }, { text: qmdj.kong_wang?.branches || '-', fontSize: 9, bold: true }
        ], [
          { text: 'Zhi Fu:', fontSize: 9, color: C.textLight }, { text: qmdj.duty_star || '-', fontSize: 9, bold: true },
          { text: 'Zhi Shi:', fontSize: 9, color: C.textLight }, { text: qmdj.duty_door || '-', fontSize: 9, bold: true },
          { text: 'Tian Ma:', fontSize: 9, color: C.textLight }, { text: qmdj.tian_ma?.branch || '-', fontSize: 9, bold: true }
        ]]
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
      margin: [0, 0, 0, 12] as number[]
    });

    const pMap: Record<number, any> = {};
    qmdj.palaces.forEach((p: any) => { pMap[p.id] = p; });
    const kw = qmdj.kong_wang?.palaces || [];
    const tm = qmdj.tian_ma?.palace || null;
    const mgStr = aux.ming_gong || '';
    const mgBranch = mgStr.length >= 2 ? mgStr[1] : '';
    const BP: Record<string, number> = { '子': 1, '丑': 8, '寅': 8, '卯': 3, '辰': 4, '巳': 4, '午': 9, '未': 2, '申': 2, '酉': 7, '戌': 6, '亥': 6 };
    const mgPalace = mgBranch ? BP[mgBranch] : null;
    const dirLabels: Record<number, string> = { 4: 'SE · 巽', 9: 'S · 離', 2: 'SW · 坤', 3: 'E · 震', 5: 'Center', 7: 'W · 兌', 8: 'NE · 艮', 1: 'N · 坎', 6: 'NW · 乾' };

    const fmtP = (p: any, id: number) => {
      if (!p) return { text: '-', alignment: 'center' };
      let badges: string[] = [];
      if (kw.includes(id)) badges.push('【空】');
      if (tm === id) badges.push('【馬】');
      if (mgPalace === id) badges.push('【命】');
      const badgeStr = badges.length ? badges.join(' ') + '\n' : '';
      const dir = dirLabels[id] || '';
      if (id === 5) return { stack: [
        { text: dir, fontSize: 8, color: C.textLight, alignment: 'center' },
        { text: `${badgeStr}${p.heaven_stem || ''} / ${p.earth_stem || ''}`, fontSize: 10, alignment: 'center', bold: true, margin: [0, 4, 0, 0] as number[] }
      ], margin: [4, 6, 4, 6] as number[] };
      return { stack: [
        { text: dir, fontSize: 8, color: C.textLight, alignment: 'center' },
        badges.length > 0 ? { text: badgeStr.trim(), fontSize: 8, color: C.crimson, bold: true, alignment: 'center', margin: [0, 2, 0, 0] as number[] } : null,
        { text: p.god || '', fontSize: 9, color: C.gold, alignment: 'center', margin: [0, 2, 0, 0] as number[] },
        { text: p.star || '', fontSize: 10, bold: true, alignment: 'center', margin: [0, 1, 0, 0] as number[] },
        { text: p.door || '', fontSize: 9, color: C.crimson, alignment: 'center', margin: [0, 1, 0, 0] as number[] },
        { text: `${p.heaven_stem || ''} / ${p.earth_stem || ''}`, fontSize: 9, color: C.textMed, alignment: 'center', margin: [0, 2, 0, 0] as number[] }
      ].filter(Boolean), margin: [4, 6, 4, 6] as number[] };
    };

    content.push({
      table: {
        widths: ['*', '*', '*'],
        heights: [80, 80, 80],
        body: [
          [fmtP(pMap[4], 4), fmtP(pMap[9], 9), fmtP(pMap[2], 2)],
          [fmtP(pMap[3], 3), fmtP(pMap[5], 5), fmtP(pMap[7], 7)],
          [fmtP(pMap[8], 8), fmtP(pMap[1], 1), fmtP(pMap[6], 6)]
        ]
      },
      layout: qmdjLayout
    });
  }

  // ─── FOOTER ───
  content.push(
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: C.medGrey }], margin: [0, 30, 0, 10] as number[] },
    { text: '© 2026 The Full Picture LLP. All rights reserved.', alignment: 'center', fontSize: 8, color: C.textLight },
    { text: 'thefullpicture.asia', alignment: 'center', fontSize: 8, color: C.gold, margin: [0, 3, 0, 0] as number[] }
  );

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'NotoSansSC', fontSize: 10, color: C.textDark },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'The Full Picture · BaZi Report', fontSize: 7, color: C.textLight, margin: [40, 0, 0, 0] as number[] },
        { text: `${currentPage} / ${pageCount}`, fontSize: 7, color: C.textLight, alignment: 'right', margin: [0, 0, 40, 0] as number[] }
      ],
      margin: [0, 10, 0, 0] as number[]
    }),
    content
  };
}
