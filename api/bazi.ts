import { BaziCalculator } from './bazi-calculator/bazi-calculator';
import { STEMS, BRANCHES, ANIMALS } from './bazi-calculator/constants';
import { LunarUtil } from 'lunar-javascript';
import { createCalendarContext } from '../lib/calendar';

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
  '丑': ['癸', '己', '辛'],
  '寅': ['戊', '甲', '丙'],
  '卯': ['乙'],
  '辰': ['乙', '戊', '癸'],
  '巳': ['戊', '丙', '庚'],
  '午': ['丁', '己'],
  '未': ['丁', '己', '乙'],
  '申': ['戊', '庚', '壬'],
  '酉': ['辛'],
  '戌': ['辛', '戊', '丁'],
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
  'Fu Xing Gui Ren',
  // Twelve Annual Spirits - auspicious
  'Tai Yang', 'Tai Yin', 'Long De', 'Fu De',
  // Xue Tang
  'Xue Tang'
]);

// ─── TWELVE ANNUAL SPIRITS (岁前十二神煞) ───────────────────
// Rotation from Tai Sui (annual branch). Offset 0 = Tai Sui position.
const TWELVE_SPIRITS: { name: string; chinese: string }[] = [
  { name: 'Tai Sui',  chinese: '太歲' },   // 0
  { name: 'Tai Yang', chinese: '太陽' },   // 1
  { name: 'Sang Men', chinese: '喪門' },   // 2
  { name: 'Tai Yin',  chinese: '太陰' },   // 3
  { name: 'Guan Fu',  chinese: '官符' },   // 4 (五鬼)
  { name: 'Si Fu',    chinese: '死符' },   // 5 (小耗)
  { name: 'Sui Po',   chinese: '歲破' },   // 6 (大耗)
  { name: 'Long De',  chinese: '龍德' },   // 7
  { name: 'Bai Hu',   chinese: '白虎' },   // 8
  { name: 'Fu De',    chinese: '福德' },   // 9 (天德)
  { name: 'Diao Ke',  chinese: '弔客' },   // 10 (天狗)
  { name: 'Bing Fu',  chinese: '病符' }    // 11
];

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
    const BRANCHES_ARR = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

    // ── Twelve Annual Spirits (岁前十二神煞) ──
    // Calculate offset from Tai Sui (annual branch) to natal branch
    const refIdx = BRANCHES_ARR.indexOf(refBranch);
    const targetIdx = BRANCHES_ARR.indexOf(targetBranch);
    if (refIdx >= 0 && targetIdx >= 0) {
      const offset = (targetIdx - refIdx + 12) % 12;
      const spirit = TWELVE_SPIRITS[offset];
      if (spirit) stars.push(spirit.name);
    }

    // ── Branch-relative stars driven by Annual Branch ──
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

    // ── Stem-relative stars driven by Annual Stem ──
    if (refStem && SHEN_SHA_RULES.FuXing[refStem as keyof typeof SHEN_SHA_RULES.FuXing] === targetBranch) stars.push('Fu Xing Gui Ren');
    if (refStem && (SHEN_SHA_RULES.TianYi[refStem as keyof typeof SHEN_SHA_RULES.TianYi] || []).includes(targetBranch)) stars.push('Tian Yi Gui Ren');
    if (refStem && SHEN_SHA_RULES.WenChang[refStem as keyof typeof SHEN_SHA_RULES.WenChang] === targetBranch) stars.push('Wen Chang');
    if (refStem && (SHEN_SHA_RULES.TaiJi[refStem as keyof typeof SHEN_SHA_RULES.TaiJi] || []).includes(targetBranch)) stars.push('Tai Ji Gui Ren');
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
    // Follow the dominant flow: all draining elements are useful
    primaryUsefulGod = [outputElem, wealthElem, controlElem].join(',');
    harmfulGod = '';
  } else if (structure === 'Strong') {
    // Strong DM needs to be drained: output, wealth, control are ALL useful
    primaryUsefulGod = [outputElem, wealthElem, controlElem].join(',');
    // Companion and resource make it worse
    harmfulGod = [companionElem, resourceElem].join(',');
  } else if (structure === 'Weak') {
    // Weak DM needs support: companion and resource are BOTH useful
    primaryUsefulGod = [companionElem, resourceElem].join(',');
    // Output, wealth, control drain it further
    harmfulGod = [outputElem, wealthElem, controlElem].join(',');
  } else {
    // Balanced: slightly favor what keeps equilibrium; treat like mild weak
    primaryUsefulGod = [companionElem, resourceElem].join(',');
    harmfulGod = [outputElem, wealthElem, controlElem].join(',');
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

  return { normalizedScores, dmStrengthScore: parseFloat(dmStrengthScore), structure, primaryUsefulGod, harmfulGod };
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

// ─── ENHANCED DAY MASTER STRENGTH (with Roots, Combinations, Clashes) ───
// Classical BaZi factors: 得令(Season) > 得根(Roots) > 得势(Support) > 合冲(Combos/Clashes)

const BRANCH_ELEMENT_MAP: Record<string, string> = {
  '子':'Water','丑':'Earth','寅':'Wood','卯':'Wood','辰':'Earth',
  '巳':'Fire','午':'Fire','未':'Earth','申':'Metal','酉':'Metal',
  '戌':'Earth','亥':'Water'
};

// Hidden stem qi strength (main qi = 1.0, middle = 0.5, residual = 0.3)
const HIDDEN_STEM_QI: Record<string, [string, number][]> = {
  '子': [['癸',1.0]],
  '丑': [['己',0.6],['癸',0.3],['辛',0.1]],
  '寅': [['甲',0.6],['丙',0.3],['戊',0.1]],
  '卯': [['乙',1.0]],
  '辰': [['戊',0.6],['乙',0.3],['癸',0.1]],
  '巳': [['丙',0.6],['庚',0.3],['戊',0.1]],
  '午': [['丁',0.7],['己',0.3]],
  '未': [['己',0.6],['丁',0.3],['乙',0.1]],
  '申': [['庚',0.6],['壬',0.3],['戊',0.1]],
  '酉': [['辛',1.0]],
  '戌': [['戊',0.6],['辛',0.3],['丁',0.1]],
  '亥': [['壬',0.7],['甲',0.3]]
};

// Three Harmony combinations (三合局)
const SAN_HE: [string, string, string, string][] = [
  ['申','子','辰','Water'],
  ['亥','卯','未','Wood'],
  ['寅','午','戌','Fire'],
  ['巳','酉','丑','Metal']
];

// Seasonal combinations (三会局): strongest type
const SAN_HUI: [string, string, string, string][] = [
  ['寅','卯','辰','Wood'],
  ['巳','午','未','Fire'],
  ['申','酉','戌','Metal'],
  ['亥','子','丑','Water']
];

// Six Harmony combinations (六合)
const LIU_HE: [string, string, string][] = [
  ['子','丑','Earth'],
  ['寅','亥','Wood'],
  ['卯','戌','Fire'],
  ['辰','酉','Metal'],
  ['巳','申','Water'],
  ['午','未','Fire']
];

// Six Clashes (六冲)
const LIU_CHONG: [string, string][] = [
  ['子','午'],['丑','未'],['寅','申'],
  ['卯','酉'],['辰','戌'],['巳','亥']
];

const ELEMENT_PRODUCES_MAP: Record<string, string> = {
  Wood: 'Fire',
  Fire: 'Earth',
  Earth: 'Metal',
  Metal: 'Water',
  Water: 'Wood'
};

const ELEMENT_CONTROLS_MAP: Record<string, string> = {
  Wood: 'Earth',
  Earth: 'Water',
  Water: 'Fire',
  Fire: 'Metal',
  Metal: 'Wood'
};

const YIN_STEMS = new Set(['乙', '丁', '己', '辛', '癸']);
const PILLAR_POSITIONS = ['year', 'month', 'day', 'hour'];

function roundTo1(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getControllingElement(element: string) {
  return Object.keys(ELEMENT_CONTROLS_MAP).find(k => ELEMENT_CONTROLS_MAP[k] === element) || '';
}

function getProducingElement(element: string) {
  return Object.keys(ELEMENT_PRODUCES_MAP).find(k => ELEMENT_PRODUCES_MAP[k] === element) || '';
}

function getElementRelationship(dmElement: string, targetElement: string) {
  if (targetElement === dmElement) return 'companion';
  if (ELEMENT_PRODUCES_MAP[targetElement] === dmElement) return 'resource';
  if (ELEMENT_PRODUCES_MAP[dmElement] === targetElement) return 'output';
  if (ELEMENT_CONTROLS_MAP[dmElement] === targetElement) return 'wealth';
  if (ELEMENT_CONTROLS_MAP[targetElement] === dmElement) return 'power';
  return 'neutral';
}

function getMainQiElement(branch: string) {
  const hidden = HIDDEN_STEM_QI[branch] || [];
  const mainStem = hidden[0]?.[0];
  return mainStem ? STEM_ELEMENTS[mainStem] : BRANCH_ELEMENT_MAP[branch];
}

function branchContainsElement(branch: string, element: string) {
  return (HIDDEN_STEM_QI[branch] || []).some(([stem]) => STEM_ELEMENTS[stem] === element);
}

function getClashedBranchPositions(allBranches: string[]) {
  const clashedPositions = new Set<number>();
  for (const [a, b] of LIU_CHONG) {
    const posA: number[] = [];
    const posB: number[] = [];
    allBranches.forEach((branch, idx) => {
      if (branch === a && !clashedPositions.has(idx)) posA.push(idx);
      if (branch === b && !clashedPositions.has(idx)) posB.push(idx);
    });

    for (const pa of posA) {
      let bestB = -1;
      let bestDist = 99;
      for (const pb of posB) {
        if (clashedPositions.has(pb)) continue;
        const dist = Math.abs(pa - pb);
        if (dist < bestDist) {
          bestDist = dist;
          bestB = pb;
        }
      }
      if (bestB >= 0) {
        clashedPositions.add(pa);
        clashedPositions.add(bestB);
      }
    }
  }
  return clashedPositions;
}

function calculateEnhancedStrength(bazi: any) {
  const dmChar = bazi.getDayGan();
  const dmElement = STEM_ELEMENTS[dmChar];

  const companionElem = dmElement;
  const resourceElem = getProducingElement(dmElement);
  const outputElem = ELEMENT_PRODUCES_MAP[dmElement];
  const wealthElem = ELEMENT_CONTROLS_MAP[dmElement];
  const controlElem = getControllingElement(dmElement);
  const opposingElements = [outputElem, wealthElem, controlElem].filter(Boolean);

  const isSupportiveElement = (element: string) => element === companionElem || element === resourceElem;

  const yearStem = bazi.getYearGan();
  const monthStem = bazi.getMonthGan();
  const dayStem = bazi.getDayGan();
  const hourStem = bazi.getTimeGan();
  const stems = [yearStem, monthStem, dayStem, hourStem];

  const yearBranch = bazi.getYearZhi();
  const monthBranch = bazi.getMonthZhi();
  const dayBranch = bazi.getDayZhi();
  const hourBranch = bazi.getTimeZhi();
  const allBranches = [yearBranch, monthBranch, dayBranch, hourBranch];
  const clashedPositions = getClashedBranchPositions(allBranches);

  // Part A: Louis-style 得令 / 得地 / 得势 strength calibration.
  const monthMainElement = getMainQiElement(monthBranch);
  const monthRelation = getElementRelationship(dmElement, monthMainElement);
  const monthClashed = clashedPositions.has(1);

  let seasonScore = 0;
  if (monthRelation === 'companion') seasonScore = 4.5;
  else if (monthRelation === 'resource') seasonScore = 4.0;
  else if (monthRelation === 'output') seasonScore = 1.35;
  else if (monthRelation === 'wealth') seasonScore = 1.05;
  else if (monthRelation === 'power') seasonScore = 0.75;

  const monthHiddenSupport = (HIDDEN_STEM_QI[monthBranch] || [])
    .filter(([stem]) => isSupportiveElement(STEM_ELEMENTS[stem]))
    .reduce((sum, [, qi]) => sum + qi, 0);
  seasonScore = clamp(seasonScore + monthHiddenSupport * 0.35, 0, 4.5);
  if (monthClashed && isSupportiveElement(monthMainElement)) seasonScore *= 0.75;

  const rootDetails: any[] = [];
  const rootWeights = [0.7, 0, 1.4, 0.9]; // 得地 focuses on year/day/hour roots; month is already 得令.
  let rootScore = 0;
  allBranches.forEach((branch, idx) => {
    const rootStem = (HIDDEN_STEM_QI[branch] || []).find(([stem]) => STEM_ELEMENTS[stem] === dmElement);
    if (!rootStem || rootWeights[idx] === 0) return;

    const [stem, qi] = rootStem;
    const raw = rootWeights[idx] * qi;
    const clashed = clashedPositions.has(idx);
    const effective = raw * (clashed ? 0.2 : 1);
    rootScore += effective;
    rootDetails.push({
      pillar: PILLAR_POSITIONS[idx],
      branch,
      stem,
      qi,
      clashed,
      raw: roundTo1(raw),
      effective: roundTo1(effective)
    });
  });
  rootScore = clamp(rootScore, 0, 3.0);
  const solidRootCount = rootDetails.filter(root => !root.clashed && root.effective >= 0.25).length;

  let allianceSupport = 0;
  let allianceOpposition = 0;
  const stemWeights = [0.65, 1.05, 0, 0.8];
  stems.forEach((stem, idx) => {
    if (idx === 2) return;
    const element = STEM_ELEMENTS[stem];
    if (!element) return;
    const seated = branchContainsElement(allBranches[idx], element);
    const multiplier = clashedPositions.has(idx) ? 0.55 : (seated ? 1 : 0.85);
    const effectiveWeight = stemWeights[idx] * multiplier;
    if (isSupportiveElement(element)) allianceSupport += effectiveWeight;
    else allianceOpposition += effectiveWeight;
  });

  allBranches.forEach((branch, idx) => {
    const clashFactor = clashedPositions.has(idx) ? 0.5 : 1;
    (HIDDEN_STEM_QI[branch] || []).forEach(([stem, qi]) => {
      const element = STEM_ELEMENTS[stem];
      if (element === resourceElem) allianceSupport += 0.22 * qi * clashFactor;
      if (opposingElements.includes(element)) allianceOpposition += 0.16 * qi * clashFactor;
    });
  });
  const allianceScore = clamp(allianceSupport, 0, 2.5);

  const baseScore = roundTo1(clamp(seasonScore + rootScore + allianceScore, 0, 10));

  // Force mix is used for 从格 candidate screening, not as a standalone score.
  const forceScores: Record<string, number> = { Wood: 0, Fire: 0, Earth: 0, Metal: 0, Water: 0 };
  const addForce = (element: string, amount: number) => {
    if (forceScores[element] !== undefined) forceScores[element] += amount;
  };

  const forceStemWeights = [0.7, 1.0, 0, 0.7];
  stems.forEach((stem, idx) => {
    if (idx === 2) return;
    const element = STEM_ELEMENTS[stem];
    const factor = clashedPositions.has(idx) ? 0.6 : 1;
    addForce(element, forceStemWeights[idx] * factor);
  });

  const branchForceWeights = [0.8, 2.0, 1.2, 0.8];
  allBranches.forEach((branch, idx) => {
    const factor = clashedPositions.has(idx) ? 0.75 : 1;
    (HIDDEN_STEM_QI[branch] || []).forEach(([stem, qi]) => {
      addForce(STEM_ELEMENTS[stem], branchForceWeights[idx] * qi * factor);
    });
  });

  const totalForce = Object.values(forceScores).reduce((sum, value) => sum + value, 0) || 1;
  const supportiveForce = forceScores[companionElem] + forceScores[resourceElem];
  const opposingForce = opposingElements.reduce((sum, element) => sum + forceScores[element], 0);
  const supportivePct = (supportiveForce / totalForce) * 100;
  const opposingPct = (opposingForce / totalForce) * 100;

  const supportiveVisibleStems = stems
    .map((stem, idx) => ({ stem, idx, element: STEM_ELEMENTS[stem] }))
    .filter(item => item.idx !== 2 && isSupportiveElement(item.element));

  const supportCompromised = supportiveVisibleStems.length === 0 || supportiveVisibleStems.every(item => {
    const seated = branchContainsElement(allBranches[item.idx], item.element);
    return clashedPositions.has(item.idx) || !seated;
  });

  const hasResourceBranch = allBranches.some(branch => branchContainsElement(branch, resourceElem));
  const hasCompanionBranch = allBranches.some(branch => branchContainsElement(branch, companionElem));
  const noEffectiveRoot = rootScore < 0.35 && solidRootCount === 0;
  const lossOfSeason = !isSupportiveElement(monthMainElement);
  const gainedSeason = isSupportiveElement(monthMainElement);
  const yinDayMaster = YIN_STEMS.has(dmChar);
  const dominantOpposing = opposingPct >= (yinDayMaster ? 58 : 68);

  const specialStructure: any = {
    flagged: false,
    type: null,
    chinese: null,
    english: null,
    confidence: null,
    confidence_level: null,
    label: null,
    message: null,
    reasons: []
  };

  const congWeakCandidate = lossOfSeason && noEffectiveRoot && dominantOpposing && (supportCompromised || yinDayMaster);
  const cleanWeakFollow = congWeakCandidate && opposingPct >= 74 && !hasResourceBranch && !hasCompanionBranch;

  const congStrongCandidate =
    gainedSeason &&
    rootScore >= 1.4 &&
    solidRootCount >= 1 &&
    supportivePct >= 78 &&
    opposingPct <= 16 &&
    allianceOpposition <= 0.35;
  const cleanStrongFollow = congStrongCandidate && supportivePct >= 86 && opposingPct <= 8;

  if (congWeakCandidate) {
    specialStructure.flagged = true;
    specialStructure.type = 'cong_weak';
    specialStructure.chinese = '从弱格';
    specialStructure.english = 'Follow-the-Weak Structure';
    specialStructure.confidence = cleanWeakFollow ? '真从' : '假从';
    specialStructure.confidence_level = cleanWeakFollow ? 'higher_confidence' : 'master_review_required';
    specialStructure.label = `Possible ${specialStructure.chinese} / ${specialStructure.english}`;
    specialStructure.message = 'This chart may follow a special structure in which the usual strength rules are reversed. Treat this result as a candidate flag that requires specialist review.';
    specialStructure.reasons = [
      '失令: the Month Branch does not support the Day Master.',
      'No solid same-element root is available; any root present is clashed or too weak to rely on.',
      'Resource or Companion support is absent, floating, or compromised, so it does not block the follow-structure candidate.',
      `Opposing forces dominate the chart mix (${Math.round(opposingPct)}%).`,
      yinDayMaster ? 'Yin Day Master: follow-structure screening uses the lenient rule set.' : 'Yang Day Master: stricter follow-structure screening applied.'
    ];
  } else if (congStrongCandidate) {
    specialStructure.flagged = true;
    specialStructure.type = 'cong_strong';
    specialStructure.chinese = '从旺格';
    specialStructure.english = 'Follow-the-Strong Structure';
    specialStructure.confidence = cleanStrongFollow ? '真从' : '假从';
    specialStructure.confidence_level = cleanStrongFollow ? 'higher_confidence' : 'master_review_required';
    specialStructure.label = `Possible ${specialStructure.chinese} / ${specialStructure.english}`;
    specialStructure.message = 'This chart may follow a special structure in which the usual strength rules are reversed. Treat this result as a candidate flag that requires specialist review.';
    specialStructure.reasons = [
      '得令: the Month Branch strongly supports the Day Master.',
      'The Day Master has solid same-element roots.',
      `Supportive forces dominate the chart mix (${Math.round(supportivePct)}%).`,
      'Opposing Wealth / Output / Power forces are weak enough to trigger follow-structure review.'
    ];
  }

  let finalScore = baseScore;
  let label = finalScore > 4.0 ? 'Strong' : 'Weak';

  if (specialStructure.flagged && specialStructure.type === 'cong_weak') {
    finalScore = specialStructure.confidence === '真从'
      ? roundTo1(clamp(4.8 + (opposingPct - 74) / 60, 4.8, 5.4))
      : roundTo1(clamp(4.4 + (opposingPct - 60) / 100, 4.2, 4.7));
    label = 'Strong';
  } else if (specialStructure.flagged && specialStructure.type === 'cong_strong') {
    finalScore = specialStructure.confidence === '真从'
      ? roundTo1(clamp(5.0 + (supportivePct - 86) / 60, 5.0, 5.6))
      : roundTo1(clamp(Math.max(finalScore, 4.6), 4.6, 5.2));
    label = 'Strong';
  }

  const usefulElements = (label === 'Strong' || specialStructure.flagged)
    ? opposingElements
    : [companionElem, resourceElem];
  const harmfulElements = (label === 'Strong' || specialStructure.flagged)
    ? [companionElem, resourceElem]
    : opposingElements;

  return {
    score: finalScore,
    label,
    threshold: 4.0,
    scale_label: 'Louis-style 4.0 threshold',
    useful_god: usefulElements.join(','),
    harmful_god: harmfulElements.join(','),
    special_structure: specialStructure,
    details: {
      season: {
        chinese: '得令',
        score: roundTo1(seasonScore),
        month_branch: monthBranch,
        month_main_element: monthMainElement,
        relationship: monthRelation,
        clashed: monthClashed
      },
      roots: {
        chinese: '得地',
        score: roundTo1(rootScore),
        solid_root_count: solidRootCount,
        details: rootDetails
      },
      alliance: {
        chinese: '得势',
        score: roundTo1(allianceScore),
        support: roundTo1(allianceSupport),
        opposition: roundTo1(allianceOpposition)
      },
      force_mix: {
        supportive_pct: Math.round(supportivePct),
        opposing_pct: Math.round(opposingPct),
        elements: Object.fromEntries(Object.entries(forceScores).map(([element, value]) => [element, roundTo1(value)]))
      },
      root_vs_resource_note: 'Root requires the Day Master element inside branch hidden stems. Resource produces the Day Master but is not counted as a root.'
    }
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

    const { year, month, day, hour, minute = 0, gender, target_year } = body;
    const genderStr = gender === 1 ? 'male' : 'female';
    const analysisYear = target_year || new Date().getFullYear();
    const genderInt = gender === 1 ? 1 : 0; // lunar-javascript mapping

    const calculator = new BaziCalculator(year, month, day, hour, minute, 0, genderStr);
    const pillars = calculator.calculatePillars();
    const analysis = calculator.calculateBasicAnalysis();

    // lunar-javascript calculations via the shared calendar engine.
    const calendar = createCalendarContext({ year, month, day, hour, minute, second: 0 });
    const lunar = calendar.lunar;
    const bazi = calendar.eightChar;
    const yun = bazi.getYun(genderInt);

    const mainStructure = calculateMainStructure(bazi);
    const dynamicScoresResult = calculateTenGodsScores(bazi);
    const tenGodsScores = dynamicScoresResult.normalizedScores;

    const simpleStrength = calculateEnhancedStrength(bazi);

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
              
              // 12 Months of the Year
              const monthlyPillars = [];
              for (let m = 2; m <= 13; m++) {
                const yearToUse = m > 12 ? ln.getYear() + 1 : ln.getYear();
                const monthToUse = m > 12 ? m - 12 : m;
                const mCalendar = createCalendarContext({ year: yearToUse, month: monthToUse, day: 15, hour: 12, minute: 0, second: 0 });
                const mPillar = mCalendar.eightChar.getMonth();
                const mStem = mPillar.charAt(0);
                const mBranch = mPillar.charAt(1);
                
                const mHiddenRaw = HIDDEN_STEMS_MAP[mBranch] || [];
                const mHidden = mHiddenRaw.map(h => ({
                  character: h,
                  element: STEM_META[h]?.element || '',
                  ten_god: getTenGod(dayStemChar, h)
                }));

                monthlyPillars.push({
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
                  hidden_stems: mHidden
                });
              }

              lnData.push({
                age: ln.getAge(),
                year: ln.getYear(),
                stem: lnGanZhi.charAt(0),
                branch: lnGanZhi.charAt(1),
                ten_god: getTenGod(dayStemChar, lnGanZhi.charAt(0)),
                monthly_pillars: monthlyPillars
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
        dm_strength: simpleStrength.score,
        dm_strength_label: simpleStrength.label,
        dm_strength_threshold: simpleStrength.threshold,
        dm_strength_scale: simpleStrength.scale_label,
        strength_details: simpleStrength.details,
        special_structure: simpleStrength.special_structure,
        useful_god: simpleStrength.useful_god,
        harmful_god: simpleStrength.harmful_god,
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
    const annualCalendar = createCalendarContext({ year: analysisYear, month: 7, day: 1, hour: 12, minute: 0, second: 0 });
    const annualBazi = annualCalendar.eightChar;
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
      const mCalendar = createCalendarContext({ year: yearToUse, month: monthToUse, day: 15, hour: 12, minute: 0, second: 0 });
      const mPillar = mCalendar.eightChar.getMonth();
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

    // ─── QMDJ ENGINE (qimen-dunjia via CJS bridge) ───
    try {
      const { getQimen } = require('./qimen-bridge.js');
      const qimen = getQimen();
      const yearGz = bazi.getYear();
      const monthGz = bazi.getMonth();
      const dayGz = bazi.getDay();
      const hourGz = bazi.getTime();

      // Implement proper Chai Bu (拆補) Ju Calculation
      const dayGan = dayGz.charAt(0);
      const dayZhi = dayGz.charAt(1);
      const ganArr = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
      const zhiArr = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
      
      const ganIndex = ganArr.indexOf(dayGan);
      const zhiIndex = zhiArr.indexOf(dayZhi);
      
      const offsetToFuTou = ganIndex >= 0 && ganIndex <= 4 ? ganIndex : ganIndex - 5;
      let fuTouZhiIndex = (zhiIndex - offsetToFuTou) % 12;
      if (fuTouZhiIndex < 0) fuTouZhiIndex += 12;
      const fuTouZhi = zhiArr[fuTouZhiIndex];

      let yuan = 0; // 0=Upper, 1=Middle, 2=Lower
      if (['子', '午', '卯', '酉'].includes(fuTouZhi)) yuan = 0;
      else if (['寅', '申', '巳', '亥'].includes(fuTouZhi)) yuan = 1;
      else if (['辰', '戌', '丑', '未'].includes(fuTouZhi)) yuan = 2;

      const JIEQI_SIMP_TO_TRAD: Record<string, string> = {
        '冬至': '冬至', '小寒': '小寒', '大寒': '大寒',
        '立春': '立春', '雨水': '雨水', '惊蛰': '驚蟄',
        '春分': '春分', '清明': '清明', '谷雨': '穀雨',
        '立夏': '立夏', '小满': '小滿', '芒种': '芒種',
        '夏至': '夏至', '小暑': '小暑', '大暑': '大暑',
        '立秋': '立秋', '处暑': '處暑', '白露': '白露',
        '秋分': '秋分', '寒露': '寒露', '霜降': '霜降',
        '立冬': '立冬', '小雪': '小雪', '大雪': '大雪'
      };

      const prevJieQi = lunar.getPrevJieQi(true);
      const jieQiSimp = prevJieQi.getName();
      const jieQiName = JIEQI_SIMP_TO_TRAD[jieQiSimp] || jieQiSimp;
      const jqData = qimen.JIEQI_JUSHU[jieQiName];

      if (!jqData) {
        throw new Error(`QMDJ Error: JieQi data not found for ${jieQiName} (from ${jieQiSimp})`);
      }
      
      const juNumber = jqData.ju[yuan];
      const yinYang = jqData.yang ? '陽' : '陰';

      // Generate the chart using explicit GanZhi and Chai Bu Ju
      const qmdjRaw = qimen.generateQimenChart(
        new Date(year, month - 1, day, hour, minute),
        [yearGz, monthGz, dayGz, hourGz, juNumber, yinYang]
      );
      
      if (qmdjRaw) {
        const qmdjChart = qimen.chartToObject(qmdjRaw);
        
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

        // ─── QMDJ MARKERS: Kong Wang (空/Void) & Tian Ma (馬/Sky Horse) ───
        // Earthly Branch → Luo Shu Palace mapping
        const BRANCH_PALACE: Record<string, number> = {
          '子': 1, '丑': 8, '寅': 8,
          '卯': 3, '辰': 4, '巳': 4,
          '午': 9, '未': 2, '申': 2,
          '酉': 7, '戌': 6, '亥': 6
        };

        // Kong Wang (空/Void): Day Pillar's Xun Kong (日旬空)
        const dayKongWang = bazi.getDayXunKong(); // e.g. "戌亥"
        const kwBranch1 = dayKongWang.charAt(0);
        const kwBranch2 = dayKongWang.charAt(1);
        const kongWangPalaces = [...new Set(
          [BRANCH_PALACE[kwBranch1], BRANCH_PALACE[kwBranch2]].filter(Boolean)
        )];

        // Tian Ma (馬/Sky Horse): Day Branch's Yi Ma (驛馬)
        const tianMaBranch = SHEN_SHA_RULES.YiMa[dayZhi as keyof typeof SHEN_SHA_RULES.YiMa] || '';
        const tianMaPalace = BRANCH_PALACE[tianMaBranch] || null;

        legacyData.qmdj = {
          solar_term: qmdjChart["節氣"] || lunar.getJieQi(),
          ju: `${qmdjChart["陰陽"]}${qmdjChart["局數"]}局`, 
          duty_star: qmdjChart["值符"] || '',
          duty_door: qmdjChart["值使"] || '',
          palaces: palaces,
          kong_wang: {
            branches: dayKongWang,
            palaces: kongWangPalaces
          },
          tian_ma: {
            branch: tianMaBranch,
            palace: tianMaPalace
          }
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
