import { LunarUtil, Solar } from 'lunar-javascript';
import {
  ANIMALS,
  BRANCHES,
  BRANCH_ELEMENTS,
  ELEMENTS,
  STEMS,
} from '../api/bazi-calculator/constants';

export interface CalendarInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
}

export interface BirthInput extends CalendarInput {
  gender?: 'male' | 'female' | 0 | 1 | string;
}

export interface PillarRecord {
  chinese: string;
  element: string;
  animal: string;
  naYin: string;
  branch: {
    element: string;
  };
}

export interface CalendarPillars {
  year: PillarRecord;
  month: PillarRecord;
  day: PillarRecord;
  time: PillarRecord;
}

export interface HourBlock {
  branch: string;
  label: string;
  start: string;
  end: string;
  pillar: string;
  stem: string;
  element: string;
  animal: string;
  yi: string[];
  ji: string[];
  score: number;
  tone: 'favorable' | 'mixed' | 'avoid';
}

export interface JieQiSnapshot {
  name: string;
  startsAt: string;
  nextName: string;
  nextStartsAt: string;
}

export interface ConversionSnapshot {
  gregorian: string;
  lunar: string;
  islamic: string;
}

export interface ActivityDomain {
  key: string;
  title: string;
  chinese: string;
  status: 'suitable' | 'avoid' | 'neutral';
  matched: string[];
}

export interface DayReading {
  yi: string[];
  ji: string[];
  domains: ActivityDomain[];
  clash: string;
  clashDesc: string;
  sha: string;
  dayOfficer: {
    chinese: string;
    english: string;
  };
  yellowPath: {
    isYellowPath: boolean;
    label: string;
    tianShen: string;
    type: string;
    luck: string;
  };
  pengZu: {
    gan: string;
    zhi: string;
  };
  taiShen: string;
  liuYao: string;
  wuHou: string;
  constellation: {
    xiu: string;
    zheng: string;
    animal: string;
    luck: string;
  };
  directions: {
    xi: string;
    yangGui: string;
    yinGui: string;
    fu: string;
    cai: string;
  };
  dayJiShen: string[];
  dayXiongSha: string[];
}

export interface CalendarContext {
  input: Required<CalendarInput>;
  solar: Solar;
  lunar: any;
  eightChar: any;
  conversions: ConversionSnapshot;
  pillars: CalendarPillars;
  jieQi: JieQiSnapshot;
  day: DayReading;
  hourBlocks: HourBlock[];
  dayMaster: {
    stem: string;
    element: string;
    nature: 'Yang' | 'Yin';
  };
  share: {
    title: string;
    excerpt: string;
    url: string;
    image: string;
  };
}

export interface CompatibilityResult {
  score: number;
  label: string;
  summary: string;
  birthElement: string;
  dayElement: string;
  helpfulElements: string[];
  personalClash: {
    clashes: boolean;
    branch: string;
    animal: string;
    summary: string;
  };
  caution: string;
  helpfulHours: Array<{
    branch: string;
    label: string;
    pillar: string;
    reason: string;
  }>;
}

export interface PersonalAlmanacPayload {
  date: string;
  open: ReturnType<typeof buildDailyAlmanacPayload>['open'];
  compatibility: CompatibilityResult;
  birth: {
    date: string;
    pillars: CalendarPillars;
    dayMaster: {
      stem: string;
      element: string;
      nature: 'Yang' | 'Yin';
    };
  };
  share: ReturnType<typeof buildDailyAlmanacPayload>['share'];
}

const DAY_OFFICER_NAMES: Record<string, string> = {
  '建': 'Establish',
  '除': 'Remove',
  '满': 'Full',
  '平': 'Balance',
  '定': 'Settle',
  '执': 'Hold',
  '破': 'Break',
  '危': 'Danger',
  '成': 'Complete',
  '收': 'Receive',
  '开': 'Open',
  '闭': 'Close',
};

const ACTIVITY_DOMAINS: Array<{
  key: string;
  title: string;
  chinese: string;
  terms: string[];
}> = [
  { key: 'business', title: 'Business Launch', chinese: '开市', terms: ['开市', '开业', '交易', '纳财', '立券'] },
  { key: 'contracts', title: 'Signing Contracts', chinese: '签约', terms: ['签约', '交易', '立券', '订盟', '纳采'] },
  { key: 'moving', title: 'Moving House', chinese: '移徙', terms: ['移徙', '入宅', '安床'] },
  { key: 'renovation', title: 'Renovation / Ground-Breaking', chinese: '动土', terms: ['动土', '修造', '破土', '起基', '上梁'] },
  { key: 'wedding', title: 'Wedding / ROM', chinese: '嫁娶', terms: ['嫁娶', '结婚', '订婚', '纳采'] },
  { key: 'travel', title: 'Travel', chinese: '出行', terms: ['出行', '赴任'] },
];

export function formatDateIso(input: CalendarInput) {
  return [
    String(input.year).padStart(4, '0'),
    String(input.month).padStart(2, '0'),
    String(input.day).padStart(2, '0'),
  ].join('-');
}

export function formatDateTimeIso(input: CalendarInput) {
  const minute = input.minute ?? 0;
  const second = input.second ?? 0;
  return `${formatDateIso(input)} ${String(input.hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function getStemElement(stem: string) {
  return Object.entries(ELEMENTS).find(([, stems]) => stems.includes(stem))?.[0] || '';
}

function getBranchElement(branch: string) {
  return Object.entries(BRANCH_ELEMENTS).find(([, branches]) => branches.includes(branch))?.[0] || '';
}

function getBranchAnimal(branch: string) {
  const idx = BRANCHES.indexOf(branch);
  return idx >= 0 ? ANIMALS[idx] : '';
}

function getStemNature(stem: string): 'Yang' | 'Yin' {
  const idx = STEMS.indexOf(stem);
  return idx >= 0 && idx % 2 === 0 ? 'Yang' : 'Yin';
}

function getHourBranch(hour: number) {
  if (hour >= 23 || hour < 1) return '子';
  if (hour < 3) return '丑';
  if (hour < 5) return '寅';
  if (hour < 7) return '卯';
  if (hour < 9) return '辰';
  if (hour < 11) return '巳';
  if (hour < 13) return '午';
  if (hour < 15) return '未';
  if (hour < 17) return '申';
  if (hour < 19) return '酉';
  if (hour < 21) return '戌';
  return '亥';
}

function getTimeStem(dayStem: string, hourBranch: string) {
  const dayIndex = STEMS.indexOf(dayStem);
  const branchIndex = BRANCHES.indexOf(hourBranch);
  if (dayIndex < 0 || branchIndex < 0) return '';
  const startIndex = (dayIndex % 5) * 2;
  return STEMS[(startIndex + branchIndex) % 10];
}

function patchEightChar(eightChar: any, lunar: any, input: Required<CalendarInput>) {
  const timeBranch = getHourBranch(input.hour);
  const dayStem = lunar.getDayGanExact2 ? lunar.getDayGanExact2() : lunar.getDayGan();
  const timeStem = getTimeStem(dayStem, timeBranch);
  const timePillar = `${timeStem}${timeBranch}`;

  return Object.assign(Object.create(eightChar), {
    getTime() {
      return timePillar;
    },
    getTimeGan() {
      return timeStem;
    },
    getTimeZhi() {
      return timeBranch;
    },
    getTimeInGanZhi() {
      return timePillar;
    },
    getTimeNaYin() {
      return LunarUtil.NAYIN[timePillar] || '';
    },
    getTimeShiShenGan() {
      return LunarUtil.SHI_SHEN[dayStem + timeStem];
    },
    getTimeShiShenZhi() {
      const hideGan = LunarUtil.ZHI_HIDE_GAN[timeBranch] || [];
      return hideGan.map((h: string) => LunarUtil.SHI_SHEN[dayStem + h]);
    },
    getTimeWuXing() {
      return `${LunarUtil.WU_XING_GAN[timeStem]}${LunarUtil.WU_XING_ZHI[timeBranch]}`;
    },
  });
}

function buildPillar(chinese: string, naYin = ''): PillarRecord {
  const stem = chinese.charAt(0);
  const branch = chinese.charAt(1);
  return {
    chinese,
    element: getStemElement(stem),
    animal: getBranchAnimal(branch),
    naYin,
    branch: {
      element: getBranchElement(branch),
    },
  };
}

function formatIslamicDate(input: Required<CalendarInput>) {
  try {
    return new Intl.DateTimeFormat('en-TN-u-ca-islamic', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(Date.UTC(input.year, input.month - 1, input.day, 12, 0, 0)));
  } catch {
    return '';
  }
}

function buildConversions(lunar: any, input: Required<CalendarInput>): ConversionSnapshot {
  const lunarText = lunar.getYearInChinese && lunar.getMonthInChinese && lunar.getDayInChinese
    ? `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`
    : lunar.toString?.() || '';
  return {
    gregorian: formatDateIso(input),
    lunar: lunarText,
    islamic: formatIslamicDate(input),
  };
}

function matchedTerms(items: string[], terms: string[]) {
  return terms.filter((term) => items.some((item) => item.includes(term)));
}

function buildActivityDomains(yi: string[], ji: string[]): ActivityDomain[] {
  return ACTIVITY_DOMAINS.map((domain) => {
    const suitable = matchedTerms(yi, domain.terms);
    const avoid = matchedTerms(ji, domain.terms);
    const status = suitable.length ? 'suitable' : avoid.length ? 'avoid' : 'neutral';
    return {
      key: domain.key,
      title: domain.title,
      chinese: domain.chinese,
      status,
      matched: suitable.length ? suitable : avoid,
    };
  });
}

function buildDayOfficer(lunar: any) {
  const chinese = lunar.getZhiXing ? lunar.getZhiXing() : '';
  return {
    chinese,
    english: DAY_OFFICER_NAMES[chinese] || chinese,
  };
}

function buildYellowPath(lunar: any) {
  const tianShen = lunar.getDayTianShen ? lunar.getDayTianShen() : '';
  const type = lunar.getDayTianShenType ? lunar.getDayTianShenType() : '';
  const luck = lunar.getDayTianShenLuck ? lunar.getDayTianShenLuck() : '';
  const isYellowPath = type.includes('黄') || luck === '吉';
  return {
    isYellowPath,
    label: isYellowPath ? 'Auspicious Yellow-Path Day' : 'Black-Path / Caution Day',
    tianShen,
    type,
    luck,
  };
}

function buildHourBlock(dayPillar: string, dayStem: string, branch: string, start: string, end: string): HourBlock {
  const stem = getTimeStem(dayStem, branch);
  const pillar = `${stem}${branch}`;
  const yi = LunarUtil.getTimeYi(dayPillar, pillar) || [];
  const ji = LunarUtil.getTimeJi(dayPillar, pillar) || [];
  const score = yi.length * 2 - ji.length;
  return {
    branch,
    label: `${start}-${end}`,
    start,
    end,
    pillar,
    stem,
    element: getStemElement(stem),
    animal: getBranchAnimal(branch),
    yi,
    ji,
    score,
    tone: score > 0 ? 'favorable' : score < 0 ? 'avoid' : 'mixed',
  };
}

function buildHourBlocks(dayPillar: string, dayStem: string): HourBlock[] {
  const ranges = [
    ['子', '23:00', '00:59'],
    ['丑', '01:00', '02:59'],
    ['寅', '03:00', '04:59'],
    ['卯', '05:00', '06:59'],
    ['辰', '07:00', '08:59'],
    ['巳', '09:00', '10:59'],
    ['午', '11:00', '12:59'],
    ['未', '13:00', '14:59'],
    ['申', '15:00', '16:59'],
    ['酉', '17:00', '18:59'],
    ['戌', '19:00', '20:59'],
    ['亥', '21:00', '22:59'],
  ] as const;
  return ranges.map(([branch, start, end]) => buildHourBlock(dayPillar, dayStem, branch, start, end));
}

function getActiveJieQi(lunar: any): JieQiSnapshot {
  const active = lunar.getPrevJieQi(true);
  const next = lunar.getNextJieQi(true);
  return {
    name: active.getName(),
    startsAt: active.getSolar().toYmdHms(),
    nextName: next.getName(),
    nextStartsAt: next.getSolar().toYmdHms(),
  };
}

function buildDayReading(lunar: any): DayReading {
  const yi = lunar.getDayYi(2) || [];
  const ji = lunar.getDayJi(2) || [];
  return {
    yi,
    ji,
    domains: buildActivityDomains(yi, ji),
    clash: lunar.getDayChong ? lunar.getDayChong() : '',
    clashDesc: lunar.getDayChongDesc ? lunar.getDayChongDesc() : '',
    sha: lunar.getSha ? lunar.getSha() : '',
    dayOfficer: buildDayOfficer(lunar),
    yellowPath: buildYellowPath(lunar),
    pengZu: {
      gan: lunar.getPengZuGan ? lunar.getPengZuGan() : '',
      zhi: lunar.getPengZuZhi ? lunar.getPengZuZhi() : '',
    },
    taiShen: lunar.getDayPositionTai ? lunar.getDayPositionTai() : '',
    liuYao: lunar.getLiuYao ? lunar.getLiuYao() : '',
    wuHou: lunar.getWuHou ? lunar.getWuHou() : '',
    constellation: {
      xiu: lunar.getXiu ? lunar.getXiu() : '',
      zheng: lunar.getZheng ? lunar.getZheng() : '',
      animal: lunar.getAnimal ? lunar.getAnimal() : '',
      luck: lunar.getXiuLuck ? lunar.getXiuLuck() : '',
    },
    directions: {
      xi: lunar.getDayPositionXi ? lunar.getDayPositionXi() : '',
      yangGui: lunar.getDayPositionYangGui ? lunar.getDayPositionYangGui() : '',
      yinGui: lunar.getDayPositionYinGui ? lunar.getDayPositionYinGui() : '',
      fu: lunar.getDayPositionFu ? lunar.getDayPositionFu() : '',
      cai: lunar.getDayPositionCai ? lunar.getDayPositionCai() : '',
    },
    dayJiShen: lunar.getDayJiShen ? lunar.getDayJiShen() || [] : [],
    dayXiongSha: lunar.getDayXiongSha ? lunar.getDayXiongSha() || [] : [],
  };
}

function buildSummary(activeJieQi: JieQiSnapshot, day: DayReading, pillars: CalendarPillars) {
  const yi = day.yi.slice(0, 4).join(' · ');
  const ji = day.ji.slice(0, 4).join(' · ');
  const officer = day.dayOfficer.english ? `${day.dayOfficer.english} Officer` : 'day officer';
  return `${activeJieQi.name} sits over ${pillars.day.chinese} (${pillars.day.naYin || 'NaYin'}). ${day.yellowPath.label} with the ${officer}. Favor ${yi || 'careful action'} and keep ${ji || 'heavy commitments'} off the table.`;
}

function buildShare(dateIso: string, activeJieQi: JieQiSnapshot) {
  return {
    title: `Daily Almanac · ${dateIso}`,
    excerpt: `${activeJieQi.name} window for ${dateIso}.`,
    url: `/daily-almanac?date=${dateIso}`,
    image: '/assets/logo.png',
  };
}

export function createCalendarContext(input: CalendarInput): CalendarContext {
  const normalized: Required<CalendarInput> = {
    year: input.year,
    month: input.month,
    day: input.day,
    hour: input.hour,
    minute: input.minute ?? 0,
    second: input.second ?? 0,
  };
  const solar = Solar.fromYmdHms(
    normalized.year,
    normalized.month,
    normalized.day,
    normalized.hour,
    normalized.minute,
    normalized.second,
  );
  const lunar = solar.getLunar();
  const eightChar = patchEightChar(lunar.getEightChar(), lunar, normalized);

  const dayPillar = eightChar.getDay();
  const dayStem = eightChar.getDayGan();

  const pillars = {
    year: buildPillar(eightChar.getYear(), eightChar.getYearNaYin ? eightChar.getYearNaYin() : lunar.getYearNaYin?.() || ''),
    month: buildPillar(eightChar.getMonth(), eightChar.getMonthNaYin ? eightChar.getMonthNaYin() : lunar.getMonthNaYin?.() || ''),
    day: buildPillar(dayPillar, eightChar.getDayNaYin ? eightChar.getDayNaYin() : lunar.getDayNaYin?.() || ''),
    time: buildPillar(eightChar.getTime(), eightChar.getTimeNaYin ? eightChar.getTimeNaYin() : ''),
  };

  const conversions = buildConversions(lunar, normalized);
  const jieQi = getActiveJieQi(lunar);
  const day = buildDayReading(lunar);
  const hourBlocks = buildHourBlocks(dayPillar, dayStem);
  const dayMaster = {
    stem: dayStem,
    element: getStemElement(dayStem),
    nature: getStemNature(dayStem),
  };
  const dateIso = formatDateIso(normalized);

  return {
    input: normalized,
    solar,
    lunar,
    eightChar,
    conversions,
    pillars,
    jieQi,
    day,
    hourBlocks,
    dayMaster,
    share: buildShare(dateIso, jieQi),
  };
}

function getRelationshipScore(source: string, target: string) {
  const produces = {
    Wood: 'Fire',
    Fire: 'Earth',
    Earth: 'Metal',
    Metal: 'Water',
    Water: 'Wood',
  } as Record<string, string>;
  const controls = {
    Wood: 'Earth',
    Earth: 'Water',
    Water: 'Fire',
    Fire: 'Metal',
    Metal: 'Wood',
  } as Record<string, string>;

  if (!source || !target) {
    return { score: 0, label: 'neutral', helpful: [] as string[] };
  }
  if (source === target) {
    return { score: 14, label: 'same', helpful: [source] };
  }
  if (produces[source] === target) {
    return { score: 18, label: 'supports', helpful: [target] };
  }
  if (produces[target] === source) {
    return { score: 8, label: 'receives', helpful: [source] };
  }
  if (controls[source] === target) {
    return { score: -10, label: 'pressures', helpful: [produces[source], target] };
  }
  if (controls[target] === source) {
    return { score: -14, label: 'contended', helpful: [target] };
  }
  return { score: 2, label: 'neutral', helpful: [source, target] };
}

function getBranchRelationship(branchA: string, branchB: string) {
  const clashPairs: Record<string, string> = {
    '子': '午', '丑': '未', '寅': '申', '卯': '酉', '辰': '戌', '巳': '亥',
    '午': '子', '未': '丑', '申': '寅', '酉': '卯', '戌': '辰', '亥': '巳',
  };
  const harmonyPairs: Record<string, string> = {
    '子': '丑', '丑': '子', '寅': '亥', '亥': '寅', '卯': '戌', '戌': '卯',
    '辰': '酉', '酉': '辰', '巳': '申', '申': '巳', '午': '未', '未': '午',
  };

  if (!branchA || !branchB) {
    return { score: 0, label: 'neutral' };
  }
  if (branchA === branchB) {
    return { score: 8, label: 'same' };
  }
  if (clashPairs[branchA] === branchB) {
    return { score: -12, label: 'clash' };
  }
  if (harmonyPairs[branchA] === branchB) {
    return { score: 10, label: 'harmony' };
  }
  return { score: 0, label: 'neutral' };
}

function rankHourBlocks(blocks: HourBlock[], helpfulElements: string[]) {
  return [...blocks]
    .map((block) => {
      const elementBonus = helpfulElements.includes(block.element) ? 10 : 0;
      const yiBonus = Math.min(block.yi.length, 6);
      const jiPenalty = Math.min(block.ji.length, 6);
      return {
        ...block,
        score: block.score + elementBonus + yiBonus - jiPenalty,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildCompatibility(selected: CalendarContext, birth: BirthInput): CompatibilityResult {
  const birthContext = createCalendarContext(birth);
  const selectedDayElement = selected.dayMaster.element;
  const birthDayElement = birthContext.dayMaster.element;

  const elementRelation = getRelationshipScore(selectedDayElement, birthDayElement);
  const personalBranchRelation = getBranchRelationship(
    selected.eightChar.getDayZhi(),
    birthContext.eightChar.getYearZhi(),
  );
  const helpfulElements = Array.from(new Set(elementRelation.helpful));
  const hourRanking = rankHourBlocks(selected.hourBlocks, helpfulElements);

  const score = Math.max(0, Math.min(100, Math.round(50 + elementRelation.score + personalBranchRelation.score)));
  const label = score >= 72 ? 'Strong' : score >= 56 ? 'Supportive' : score >= 42 ? 'Mixed' : 'Caution';
  const birthYearBranch = birthContext.eightChar.getYearZhi();
  const birthYearAnimal = getBranchAnimal(birthYearBranch);
  const personalClash = {
    clashes: personalBranchRelation.label === 'clash',
    branch: birthYearBranch,
    animal: birthYearAnimal,
    summary: personalBranchRelation.label === 'clash'
      ? `The selected day clashes with your ${birthYearAnimal || birthYearBranch} zodiac branch.`
      : `No direct clash against your ${birthYearAnimal || birthYearBranch} zodiac branch.`,
  };
  const bestHours = hourRanking
    .filter((block) => block.score > 0)
    .slice(0, 3)
    .map((block) => ({
      branch: block.branch,
      label: block.label,
      pillar: block.pillar,
      reason: block.yi.slice(0, 2).join(' · ') || block.tone,
    }));

  const summary = `${label} alignment for ${birthContext.dayMaster.element} charts. ${selected.jieQi.name} favors ${helpfulElements.join(', ') || 'steady execution'} today.`;
  const caution = personalClash.clashes
    ? 'Watch for direct pressure between the day branch and your birth-year zodiac.'
    : 'Keep the day simple and prioritize the cleanest opening.';

  return {
    score,
    label,
    summary,
    birthElement: birthDayElement,
    dayElement: selectedDayElement,
    helpfulElements,
    personalClash,
    caution,
    helpfulHours: bestHours,
  };
}

export function buildDailyAlmanacPayload(input: CalendarInput) {
  const context = createCalendarContext(input);
  return {
    date: formatDateIso(context.input),
    moment: formatDateTimeIso(context.input),
    conversions: context.conversions,
    pillars: context.pillars,
    jieQi: context.jieQi,
    day: context.day,
    hourBlocks: context.hourBlocks,
    dayMaster: context.dayMaster,
    summary: buildSummary(context.jieQi, context.day, context.pillars),
    open: {
      summary: buildSummary(context.jieQi, context.day, context.pillars),
      conversions: context.conversions,
      jieQi: context.jieQi,
      pillars: context.pillars,
      day: context.day,
      hourBlocks: context.hourBlocks,
      highlights: {
        yi: context.day.yi.slice(0, 5),
        ji: context.day.ji.slice(0, 5),
      },
    },
    share: context.share,
  };
}

export function buildPersonalAlmanacPayload(input: CalendarInput, birth: BirthInput): PersonalAlmanacPayload {
  const context = createCalendarContext(input);
  const compatibility = buildCompatibility(context, birth);
  const birthContext = createCalendarContext(birth);

  return {
    date: formatDateIso(context.input),
    open: buildDailyAlmanacPayload(input).open,
    compatibility,
    birth: {
      date: formatDateIso(birthContext.input),
      pillars: birthContext.pillars,
      dayMaster: birthContext.dayMaster,
    },
    share: context.share,
  };
}

export function parseGender(value: unknown): 'male' | 'female' {
  if (value === 1 || value === '1' || value === 'male' || value === 'm') return 'male';
  return 'female';
}

export function getTimePillarForMoment(input: CalendarInput) {
  const context = createCalendarContext(input);
  return context.pillars.time.chinese;
}
