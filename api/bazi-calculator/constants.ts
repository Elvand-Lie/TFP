import type { ElementType } from "./types";

// src/constants.ts
export const STEMS = [
  '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸',
];

export const BRANCHES = [
  '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥',
];

export const ANIMALS = [
  'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
  'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig',
];

export const ELEMENTS: { [key: string]: string[] } = {
  WOOD: ['甲', '乙'],
  FIRE: ['丙', '丁'],
  EARTH: ['戊', '己'],
  METAL: ['庚', '辛'],
  WATER: ['壬', '癸'],
};

export const BRANCH_ELEMENTS: { [key: string]: string[] } = {
  WATER: ['子', '亥'],
  WOOD: ['寅', '卯'],
  FIRE: ['巳', '午'],
  METAL: ['申', '酉'],
  EARTH: ['丑', '辰', '未', '戌'],
};

export const HIDDEN_STEMS: { [key: string]: string[] } = {
  子: ['癸'],
  丑: ['己', '癸', '辛'],
  寅: ['甲', '丙', '戊'],
  卯: ['乙'],
  辰: ['戊', '乙', '癸'],
  巳: ['丙', '庚', '戊'],
  午: ['丁', '己'],
  未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'],
  酉: ['辛'],
  戌: ['戊', '辛', '丁'],
  亥: ['壬', '甲'],
};

export const ELEMENT_RELATIONSHIPS: { [key: string]: { [key: string]: string } } = {
  WOOD: {
    WATER: 'Resource',
    WOOD: 'Companion',
    FIRE: 'Output',
    EARTH: 'Wealth',
    METAL: 'Control'
  },
  FIRE: {
    WOOD: 'Resource',
    FIRE: 'Companion',
    EARTH: 'Output',
    METAL: 'Wealth',
    WATER: 'Control'
  },
  EARTH: {
    FIRE: 'Resource',
    EARTH: 'Companion',
    METAL: 'Output',
    WATER: 'Wealth',
    WOOD: 'Control'
  },
  METAL: {
    EARTH: 'Resource',
    METAL: 'Companion',
    WATER: 'Output',
    WOOD: 'Wealth',
    FIRE: 'Control'
  },
  WATER: {
    METAL: 'Resource',
    WATER: 'Companion',
    WOOD: 'Output',
    FIRE: 'Wealth',
    EARTH: 'Control'
  }
};

export const RELATIONSHIP_WEIGHTS: { [key: string]: number } = {
  'Resource': 3,
  'Companion': 2.5,
  'Output': 2,
  'Wealth': 1.2,
  'Control': 1.2
};

export const HOUR_MAP: [number, number, string][] = [
  [23, 1, '子'], [1, 3, '丑'], [3, 5, '寅'],
  [5, 7, '卯'], [7, 9, '辰'], [9, 11, '巳'],
  [11, 13, '午'], [13, 15, '未'], [15, 17, '申'],
  [17, 19, '酉'], [19, 21, '戌'], [21, 23, '亥'],
];

// Noble People (Tian Yi Gui Ren) — per Heavenly Stem
export const NOBLEMAN_MAP: Record<string, string[]> = {
  '甲': ['未', '丑'],
  '乙': ['申', '子'],
  '丙': ['酉', '亥'],
  '丁': ['亥', '酉'],
  '戊': ['丑', '未'],
  '己': ['子', '申'],
  '庚': ['丑', '未'],
  '辛': ['寅', '午'],
  '壬': ['卯', '巳'],
  '癸': ['巳', '卯'],
};

// Intelligence Star (Wen Chang) — per Heavenly Stem
export const INTELLIGENCE_MAP: Record<string, string> = {
  '甲': '巳',
  '乙': '午',
  '丙': '申',
  '丁': '酉',
  '戊': '申',
  '己': '酉',
  '庚': '亥',
  '辛': '子',
  '壬': '寅',
  '癸': '卯',
};

// Peach Blossom (Tao Hua) — per Year Branch group (三合局)
export const PEACH_BLOSSOM_MAP: Record<string, string> = {
  '申': '酉', '子': '酉', '辰': '酉',
  '亥': '子', '卯': '子', '未': '子',
  '寅': '卯', '午': '卯', '戌': '卯',
  '巳': '午', '酉': '午', '丑': '午',
};

export const GUA_DIRECTIONS: { [key: number]: { lucky: string[], unlucky: string[] } } = {
  // lucky order: [ShengQi, TianYi, YanNian, FuWei]
  // unlucky order: [HuoHai, WuGui, LiuSha, JueMing]
  1: { lucky: ['SE', 'E', 'S', 'N'], unlucky: ['W', 'NE', 'NW', 'SW'] },
  2: { lucky: ['NE', 'W', 'NW', 'SW'], unlucky: ['E', 'SE', 'S', 'N'] },
  3: { lucky: ['S', 'N', 'SE', 'E'], unlucky: ['SW', 'NW', 'NE', 'W'] },
  4: { lucky: ['N', 'S', 'E', 'SE'], unlucky: ['NE', 'SW', 'W', 'NW'] },
  6: { lucky: ['W', 'NE', 'SW', 'NW'], unlucky: ['SE', 'E', 'N', 'S'] },
  7: { lucky: ['NW', 'SW', 'NE', 'W'], unlucky: ['N', 'S', 'SE', 'E'] },
  8: { lucky: ['SW', 'NW', 'W', 'NE'], unlucky: ['S', 'N', 'E', 'SE'] },
  9: { lucky: ['E', 'SE', 'N', 'S'], unlucky: ['NW', 'W', 'SW', 'NE'] }
};
