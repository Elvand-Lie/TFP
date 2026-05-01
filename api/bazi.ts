import { BaziCalculator } from './bazi-calculator/bazi-calculator';
import { STEMS, BRANCHES, ANIMALS } from './bazi-calculator/constants';
import { Solar, LunarUtil } from 'lunar-javascript';
import * as qimen from 'qimen-dunjia';

// ─── STEM / BRANCH METADATA ────────────────────────────────
const STEM_META: Record<string, { spelling: string; name: string; element: string }> = {
  '甲': { spelling: 'jia',  name: 'Yang Wood',  element: 'Wood'  },
  '乙': { spelling: 'yi',   name: 'Yin Wood',   element: 'Wood'  },
  '丙': { spelling: 'bing', name: 'Yang Fire',  element: 'Fire'  },
  '丁': { spelling: 'ding', name: 'Yin Fire',   element: 'Fire'  },
  '戊': { spelling: 'wu',   name: 'Yang Earth', element: 'Earth' },
  '己': { spelling: 'ji',   name: 'Yin Earth',  element: 'Earth' },
  '庚': { spelling: 'geng', name: 'Yang Metal', element: 'Metal' },
  '辛': { spelling: 'xin',  name: 'Yin Metal',  element: 'Metal' },
  '壬': { spelling: 'ren',  name: 'Yang Water', element: 'Water' },
  '癸': { spelling: 'gui',  name: 'Yin Water',  element: 'Water' }
};

const BRANCH_META: Record<string, { spelling: string; animal: string; element: string }> = {
  '子': { spelling: 'zi',   animal: 'Rat',     element: 'Water' },
  '丑': { spelling: 'chou', animal: 'Ox',      element: 'Earth' },
  '寅': { spelling: 'yin',  animal: 'Tiger',   element: 'Wood'  },
  '卯': { spelling: 'mao',  animal: 'Rabbit',  element: 'Wood'  },
  '辰': { spelling: 'chen', animal: 'Dragon',  element: 'Earth' },
  '巳': { spelling: 'si',   animal: 'Snake',   element: 'Fire'  },
  '午': { spelling: 'wu',   animal: 'Horse',   element: 'Fire'  },
  '未': { spelling: 'wei',  animal: 'Goat',    element: 'Earth' },
  '申': { spelling: 'shen', animal: 'Monkey',  element: 'Metal' },
  '酉': { spelling: 'you',  animal: 'Rooster', element: 'Metal' },
  '戌': { spelling: 'xu',   animal: 'Dog',     element: 'Earth' },
  '亥': { spelling: 'hai',  animal: 'Pig',     element: 'Water' }
};

// ─── HIDDEN STEMS (for display in chart) ────────────────────
const HIDDEN_STEMS_MAP: Record<string, string[]> = {
  '子': ['癸'],
  '丑': ['己', '癸', '辛'],
  '寅': ['甲', '丙', '戊'],
  '卯': ['乙'],
  '辰': ['戊', '乙', '癸'],
  '巳': ['丙', '庚', '戊'],
  '午': ['丁', '己'],
  '未': ['己', '丁', '乙'],
  '申': ['庚', '壬', '戊'],
  '酉': ['辛'],
  '戌': ['戊', '辛', '丁'],
  '亥': ['壬', '甲']
};

// ─── LIFE CYCLE (12 STAGES) ────────────────────────────────
const LIFE_CYCLE_NAMES = [
  '长生', '沐浴', '冠带', '临官', '帝旺', '衰',
  '病',  '死',  '墓',  '绝',  '胎',  '养'
];
const LIFE_CYCLE_ENGLISH = [
  'Growth', 'Bath', 'Crown', 'Official', 'Prosperity', 'Decline',
  'Illness', 'Death', 'Tomb', 'End', 'Embryo', 'Nurture'
];

const YANG_LIFE_CYCLE_START: Record<string, number> = {
  '甲': 11, // 亥
  '丙': 2,  // 寅
  '戊': 2,  // 寅
  '庚': 5,  // 巳
  '壬': 8   // 申
};

function getLifeCycleStage(dayStemChar: string, branchChar: string): { chinese: string; english: string } | null {
  const stemIdx = STEMS.indexOf(dayStemChar);
  if (stemIdx < 0) return null;

  const branchIdx = BRANCHES.indexOf(branchChar);
  if (branchIdx < 0) return null;

  const isYang = stemIdx % 2 === 0;
  const yangStem = isYang ? dayStemChar : STEMS[stemIdx - 1];
  const startBranch = YANG_LIFE_CYCLE_START[yangStem];
  if (startBranch === undefined) return null;

  let stageIdx: number;
  if (isYang) {
    stageIdx = (branchIdx - startBranch + 12) % 12;
  } else {
    stageIdx = (startBranch - branchIdx + 12) % 12;
  }

  return { chinese: LIFE_CYCLE_NAMES[stageIdx], english: LIFE_CYCLE_ENGLISH[stageIdx] };
}

// ─── TEN GODS (十神) ─────────────────────────────────────────
const TEN_GODS = {
  COMPANION: { same: { name: 'Friend', short: 'F', chinese: '比' }, diff: { name: 'Rob Wealth', short: 'RW', chinese: '劫' } },
  OUTPUT: { same: { name: 'Eating God', short: 'EG', chinese: '食' }, diff: { name: 'Hurting Officer', short: 'HO', chinese: '傷' } },
  WEALTH: { same: { name: 'Indirect Wealth', short: 'IW', chinese: '才' }, diff: { name: 'Direct Wealth', short: 'DW', chinese: '財' } },
  CONTROL: { same: { name: 'Seven Killings', short: '7K', chinese: '殺' }, diff: { name: 'Direct Officer', short: 'DO', chinese: '官' } },
  RESOURCE: { same: { name: 'Indirect Resource', short: 'IR', chinese: '卩' }, diff: { name: 'Direct Resource', short: 'DR', chinese: '印' } }
};

const ELEMENT_CYCLE = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];

function getTenGod(dmChar: string, targetChar: string) {
  if (!dmChar || !targetChar) return null;
  const dmIdx = STEMS.indexOf(dmChar);
  
  let targetIdx = STEMS.indexOf(targetChar);
  if (targetIdx === -1) {
    targetIdx = BRANCHES.indexOf(targetChar);
    if (targetIdx === -1) return null;
    const branchHiddenStems = HIDDEN_STEMS_MAP[targetChar] || [];
    targetChar = branchHiddenStems[0];
    targetIdx = STEMS.indexOf(targetChar);
  }

  const isSamePolarity = (dmIdx % 2) === (targetIdx % 2);
  
  const dmElementIdx = ELEMENT_CYCLE.indexOf(STEM_META[dmChar].element);
  const targetElementIdx = ELEMENT_CYCLE.indexOf(STEM_META[targetChar].element);

  const diff = (targetElementIdx - dmElementIdx + 5) % 5;
  
  let relationship = '';
  switch (diff) {
    case 0: relationship = 'COMPANION'; break;
    case 1: relationship = 'OUTPUT'; break;
    case 2: relationship = 'WEALTH'; break;
    case 3: relationship = 'CONTROL'; break;
    case 4: relationship = 'RESOURCE'; break;
  }

  const god = TEN_GODS[relationship as keyof typeof TEN_GODS][isSamePolarity ? 'same' : 'diff'];
  return {
    english: god.name,
    short: god.short,
    chinese: god.chinese
  };
}

// ─── SHEN SHA (SYMBOLIC STARS) ──────────────────────────────
const SHEN_SHA_RULES = {
  TianYi: {
    '甲': ['丑','未'], '戊': ['丑','未'], '庚': ['丑','未'],
    '乙': ['子','申'], '己': ['子','申'],
    '丙': ['亥','酉'], '丁': ['亥','酉'],
    '壬': ['卯','巳'], '癸': ['卯','巳'],
    '辛': ['午','寅']
  },
  WenChang: {
    '甲': '巳', '乙': '午', '丙': '申', '戊': '申', '丁': '酉', '己': '酉',
    '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯'
  },
  YangRen: {
    '甲': '卯', '丙': '午', '戊': '午', '庚': '酉', '壬': '子'
  },
  LuShen: {
    '甲': '寅', '乙': '卯', '丙': '巳', '戊': '巳', '丁': '午', '己': '午',
    '庚': '申', '辛': '酉', '壬': '亥', '癸': '子'
  },
  YiMa: {
    '申': '寅', '子': '寅', '辰': '寅',
    '亥': '巳', '卯': '巳', '未': '巳',
    '寅': '申', '午': '申', '戌': '申',
    '巳': '亥', '酉': '亥', '丑': '亥'
  },
  TaoHua: {
    '申': '酉', '子': '酉', '辰': '酉',
    '亥': '子', '卯': '子', '未': '子',
    '寅': '卯', '午': '卯', '戌': '卯',
    '巳': '午', '酉': '午', '丑': '午'
  },
  HuaGai: {
    '申': '辰', '子': '辰', '辰': '辰',
    '亥': '未', '卯': '未', '未': '未',
    '寅': '戌', '午': '戌', '戌': '戌',
    '巳': '丑', '酉': '丑', '丑': '丑'
  },
  JiangXing: {
    '申': '子', '子': '子', '辰': '子',
    '亥': '卯', '卯': '卯', '未': '卯',
    '寅': '午', '午': '午', '戌': '午',
    '巳': '酉', '酉': '酉', '丑': '酉'
  },
  HongLuan: {
    '子':'卯', '丑':'寅', '寅':'丑', '卯':'子', '辰':'亥', '巳':'戌',
    '午':'酉', '未':'申', '申':'未', '酉':'午', '戌':'巳', '亥':'辰'
  },
  GuChen: {
    '寅':'巳', '卯':'巳', '辰':'巳',
    '巳':'申', '午':'申', '未':'申',
    '申':'亥', '酉':'亥', '戌':'亥',
    '亥':'寅', '子':'寅', '丑':'寅'
  },
  GuaSu: {
    '寅':'丑', '卯':'丑', '辰':'丑',
    '巳':'辰', '午':'辰', '未':'辰',
    '申':'未', '酉':'未', '戌':'未',
    '亥':'戌', '子':'戌', '丑':'戌'
  },
  // San-He frame based stars
  JieSha: {
    '申':'巳', '子':'巳', '辰':'巳',
    '亥':'申', '卯':'申', '未':'申',
    '寅':'亥', '午':'亥', '戌':'亥',
    '巳':'寅', '酉':'寅', '丑':'寅'
  },
  ZaiSha: {
    '申':'午', '子':'午', '辰':'午',
    '亥':'酉', '卯':'酉', '未':'酉',
    '寅':'子', '午':'子', '戌':'子',
    '巳':'卯', '酉':'卯', '丑':'卯'
  },
  WangShen: {
    '申':'亥', '子':'亥', '辰':'亥',
    '亥':'寅', '卯':'寅', '未':'寅',
    '寅':'巳', '午':'巳', '戌':'巳',
    '巳':'申', '酉':'申', '丑':'申'
  },
  // Tai Ji Gui Ren by Day Stem
  TaiJi: {
    '甲':['子','午'], '乙':['子','午'],
    '丙':['卯','酉'], '丁':['卯','酉'],
    '戊':['辰','戌','丑','未'], '己':['辰','戌','丑','未'],
    '庚':['寅','亥'], '辛':['寅','亥'],
    '壬':['巳','申'], '癸':['巳','申']
  },
  // Fu Xing Gui Ren by Year Stem
  FuXing: {
    '甲':'寅', '乙':'卯', '丙':'巳', '丁':'午', '戊':'巳',
    '己':'午', '庚':'申', '辛':'酉', '壬':'亥', '癸':'子'
  },
  // Xian Chi (Salty Pool) - same as Tao Hua but by Day Branch only
  XianChi: {
    '申':'酉', '子':'酉', '辰':'酉',
    '亥':'子', '卯':'子', '未':'子',
    '寅':'卯', '午':'卯', '戌':'卯',
    '巳':'午', '酉':'午', '丑':'午'
  }
};

function getTianXi(yearBranch: string) {
  const hl = SHEN_SHA_RULES.HongLuan[yearBranch as keyof typeof SHEN_SHA_RULES.HongLuan];
  if (!hl) return null;
  const idx = BRANCHES.indexOf(hl);
  return BRANCHES[(idx + 6) % 12];
}

// Auspicious stars list for classification
const AUSPICIOUS_STARS = new Set([
  'Tian Yi Gui Ren', 'Wen Chang', 'Lu Shen', 'Yi Ma', 'Tao Hua',
  'Hua Gai', 'Jiang Xing', 'Hong Luan', 'Tian Xi', 'Tai Ji Gui Ren',
  'Fu Xing Gui Ren'
]);

type ShenShaContext = 'natal' | 'annual';

interface ShenShaParams {
  dayMaster?: string;
  yearBranch?: string;
  dayBranch?: string;
  referenceBranch?: string;
  referenceStem?: string;
}

function getShenSha(targetBranch: string, context: ShenShaContext, params: ShenShaParams) {
  if (!targetBranch) return { all: [], auspicious: [], inauspicious: [] };
  const stars: string[] = [];
  
  if (context === 'natal') {
    const dm = params.dayMaster || '';
    const yb = params.yearBranch || '';
    const db = params.dayBranch || '';

    // Day-Master based stars
    if ((SHEN_SHA_RULES.TianYi[dm as keyof typeof SHEN_SHA_RULES.TianYi] || []).includes(targetBranch)) stars.push('Tian Yi Gui Ren');
    if (SHEN_SHA_RULES.WenChang[dm as keyof typeof SHEN_SHA_RULES.WenChang] === targetBranch) stars.push('Wen Chang');
    if (SHEN_SHA_RULES.YangRen[dm as keyof typeof SHEN_SHA_RULES.YangRen] === targetBranch) stars.push('Yang Ren');
    if (SHEN_SHA_RULES.LuShen[dm as keyof typeof SHEN_SHA_RULES.LuShen] === targetBranch) stars.push('Lu Shen');
    if ((SHEN_SHA_RULES.TaiJi[dm as keyof typeof SHEN_SHA_RULES.TaiJi] || []).includes(targetBranch)) stars.push('Tai Ji Gui Ren');
    
    // Year/Day Branch based stars (San He frame)
    if (SHEN_SHA_RULES.YiMa[yb as keyof typeof SHEN_SHA_RULES.YiMa] === targetBranch || SHEN_SHA_RULES.YiMa[db as keyof typeof SHEN_SHA_RULES.YiMa] === targetBranch) stars.push('Yi Ma');
    if (SHEN_SHA_RULES.TaoHua[yb as keyof typeof SHEN_SHA_RULES.TaoHua] === targetBranch || SHEN_SHA_RULES.TaoHua[db as keyof typeof SHEN_SHA_RULES.TaoHua] === targetBranch) stars.push('Tao Hua');
    if (SHEN_SHA_RULES.XianChi[db as keyof typeof SHEN_SHA_RULES.XianChi] === targetBranch) stars.push('Xian Chi');
    if (SHEN_SHA_RULES.HuaGai[yb as keyof typeof SHEN_SHA_RULES.HuaGai] === targetBranch || SHEN_SHA_RULES.HuaGai[db as keyof typeof SHEN_SHA_RULES.HuaGai] === targetBranch) stars.push('Hua Gai');
    if (SHEN_SHA_RULES.JiangXing[yb as keyof typeof SHEN_SHA_RULES.JiangXing] === targetBranch || SHEN_SHA_RULES.JiangXing[db as keyof typeof SHEN_SHA_RULES.JiangXing] === targetBranch) stars.push('Jiang Xing');
    
    // Year Branch based stars
    if (SHEN_SHA_RULES.HongLuan[yb as keyof typeof SHEN_SHA_RULES.HongLuan] === targetBranch) stars.push('Hong Luan');
    if (getTianXi(yb) === targetBranch) stars.push('Tian Xi');
    if (SHEN_SHA_RULES.GuChen[yb as keyof typeof SHEN_SHA_RULES.GuChen] === targetBranch) stars.push('Gu Chen');
    if (SHEN_SHA_RULES.GuaSu[yb as keyof typeof SHEN_SHA_RULES.GuaSu] === targetBranch) stars.push('Gua Su');
    
    // San He frame based sha stars (inauspicious)
    if (SHEN_SHA_RULES.JieSha[yb as keyof typeof SHEN_SHA_RULES.JieSha] === targetBranch) stars.push('Jie Sha');
    if (SHEN_SHA_RULES.ZaiSha[yb as keyof typeof SHEN_SHA_RULES.ZaiSha] === targetBranch) stars.push('Zai Sha');
    if (SHEN_SHA_RULES.WangShen[yb as keyof typeof SHEN_SHA_RULES.WangShen] === targetBranch) stars.push('Wang Shen');
    
    // Tai Sui relationships
    if (yb === targetBranch) stars.push('Tai Sui');
    const BRANCHES_ARR = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    if (BRANCHES_ARR[(BRANCHES_ARR.indexOf(yb) + 6) % 12] === targetBranch) stars.push('Sui Po');
    
  } else if (context === 'annual') {
    const refBranch = params.referenceBranch || '';
    const refStem = params.referenceStem || '';

    // Branch-relative stars driven by Annual Branch
    if (SHEN_SHA_RULES.YiMa[refBranch as keyof typeof SHEN_SHA_RULES.YiMa] === targetBranch) stars.push('Yi Ma');
    if (SHEN_SHA_RULES.TaoHua[refBranch as keyof typeof SHEN_SHA_RULES.TaoHua] === targetBranch) stars.push('Tao Hua');
    if (SHEN_SHA_RULES.HuaGai[refBranch as keyof typeof SHEN_SHA_RULES.HuaGai] === targetBranch) stars.push('Hua Gai');
    if (SHEN_SHA_RULES.JiangXing[refBranch as keyof typeof SHEN_SHA_RULES.JiangXing] === targetBranch) stars.push('Jiang Xing');
    
    if (SHEN_SHA_RULES.HongLuan[refBranch as keyof typeof SHEN_SHA_RULES.HongLuan] === targetBranch) stars.push('Hong Luan');
    if (getTianXi(refBranch) === targetBranch) stars.push('Tian Xi');
    if (SHEN_SHA_RULES.GuChen[refBranch as keyof typeof SHEN_SHA_RULES.GuChen] === targetBranch) stars.push('Gu Chen');
    if (SHEN_SHA_RULES.GuaSu[refBranch as keyof typeof SHEN_SHA_RULES.GuaSu] === targetBranch) stars.push('Gua Su');
    
    if (SHEN_SHA_RULES.JieSha[refBranch as keyof typeof SHEN_SHA_RULES.JieSha] === targetBranch) stars.push('Jie Sha');
    if (SHEN_SHA_RULES.ZaiSha[refBranch as keyof typeof SHEN_SHA_RULES.ZaiSha] === targetBranch) stars.push('Zai Sha');
    if (SHEN_SHA_RULES.WangShen[refBranch as keyof typeof SHEN_SHA_RULES.WangShen] === targetBranch) stars.push('Wang Shen');

    // Stem-relative stars driven by Annual Stem
    if (refStem && SHEN_SHA_RULES.FuXing[refStem as keyof typeof SHEN_SHA_RULES.FuXing] === targetBranch) stars.push('Fu Xing Gui Ren');

    // Tai Sui relationships against Annual Branch
    if (refBranch === targetBranch) stars.push('Tai Sui');
    const BRANCHES_ARR = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    if (BRANCHES_ARR[(BRANCHES_ARR.indexOf(refBranch) + 6) % 12] === targetBranch) stars.push('Sui Po');
  }
  
  const unique = [...new Set(stars)];
  return {
    all: unique,
    auspicious: unique.filter(s => AUSPICIOUS_STARS.has(s)),
    inauspicious: unique.filter(s => !AUSPICIOUS_STARS.has(s))
  };
}

function getLifeStarDetails(guaNumber: number) {
  const map: Record<number, {color: string, element: string, chinese: string}> = {
    1: { color: 'White', element: 'Water', chinese: '一白水' },
    2: { color: 'Black', element: 'Earth', chinese: '二黑土' },
    3: { color: 'Jade', element: 'Wood', chinese: '三碧木' },
    4: { color: 'Green', element: 'Wood', chinese: '四绿木' },
    5: { color: 'Yellow', element: 'Earth', chinese: '五黄土' },
    6: { color: 'White', element: 'Metal', chinese: '六白金' },
    7: { color: 'Red', element: 'Metal', chinese: '七赤金' },
    8: { color: 'White', element: 'Earth', chinese: '八白土' },
    9: { color: 'Purple', element: 'Fire', chinese: '九紫火' }
  };
  return map[guaNumber] || null;
}

// ─── TEN GODS SCORING (Per-Stem, JY-style) ─────────────────
// Each of the 10 Heavenly Stems gets scored based on WHERE it appears
// in the chart. Stems not present anywhere → 0%.
// Scoring uses: positional weights + month branch emphasis + DM bonus.

const GROWTH_PHASE_START: Record<string, number> = {
  '甲':11,'丙':2,'戊':2,'庚':5,'壬':8,
  '乙':6,'丁':9,'己':9,'辛':0,'癸':3
};
const GROWTH_PHASE_VALUES = [7,5,6,8,10,4,3,2,1,0,1,2];
const BRANCHES_LIST = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

function getGrowthPhase(stem: string, branch: string): number {
  const startIdx = GROWTH_PHASE_START[stem];
  const branchIdx = BRANCHES_LIST.indexOf(branch);
  if (startIdx === undefined || branchIdx === -1) return 0;
  const isYin = '乙丁己辛癸'.includes(stem);
  const offset = isYin
    ? (startIdx - branchIdx + 12) % 12
    : (branchIdx - startIdx + 12) % 12;
  return GROWTH_PHASE_VALUES[offset];
}

const MONTH_SEASON: Record<string, string> = {
  '寅': 'Wood', '卯': 'Wood', '辰': 'Wood', // Spring
  '巳': 'Fire', '午': 'Fire', '未': 'Fire', // Summer
  '申': 'Metal', '酉': 'Metal', '戌': 'Metal', // Autumn
  '亥': 'Water', '子': 'Water', '丑': 'Water' // Winter
};

const STEM_ELEMENTS: Record<string, string> = {
  '甲': 'Wood', '乙': 'Wood', '丙': 'Fire', '丁': 'Fire',
  '戊': 'Earth', '己': 'Earth', '庚': 'Metal', '辛': 'Metal',
  '壬': 'Water', '癸': 'Water'
};

function getElementState(monthElem: string, targetElem: string): string {
  if (monthElem === targetElem) return 'Prosperous';
  const produces: Record<string, string> = {'Wood':'Fire', 'Fire':'Earth', 'Earth':'Metal', 'Metal':'Water', 'Water':'Wood'};
  const controls: Record<string, string> = {'Wood':'Earth', 'Earth':'Water', 'Water':'Fire', 'Fire':'Metal', 'Metal':'Wood'};
  
  if (produces[monthElem] === targetElem) return 'Formidable';
  if (produces[targetElem] === monthElem) return 'Trapped';
  if (controls[targetElem] === monthElem) return 'Imprisoned';
  if (controls[monthElem] === targetElem) return 'Dead';
  
  return 'Prosperous';
}

const SEASON_MULTS: Record<string, number> = {
  'Prosperous': 1.0,
  'Formidable': 1.0,
  'Trapped': 1.0,
  'Imprisoned': 0.9,
  'Dead': 0.5
};

function calculateDynamicScores(chartStems: string[], chartBranches: string[], dayMaster: string, monthBranch: string, isAnnual: boolean = false) {
  const allStems = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const presentStems = new Set<string>();
  chartStems.forEach(s => presentStems.add(s));
  chartBranches.forEach(b => {
    const hidden = HIDDEN_STEMS_MAP[b] || [];
    hidden.forEach(h => presentStems.add(h));
  });

  // Base raw scores (Positional + Seasonal)
  const stemScores: Record<string, number> = {};
  const stemW = isAnnual ? [12, 11, 22, 12, 14] : [12, 11, 22, 12];
  const hidW = isAnnual ? [
    [8, 5, 3], [35, 20, 12], [10, 6, 4], [8, 5, 3], [12, 7, 4]
  ] : [
    [8, 5, 3], [35, 20, 12], [10, 6, 4], [8, 5, 3]
  ];
  const PHASE_BONUS = 0.8;
  const monthElem = MONTH_SEASON[monthBranch] || 'Wood';

  allStems.forEach(stem => {
    if (!presentStems.has(stem)) { stemScores[stem] = 0; return; }
    let score = 0;
    chartStems.forEach((s, i) => {
      if (s === stem) score += stemW[i] + PHASE_BONUS * getGrowthPhase(stem, chartBranches[i]);
    });
    chartBranches.forEach((br, i) => {
      const hidden = HIDDEN_STEMS_MAP[br] || [];
      const idx = hidden.indexOf(stem);
      if (idx >= 0 && idx < 3) score += hidW[i][idx] + PHASE_BONUS * getGrowthPhase(stem, br);
    });
    
    const targetElem = STEM_ELEMENTS[stem] || 'Wood';
    const state = getElementState(monthElem, targetElem);
    const multiplier = SEASON_MULTS[state] || 1.0;
    stemScores[stem] = score * multiplier;
  });

  // PASS 1: Combination Transformations
  const chartBranchesSet = new Set(chartBranches);
  const transformedBranches = new Set<string>();

  const addTransformedPoints = (element: string, points: number) => {
    const stemsOfElement = Object.keys(STEM_ELEMENTS).filter(s => STEM_ELEMENTS[s] === element);
    stemsOfElement.forEach(s => {
      stemScores[s] = (stemScores[s] || 0) + (points / stemsOfElement.length);
    });
  };

  const deductBranchPoints = (branchesToDeduct: string[], percentage: number) => {
    let pooledPoints = 0;
    branchesToDeduct.forEach(b => {
      const hidden = HIDDEN_STEMS_MAP[b] || [];
      hidden.forEach(h => {
        const deduction = (stemScores[h] || 0) * percentage;
        stemScores[h] -= deduction;
        pooledPoints += deduction;
      });
      transformedBranches.add(b);
    });
    return pooledPoints;
  };

  const THREE_HARMONY = {
    'Fire': { branches: ['寅', '午', '戌'], cardinal: '午' },
    'Wood': { branches: ['亥', '卯', '未'], cardinal: '卯' },
    'Water': { branches: ['申', '子', '辰'], cardinal: '子' },
    'Metal': { branches: ['巳', '酉', '丑'], cardinal: '酉' }
  };

  Object.values(THREE_HARMONY).forEach(frame => {
    const present = frame.branches.filter(b => chartBranchesSet.has(b));
    if (present.length === 3) {
      const pooled = deductBranchPoints(present, 0.8);
      addTransformedPoints(Object.keys(THREE_HARMONY).find(k => THREE_HARMONY[k as keyof typeof THREE_HARMONY] === frame)!, pooled);
    } else if (present.length === 2 && present.includes(frame.cardinal)) {
      const pooled = deductBranchPoints(present, 0.4);
      addTransformedPoints(Object.keys(THREE_HARMONY).find(k => THREE_HARMONY[k as keyof typeof THREE_HARMONY] === frame)!, pooled);
    }
  });

  const SIX_HARMONY = [
    { pair: ['子', '丑'], element: 'Earth' },
    { pair: ['寅', '亥'], element: 'Wood' },
    { pair: ['卯', '戌'], element: 'Fire' },
    { pair: ['辰', '酉'], element: 'Metal' },
    { pair: ['巳', '申'], element: 'Water' },
    { pair: ['午', '未'], element: 'Fire' }
  ];

  SIX_HARMONY.forEach(frame => {
    if (chartBranchesSet.has(frame.pair[0]) && chartBranchesSet.has(frame.pair[1])) {
      if (!transformedBranches.has(frame.pair[0]) && !transformedBranches.has(frame.pair[1])) {
        const pooled = deductBranchPoints(frame.pair, 0.2);
        addTransformedPoints(frame.element, pooled);
      }
    }
  });

  // Clashes
  const SIX_CLASHES = [
    ['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']
  ];
  
  const clashedElements = new Set<string>();
  
  SIX_CLASHES.forEach(clash => {
    if (chartBranchesSet.has(clash[0]) && chartBranchesSet.has(clash[1])) {
      if (!transformedBranches.has(clash[0]) && !transformedBranches.has(clash[1])) {
        const elem0 = STEM_ELEMENTS[(HIDDEN_STEMS_MAP[clash[0]] || [])[0]] || 'Wood';
        const elem1 = STEM_ELEMENTS[(HIDDEN_STEMS_MAP[clash[1]] || [])[0]] || 'Wood';
        
        const state0 = getElementState(monthElem, elem0);
        const state1 = getElementState(monthElem, elem1);
        const mult0 = SEASON_MULTS[state0] || 1.0;
        const mult1 = SEASON_MULTS[state1] || 1.0;
        
        let weakerElem = '';
        if (mult0 < mult1) weakerElem = elem0;
        else if (mult1 < mult0) weakerElem = elem1;
        else {
          const controls: Record<string, string> = {'Wood':'Earth', 'Earth':'Water', 'Water':'Fire', 'Fire':'Metal', 'Metal':'Wood'};
          if (controls[elem0] === elem1) weakerElem = elem1;
          else if (controls[elem1] === elem0) weakerElem = elem0;
          else weakerElem = elem0;
        }
        clashedElements.add(weakerElem);
      }
    }
  });

  // PASS 2: Structural Assessment
  const dmElement = STEM_ELEMENTS[dayMaster];
  const produces: Record<string, string> = {'Wood':'Fire', 'Fire':'Earth', 'Earth':'Metal', 'Metal':'Water', 'Water':'Wood'};
  const controls: Record<string, string> = {'Wood':'Earth', 'Earth':'Water', 'Water':'Fire', 'Fire':'Metal', 'Metal':'Wood'};
  
  const companionElem = dmElement;
  const resourceElem = Object.keys(produces).find(k => produces[k] === dmElement)!;
  const outputElem = produces[dmElement];
  const wealthElem = controls[dmElement];
  const controlElem = Object.keys(controls).find(k => controls[k] === dmElement)!;

  let supportiveScore = 0;
  let drainingScore = 0;
  let totalScore = 0;
  
  const elementScores: Record<string, number> = {'Wood':0, 'Fire':0, 'Earth':0, 'Metal':0, 'Water':0};
  
  allStems.forEach(stem => {
    const elem = STEM_ELEMENTS[stem];
    const score = Math.max(stemScores[stem] || 0, 0); // ensure no negative points
    elementScores[elem] += score;
    totalScore += score;
    
    if (elem === companionElem || elem === resourceElem) supportiveScore += score;
    else drainingScore += score;
  });
  
  const supportivePct = (supportiveScore / (totalScore || 1)) * 100;
  
  let structure = '';
  let maxDrainingElem = '';
  let maxDrainingScore = 0;
  [outputElem, wealthElem, controlElem].forEach(e => {
    if (elementScores[e] > maxDrainingScore) {
      maxDrainingScore = elementScores[e];
      maxDrainingElem = e;
    }
  });
  const maxDrainingPct = (maxDrainingScore / (totalScore || 1)) * 100;

  // PRIORITY 1: Cong Ge
  if (supportivePct < 15 && maxDrainingPct > 60) structure = 'CongGe';
  else if (supportivePct > 55) structure = 'Strong';
  else if (supportivePct < 45) structure = 'Weak';
  else structure = 'Balanced';
  
  // PASS 3: Useful God Weighting
  let primaryUsefulGod = '';
  let harmfulGod = '';
  
  if (structure === 'CongGe') {
    primaryUsefulGod = maxDrainingElem;
    // Cong Ge charts receive no Harmful God penalty; the DM has surrendered
  } else if (structure === 'Strong') {
    primaryUsefulGod = maxDrainingElem;
    
    let maxSuppElem = '';
    let maxSuppScore = -1;
    let secSuppElem = '';
    let secSuppScore = -1;
    [companionElem, resourceElem].forEach(e => {
      if (elementScores[e] > maxSuppScore) {
        secSuppScore = maxSuppScore;
        secSuppElem = maxSuppElem;
        maxSuppScore = elementScores[e];
        maxSuppElem = e;
      } else if (elementScores[e] > secSuppScore) {
        secSuppScore = elementScores[e];
        secSuppElem = e;
      }
    });
    harmfulGod = maxSuppElem;
    if (maxSuppScore > 0 && Math.abs(maxSuppScore - Math.max(secSuppScore, 0)) / totalScore < 0.05) {
      harmfulGod = `${maxSuppElem},${secSuppElem}`;
    }
  } else if (structure === 'Weak') {
    let maxSuppElem = '';
    let maxSuppScore = -1;
    [companionElem, resourceElem].forEach(e => {
      if (elementScores[e] > maxSuppScore) {
        maxSuppScore = elementScores[e];
        maxSuppElem = e;
      }
    });
    primaryUsefulGod = maxSuppElem;
    
    harmfulGod = maxDrainingElem;
    let sortedDraining = [outputElem, wealthElem, controlElem].sort((a,b) => elementScores[b] - elementScores[a]);
    if (elementScores[sortedDraining[0]] > 0 && Math.abs(elementScores[sortedDraining[0]] - elementScores[sortedDraining[1]]) / totalScore < 0.05) {
      harmfulGod = `${sortedDraining[0]},${sortedDraining[1]}`;
    }
  }

  const finalScores: Record<string, number> = {};
  
  allStems.forEach(stem => {
    let score = stemScores[stem] || 0;
    const elem = STEM_ELEMENTS[stem];
    
    if (primaryUsefulGod === elem && structure !== 'Balanced') score *= 1.5;
    if (harmfulGod.includes(elem) && structure !== 'Balanced') score *= 0.7;
    if (clashedElements.has(elem)) score *= 0.9; // Modifiers stack
    
    finalScores[stem] = score;
  });

  const tenGodsScores: Record<string, number> = {
    'Friend': 0, 'Rob Wealth': 0,
    'Eating God': 0, 'Hurting Officer': 0,
    'Direct Wealth': 0, 'Indirect Wealth': 0,
    'Direct Officer': 0, 'Seven Killings': 0,
    'Direct Resource': 0, 'Indirect Resource': 0
  };
  
  let finalMax = 0.01;
  let finalSum = 0;
  
  allStems.forEach(stem => {
    const god = getTenGod(dayMaster, stem);
    if (god) {
      const score = finalScores[stem];
      tenGodsScores[god.english] = Math.max(tenGodsScores[god.english], score);
    }
  });
  
  Object.values(tenGodsScores).forEach(v => {
    if (v > finalMax) finalMax = v;
    finalSum += v;
  });
  
  // PASS 4: Conditional Normalization
  const normalizedScores: Record<string, number> = {};
  
  if (structure === 'Balanced') {
    let currentSum = 0;
    let maxGod = '';
    let maxGodVal = -1;
    Object.keys(tenGodsScores).forEach(god => {
      let pct = Math.round((tenGodsScores[god] / (finalSum || 1)) * 100);
      normalizedScores[god] = pct;
      currentSum += pct;
      if (pct > maxGodVal) { maxGodVal = pct; maxGod = god; }
    });
    // Fix rounding remainder to ensure it equals 100%
    if (currentSum !== 100 && currentSum > 0 && maxGod) {
      normalizedScores[maxGod] += (100 - currentSum);
    }
  } else {
    Object.keys(tenGodsScores).forEach(god => {
      normalizedScores[god] = Math.round((tenGodsScores[god] / finalMax) * 100);
    });
  }
  
  const dmStrengthScore = Math.min((supportivePct / 10), 10).toFixed(1);

  return { normalizedScores, dmStrengthScore: parseFloat(dmStrengthScore), structure };
}

function calculateTenGodsScores(bazi: any) {
  const chartStems = [bazi.getYearGan(), bazi.getMonthGan(), bazi.getDayGan(), bazi.getTimeGan()];
  const chartBranches = [bazi.getYearZhi(), bazi.getMonthZhi(), bazi.getDayZhi(), bazi.getTimeZhi()];
  return calculateDynamicScores(chartStems, chartBranches, bazi.getDayGan(), bazi.getMonthZhi());
}

function calculateMainStructure(bazi: any) {
  const dm = bazi.getDayGan();
  const monthBranch = bazi.getMonthZhi();
  const hiddenStems = HIDDEN_STEMS_MAP[monthBranch] || [];
  
  const heavenlyStems = [bazi.getYearGan(), bazi.getMonthGan(), bazi.getTimeGan()];
  
  // Find if any hidden stem protrudes (appears in heavenly stems)
  let structureGod = null;
  for (const h of hiddenStems) {
    if (heavenlyStems.includes(h)) {
      structureGod = getTenGod(dm, h);
      break;
    }
  }
  
  if (!structureGod && hiddenStems.length > 0) {
    // Fallback to Main Qi
    structureGod = getTenGod(dm, hiddenStems[0]);
  }
  
  return structureGod ? { english: structureGod.english, chinese: structureGod.chinese } : { english: '', chinese: '' };
}

// ─── MAP PILLAR DATA ────────────────────────────────────────
function mapPillar(pillarData: any, dayStemChar: string, naYin: string, yearBranch: string, dayBranch: string) {
  if (!pillarData || !pillarData.chinese || pillarData.chinese.length !== 2) return null;
  const stemChar = pillarData.chinese[0];
  const branchChar = pillarData.chinese[1];

  const stemInfo = STEM_META[stemChar] || { spelling: '', name: '', element: '' };
  const branchInfo = BRANCH_META[branchChar] || { spelling: '', animal: '', element: '' };

  const hiddenRaw = HIDDEN_STEMS_MAP[branchChar] || [];
  const hidden_stems = hiddenRaw.map(h => ({
    character: h,
    spelling: STEM_META[h]?.spelling || '',
    element: STEM_META[h]?.element || '',
    ten_god: getTenGod(dayStemChar, h)
  }));

  const lifeCycle = getLifeCycleStage(dayStemChar, branchChar);

  return {
    heavenly_stem: {
      character: stemChar,
      spelling: stemInfo.spelling,
      name: stemInfo.name,
      ten_god: getTenGod(dayStemChar, stemChar)
    },
    earthly_branch: {
      character: branchChar,
      spelling: branchInfo.spelling,
      name: branchInfo.animal,
      element: branchInfo.element,
      ten_god: getTenGod(dayStemChar, branchChar),
      shen_sha: getShenSha(branchChar, 'natal', { dayMaster: dayStemChar, yearBranch: yearBranch, dayBranch: dayBranch }).all
    },
    hidden_stems,
    life_cycle: lifeCycle ? lifeCycle.english : null,
    life_cycle_chinese: lifeCycle ? lifeCycle.chinese : null,
    na_yin: naYin
  };
}

// ─── MAIN HANDLER ───────────────────────────────────────────
export default function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body) return res.status(400).json({ error: 'Invalid JSON' });

    const { year, month, day, hour, gender, target_year } = body;
    const genderStr = gender === 1 ? 'male' : 'female';
    const analysisYear = target_year || new Date().getFullYear();
    const genderInt = gender === 1 ? 1 : 0; // lunar-javascript mapping

    const calculator = new BaziCalculator(year, month, day, hour, genderStr);
    const pillars = calculator.calculatePillars();
    const analysis = calculator.calculateBasicAnalysis();

    // lunar-javascript calculations
    const solar = Solar.fromYmdHms(year, month, day, hour, 0, 0);
    const lunar = solar.getLunar();
    const bazi = lunar.getEightChar();
    const yun = bazi.getYun(genderInt);

    const mainStructure = calculateMainStructure(bazi);
    const dynamicScoresResult = calculateTenGodsScores(bazi);
    const tenGodsScores = dynamicScoresResult.normalizedScores;
    const dmStrengthScore = dynamicScoresResult.dmStrengthScore;
    const dmStrengthLabel = dynamicScoresResult.structure;

    const dayStemChar = bazi.getDayGan();
    const yearBranchChar = bazi.getYearZhi();
    const dayBranchChar = bazi.getDayZhi();

    // Calculate precise Luck Pillars (DaYun) and Annual Luck (LiuNian)
    const daYuns = yun.getDaYun();
    const luckPillars = [];
    
    // Process the Da Yuns
    for (let i = 1; i <= 8; i++) {
        if (i < daYuns.length) {
            const dy = daYuns[i];
            const ganZhi = dy.getGanZhi();
            const stemChar = ganZhi.charAt(0);
            const branchChar = ganZhi.charAt(1);
            
            // Advanced DaYun Properties
            const lc = getLifeCycleStage(dayStemChar, branchChar);
            const naYin = (LunarUtil as any).NAYIN[ganZhi] || '';
            const hiddenRaw = HIDDEN_STEMS_MAP[branchChar] || [];
            const hidden_stems = hiddenRaw.map(h => ({
              character: h,
              ten_god: getTenGod(dayStemChar, h)
            }));
            
            // Annual Pillars (Liu Nian) within this Da Yun
            const lnData = [];
            const liuNians = dy.getLiuNian();
            for (let j = 0; j < liuNians.length; j++) {
              const ln = liuNians[j];
              const lnGanZhi = ln.getGanZhi();
              lnData.push({
                age: ln.getAge(),
                year: ln.getYear(),
                stem: lnGanZhi.charAt(0),
                branch: lnGanZhi.charAt(1),
                ten_god: getTenGod(dayStemChar, lnGanZhi.charAt(0))
              });
            }

            luckPillars.push({
              heavenly_stem: {
                character: stemChar,
                spelling: STEM_META[stemChar]?.spelling || '',
                name: STEM_META[stemChar]?.name || '',
                ten_god: getTenGod(dayStemChar, stemChar)
              },
              earthly_branch: {
                character: branchChar,
                spelling: BRANCH_META[branchChar]?.spelling || '',
                name: BRANCH_META[branchChar]?.animal || '',
                element: BRANCH_META[branchChar]?.element || ''
              },
              year_start: dy.getStartYear(),
              year_end: dy.getEndYear(),
              age: dy.getStartAge(),
              life_cycle: lc,
              na_yin: naYin,
              hidden_stems: hidden_stems,
              annual_pillars: lnData
            });
        }
    }

    const legacyData: any = {
      four_pillars: {
        year_pillar: mapPillar(pillars.year, dayStemChar, bazi.getYearNaYin(), yearBranchChar, dayBranchChar),
        month_pillar: mapPillar(pillars.month, dayStemChar, bazi.getMonthNaYin(), yearBranchChar, dayBranchChar),
        day_pillar: mapPillar(pillars.day, dayStemChar, bazi.getDayNaYin(), yearBranchChar, dayBranchChar),
        hour_pillar: mapPillar(pillars.time, dayStemChar, bazi.getTimeNaYin(), yearBranchChar, dayBranchChar)
      },
      luck_pillars: {
        luck_pillars: luckPillars
      },
      analysis: {
        day_master: {
          character: analysis.dayMaster.stem,
          spelling: STEM_META[analysis.dayMaster.stem]?.spelling || '',
          name: STEM_META[analysis.dayMaster.stem]?.name || '',
          element: analysis.dayMaster.element,
          nature: analysis.dayMaster.nature
        },
        main_structure: `${mainStructure.chinese}格 ${mainStructure.english}`,
        dm_strength: dmStrengthScore,
        dm_strength_label: dmStrengthLabel,
        ten_gods_scores: tenGodsScores,
        auxiliary: {
          tai_yuan: bazi.getTaiYuan(),
          ming_gong: bazi.getMingGong(),
          kong_wang_day: bazi.getDayXunKong(),
          kong_wang_year: bazi.getYearXunKong()
        },
        life_gua: analysis.lifeGua,
        nobleman: analysis.nobleman,
        intelligence: analysis.intelligence,
        sky_horse: analysis.skyHorse,
        peach_blossom: analysis.peachBlossom,
        solitary: SHEN_SHA_RULES.GuChen[dayBranchChar as keyof typeof SHEN_SHA_RULES.GuChen] || '',
        five_factors: analysis.fiveFactors,
        eight_mansions: analysis.eightMansions
      }
    };

    // ─── JOEY YAP DESTINY METRICS (ANNUAL STARS, MONTHLY, PROFILING) ───
    
    // 1. Life Star
    const lifeStar = getLifeStarDetails(analysis.lifeGua);
    legacyData.analysis.life_star = lifeStar;

    // 2. Annual Pillar
    const dAnnual = new Date(analysisYear, 6, 1); // Mid year to be safe
    const solarAnnual = Solar.fromDate(dAnnual);
    const annualBazi = solarAnnual.getLunar().getEightChar();
    const annualPillar = annualBazi.getYear();
    const annualStem = annualPillar.charAt(0);
    const annualBranch = annualPillar.charAt(1);

    // 3. Annual Stars for Natal Branches
    const yearStemForStars = bazi.getYearGan();
    const annualYearStem = annualStem;
    legacyData.analysis.annual_stars = {
      year: analysisYear,
      pillar: annualPillar,
      hour_branch_stars: getShenSha(bazi.getTimeZhi(), 'annual', { referenceBranch: annualBranch, referenceStem: annualYearStem }),
      day_branch_stars: getShenSha(dayBranchChar, 'annual', { referenceBranch: annualBranch, referenceStem: annualYearStem }),
      month_branch_stars: getShenSha(bazi.getMonthZhi(), 'annual', { referenceBranch: annualBranch, referenceStem: annualYearStem }),
      year_branch_stars: getShenSha(yearBranchChar, 'annual', { referenceBranch: annualBranch, referenceStem: annualYearStem })
    };

    // 4. Monthly Influence Calendar (12 Months of Target Year starting from Feb)
    const monthlyInfluence = [];
    for (let m = 2; m <= 13; m++) {
      const yearToUse = m > 12 ? analysisYear + 1 : analysisYear;
      const monthToUse = m > 12 ? m - 12 : m;
      const d = new Date(yearToUse, monthToUse - 1, 15); // 15th guarantees we are well inside the solar month
      const s = Solar.fromDate(d);
      const mPillar = s.getLunar().getEightChar().getMonth();
      const mStem = mPillar.charAt(0);
      const mBranch = mPillar.charAt(1);
      
      const hiddenRaw = HIDDEN_STEMS_MAP[mBranch] || [];
      const hidden = hiddenRaw.map(h => ({
        character: h,
        element: STEM_META[h]?.element || '',
        ten_god: getTenGod(dayStemChar, h)
      }));

      monthlyInfluence.push({
        gregorian_month: monthToUse,
        gregorian_year: yearToUse,
        stem: {
          character: mStem,
          element: STEM_META[mStem]?.element || '',
          ten_god: getTenGod(dayStemChar, mStem)
        },
        branch: {
          character: mBranch,
          animal: BRANCH_META[mBranch]?.animal || ''
        },
        hidden_stems: hidden
      });
    }
    legacyData.analysis.monthly_influence = monthlyInfluence;

    // 5. Bazi Profiling System (Structures & 10 Profiles)
    // Annual scores: calculated via the new Dynamic Truth Engine
    const annualScoresResult = calculateDynamicScores(
      [bazi.getYearGan(), bazi.getMonthGan(), bazi.getDayGan(), bazi.getTimeGan(), annualStem],
      [bazi.getYearZhi(), bazi.getMonthZhi(), bazi.getDayZhi(), bazi.getTimeZhi(), annualBranch],
      dayStemChar,
      bazi.getMonthZhi(),
      true
    );


    // Structure scores
    const getStructureScores = (scoresMap: Record<string, number>) => ({
      Creators: (scoresMap['Eating God'] || 0) + (scoresMap['Hurting Officer'] || 0),
      Thinkers: (scoresMap['Direct Resource'] || 0) + (scoresMap['Indirect Resource'] || 0),
      Supporters: (scoresMap['Direct Officer'] || 0) + (scoresMap['Seven Killings'] || 0),
      Connectors: (scoresMap['Friend'] || 0) + (scoresMap['Rob Wealth'] || 0),
      Managers: (scoresMap['Direct Wealth'] || 0) + (scoresMap['Indirect Wealth'] || 0)
    });
    
    const maxNormalize = (scoresMap: Record<string, number>) => {
      const max = Math.max(...Object.values(scoresMap), 0.01);
      const pct: Record<string, number> = {};
      for (const k in scoresMap) pct[k] = Math.round((scoresMap[k] / max) * 100);
      return pct;
    };

    legacyData.analysis.profiling = {
      natal_percentages: tenGodsScores,  // Already max-normalized from calculateTenGodsScores
      annual_percentages: annualScoresResult.normalizedScores,
      structures_natal: maxNormalize(getStructureScores(tenGodsScores)),
      structures_annual: maxNormalize(getStructureScores(annualScoresResult.normalizedScores))
    };

    // ─── QMDJ ENGINE (qimen-dunjia) ───
    try {
      const qimenString = `${year}${String(month).padStart(2,'0')}${String(day).padStart(2,'0')}${String(hour).padStart(2,'0')}`;
      const qmdjRaw = (qimen as any).generateChartByDatetime ? (qimen as any).generateChartByDatetime(qimenString) : null;
      if (qmdjRaw) {
        const qmdjChart = (qimen as any).chartToObject(qmdjRaw);
        
        // Map qimen-dunjia palaces to Luo Shu indices (0: Xun, 1: Li, 2: Kun, 3: Zhen, 4: Center, 5: Dui, 6: Gen, 7: Kan, 8: Qian)
        // Luo Shu IDs: 4, 9, 2, 3, 5, 7, 8, 1, 6
        const luoShuIds = [4, 9, 2, 3, 5, 7, 8, 1, 6];
        const palaces = [];
        for (let i = 0; i < 9; i++) {
          palaces.push({
            id: luoShuIds[i],
            star: qmdjChart["九星"][i] || '',
            door: qmdjChart["天門"][i] || qmdjChart["地門"][i] || '',
            god: qmdjChart["八神"][i] || '',
            earth_stem: qmdjChart["地盤"][i] || '',
            heaven_stem: qmdjChart["天盤"][i] || ''
          });
        }
        
        legacyData.qmdj = {
          solar_term: qmdjChart["節氣"] || lunar.getJieQi(),
          ju: `${qmdjChart["陰陽"]}${qmdjChart["局數"]}局`, 
          duty_star: qmdjChart["值符"] || '',
          duty_door: qmdjChart["值使"] || '',
          palaces: palaces
        };
      }
    } catch (err) {
      console.error('QMDJ Calculation Error:', err);
    }

    res.status(200).json(legacyData);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server Error' });
  }
}
