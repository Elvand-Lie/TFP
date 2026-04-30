// src/utils/analysis-calculator.ts
import {
  ELEMENTS,
  ELEMENT_RELATIONSHIPS,
  RELATIONSHIP_WEIGHTS,
  HIDDEN_STEMS,
  NOBLEMAN_MAP,
  INTELLIGENCE_MAP,
  PEACH_BLOSSOM_MAP,
  GUA_DIRECTIONS,
  STEMS,
  BRANCHES
} from '../constants';
import type { ElementType, Pillars, FiveFactors, EightMansions, DayMasterAnalysis } from '../types';
import type { Pillar } from '../types';


export class AnalysisCalculator {
  constructor() { }

  private getElementFromStem(stem: string): ElementType {
    return Object.entries(ELEMENTS)
      .find(([_, stems]) => stems.includes(stem))?.[0] as ElementType || '' as ElementType;
  }

  private getHiddenStems(branch: string): string[] {
    return HIDDEN_STEMS[branch] || [];
  }

  public calculateFiveFactors(pillars: Pillars): FiveFactors {
    const dayMasterElement = this.getElementFromStem(pillars.day.chinese[0]);

    // Collect all elements including hidden stems
    const elements = [
      pillars.year.chinese[0],  // Year stem
      pillars.month.chinese[0], // Month stem
      pillars.day.chinese[0],   // Day stem
      pillars.time.chinese[0],  // Hour stem
      ...this.getHiddenStems(pillars.year.chinese[1]),
      ...this.getHiddenStems(pillars.month.chinese[1]),
      ...this.getHiddenStems(pillars.day.chinese[1]),
      ...this.getHiddenStems(pillars.time.chinese[1])
    ].map(stem => this.getElementFromStem(stem));

    const weights: { [key: string]: number } = {
      WOOD: 0, FIRE: 0, EARTH: 0, METAL: 0, WATER: 0
    };

    elements.forEach(element => {
      const relationship = ELEMENT_RELATIONSHIPS[dayMasterElement][element];
      weights[element] += RELATIONSHIP_WEIGHTS[relationship];
    });

    const total = Object.values(weights).reduce((a, b) => a + b, 0);

    return {
      WOOD: Math.round((weights.WOOD * 100) / total),
      FIRE: Math.round((weights.FIRE * 100) / total),
      EARTH: Math.round((weights.EARTH * 100) / total),
      METAL: Math.round((weights.METAL * 100) / total),
      WATER: Math.round((weights.WATER * 100) / total)
    };
  }

  public calculateLifeGua(year: number, gender: 'male' | 'female'): number {
    // Reduce year digits to single digit
    let yearSum = year.toString().split('').reduce((acc, d) => acc + parseInt(d), 0);
    while (yearSum >= 10) {
      yearSum = yearSum.toString().split('').reduce((acc, d) => acc + parseInt(d), 0);
    }

    let gua: number;
    if (gender === 'male') {
      gua = 11 - yearSum;
      if (gua > 9) gua -= 9;
    } else {
      gua = yearSum + 4;
      if (gua > 9) gua -= 9;
    }
    // Gua 5 doesn't exist: male→2, female→8
    if (gua === 5) gua = gender === 'male' ? 2 : 8;
    return gua;
  }

  private isWestGroup(gua: number): boolean {
    return [2, 6, 7, 8].includes(gua);
  }

  public calculateEightMansions(lifeGua: number): EightMansions {
    const directions = this.getDirectionsForGua(lifeGua);
    return {
      group: this.isWestGroup(lifeGua) ? 'West' : 'East',
      lucky: {
        wealth: directions.lucky[0],
        health: directions.lucky[1],
        romance: directions.lucky[2],
        career: directions.lucky[3]
      },
      unlucky: {
        obstacles: directions.unlucky[0],
        quarrels: directions.unlucky[1],
        setbacks: directions.unlucky[2],
        totalLoss: directions.unlucky[3]
      }
    };
  }

  private getDirectionsForGua(gua: number): { lucky: string[], unlucky: string[] } {
    return GUA_DIRECTIONS[gua] || GUA_DIRECTIONS[1];
  }

  public calculateNobleman(dayMasterElement: ElementType, dayMasterStem: string): string[] {
    // NOBLEMAN_MAP is now keyed by stem directly
    return NOBLEMAN_MAP[dayMasterStem] || [];
  }

  public calculateIntelligence(dayMasterStem: string): string {
    // INTELLIGENCE_MAP is now keyed by stem directly
    return INTELLIGENCE_MAP[dayMasterStem] || '';
  }

  public calculatePeachBlossom(yearBranch: string): string {
    // PEACH_BLOSSOM_MAP is now keyed by year branch (san he group)
    return PEACH_BLOSSOM_MAP[yearBranch] || '';
  }

  public getStemNature(stem: string): 'Yang' | 'Yin' {
    return STEMS.indexOf(stem) % 2 === 0 ? 'Yang' : 'Yin';
  }

  public getSkyHorse(yearBranch: string): string {
    // Yi Ma (Sky Horse) is based on the san he frame of the year branch
    const yiMaMap: Record<string, string> = {
      '申': '寅', '子': '寅', '辰': '寅',
      '亥': '巳', '卯': '巳', '未': '巳',
      '寅': '申', '午': '申', '戌': '申',
      '巳': '亥', '酉': '亥', '丑': '亥'
    };
    return yiMaMap[yearBranch] || '';
  }

  public calculateDayMaster(dayPillar: Pillar): DayMasterAnalysis {
    const dayMasterStem = dayPillar.chinese[0];
    const dayMasterElement = this.getElementFromStem(dayMasterStem);
    return {
      stem: dayMasterStem,
      nature: this.getStemNature(dayMasterStem),
      element: dayMasterElement,
    };
  }
}
