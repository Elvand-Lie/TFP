// src/utils/pillar-calculator.ts
import { createCalendarContext, getTimePillarForMoment } from '../../../lib/calendar';
import type { Pillar } from '../types';

export class PillarCalculator {
  constructor() { }

  public calculateHourPillar(year: number, month: number, day: number, hour: number, minute = 0, second = 0): string {
    return getTimePillarForMoment({ year, month, day, hour, minute, second });
  }

  public calculatePillars(year: number, month: number, day: number, hour: number, minute = 0, second = 0): { year: Pillar, month: Pillar, day: Pillar, time: Pillar } {
    const context = createCalendarContext({ year, month, day, hour, minute, second });
    return {
      year: context.pillars.year,
      month: context.pillars.month,
      day: context.pillars.day,
      time: context.pillars.time,
    };
  }
}
