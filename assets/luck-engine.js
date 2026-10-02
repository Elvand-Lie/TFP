/*
 * Daily luck engine, ported verbatim from the approved "Am I Lucky Today"
 * LUCK ENGINE V2.7 (amiluckytoday.app). Arithmetic, thresholds, table values
 * and output shape are preserved exactly; only names are made readable.
 * Depends on lunar-javascript (Solar + EightChar) for calendar conversion.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('lunar-javascript'));
  } else {
    root.LuckEngine = factory({ Solar: root.Solar });
  }
})(typeof self !== 'undefined' ? self : this, function (lunar) {
  'use strict';

  const STEM_ELEMENT = {
    '甲': 'Wood', '乙': 'Wood',
    '丙': 'Fire', '丁': 'Fire',
    '戊': 'Earth', '己': 'Earth',
    '庚': 'Metal', '辛': 'Metal',
    '壬': 'Water', '癸': 'Water',
  };

  const STEM_TRAITS = {
    '甲': { element: 'Wood', polarity: 'Yang' },
    '乙': { element: 'Wood', polarity: 'Yin' },
    '丙': { element: 'Fire', polarity: 'Yang' },
    '丁': { element: 'Fire', polarity: 'Yin' },
    '戊': { element: 'Earth', polarity: 'Yang' },
    '己': { element: 'Earth', polarity: 'Yin' },
    '庚': { element: 'Metal', polarity: 'Yang' },
    '辛': { element: 'Metal', polarity: 'Yin' },
    '壬': { element: 'Water', polarity: 'Yang' },
    '癸': { element: 'Water', polarity: 'Yin' },
  };

  // Hidden stems with weights used by the daily-score pillar contribution.
  const DAILY_HIDDEN_STEMS = {
    '子': [{ stem: '癸', weight: 1 }],
    '丑': [{ stem: '己', weight: 0.6 }, { stem: '癸', weight: 0.3 }, { stem: '辛', weight: 0.1 }],
    '寅': [{ stem: '甲', weight: 0.6 }, { stem: '丙', weight: 0.3 }, { stem: '戊', weight: 0.1 }],
    '卯': [{ stem: '乙', weight: 1 }],
    '辰': [{ stem: '戊', weight: 0.6 }, { stem: '乙', weight: 0.3 }, { stem: '癸', weight: 0.1 }],
    '巳': [{ stem: '丙', weight: 0.6 }, { stem: '庚', weight: 0.3 }, { stem: '戊', weight: 0.1 }],
    '午': [{ stem: '丁', weight: 0.7 }, { stem: '己', weight: 0.3 }],
    '未': [{ stem: '己', weight: 0.6 }, { stem: '丁', weight: 0.3 }, { stem: '乙', weight: 0.1 }],
    '申': [{ stem: '庚', weight: 0.6 }, { stem: '壬', weight: 0.3 }, { stem: '戊', weight: 0.1 }],
    '酉': [{ stem: '辛', weight: 1 }],
    '戌': [{ stem: '戊', weight: 0.6 }, { stem: '辛', weight: 0.3 }, { stem: '丁', weight: 0.1 }],
    '亥': [{ stem: '壬', weight: 0.7 }, { stem: '甲', weight: 0.3 }],
  };

  // Separate hidden-stem table used by the body-strength calculation and the
  // month-primary-stem lookup (this is the R1 "z" table).
  const BRANCH_HIDDEN_STEMS = {
    '子': { '癸': 1 },
    '丑': { '己': 1, '癸': 0.5, '辛': 0.5 },
    '寅': { '甲': 1, '丙': 0.5, '戊': 0.5 },
    '卯': { '乙': 1 },
    '辰': { '戊': 1, '乙': 0.5, '癸': 0.5 },
    '巳': { '丙': 1, '戊': 0.5, '庚': 0.5 },
    '午': { '丁': 1, '己': 0.5 },
    '未': { '己': 1, '丁': 0.5, '乙': 0.5 },
    '申': { '庚': 1, '壬': 0.5, '戊': 0.5 },
    '酉': { '辛': 1 },
    '戌': { '戊': 1, '辛': 0.5, '丁': 0.5 },
    '亥': { '壬': 1, '甲': 0.5 },
  };

  // Ten-god score contributions for a Strong day master.
  const TEN_GOD_SCORE_STRONG = {
    '比肩': -2, '劫财': -2, '偏印': -1.5, '正印': -1.5,
    '食神': 2.5, '伤官': 2, '偏财': 3, '正财': 2.5, '七杀': 2, '正官': 1.5,
  };

  // Ten-god score contributions for a Weak day master.
  const TEN_GOD_SCORE_WEAK = {
    '比肩': 2, '劫财': 2, '偏印': 2.5, '正印': 3,
    '食神': -1.5, '伤官': -2, '偏财': -2, '正财': -1.5, '七杀': -3, '正官': -2,
  };

  const GENERATES = { Wood: 'Fire', Fire: 'Earth', Earth: 'Metal', Metal: 'Water', Water: 'Wood' };
  const CONTROLS = { Wood: 'Earth', Earth: 'Water', Water: 'Fire', Fire: 'Metal', Metal: 'Wood' };

  const BRANCH_ELEMENT = {
    '子': 'Water', '丑': 'Earth', '寅': 'Wood', '卯': 'Wood',
    '辰': 'Earth', '巳': 'Fire', '午': 'Fire', '未': 'Earth',
    '申': 'Metal', '酉': 'Metal', '戌': 'Earth', '亥': 'Water',
  };

  const GUA_LABEL = {
    1: '1 (Kan)', 2: '2 (Kun)', 3: '3 (Zhen)', 4: '4 (Xun)',
    6: '6 (Qian)', 7: '7 (Dui)', 8: '8 (Gen)', 9: '9 (Li)',
  };

  const GUA_DIRECTIONS = {
    1: ['Southeast', 'East', 'South', 'North'],
    2: ['Northeast', 'West', 'Northwest', 'Southwest'],
    3: ['South', 'North', 'Southeast', 'East'],
    4: ['North', 'South', 'East', 'Southeast'],
    6: ['West', 'Northeast', 'Southwest', 'Northwest'],
    7: ['Northwest', 'Southwest', 'Northeast', 'West'],
    8: ['Southwest', 'Northwest', 'West', 'Northeast'],
    9: ['East', 'Southeast', 'North', 'South'],
  };

  const STEM_INFO = {
    '甲': { num: 1, pinyin: 'Jiǎ' }, '乙': { num: 2, pinyin: 'Yǐ' },
    '丙': { num: 3, pinyin: 'Bǐng' }, '丁': { num: 4, pinyin: 'Dīng' },
    '戊': { num: 5, pinyin: 'Wù' }, '己': { num: 6, pinyin: 'Jǐ' },
    '庚': { num: 7, pinyin: 'Gēng' }, '辛': { num: 8, pinyin: 'Xīn' },
    '壬': { num: 9, pinyin: 'Rén' }, '癸': { num: 0, pinyin: 'Guǐ' },
  };

  const LUCKY_COLORS = {
    Wood: [
      { name: 'Green', hex: '#22c55e' },
      { name: 'Teal', hex: '#14b8a6' },
      { name: 'Olive', hex: '#65a30d' },
    ],
    Fire: [
      { name: 'Red', hex: '#ef4444' },
      { name: 'Orange', hex: '#f97316' },
      { name: 'Pink', hex: '#ec4899' },
      { name: 'Purple', hex: '#a855f7' },
    ],
    Earth: [
      { name: 'Yellow', hex: '#eab308' },
      { name: 'Brown', hex: '#78350f' },
      { name: 'Beige', hex: '#f5f5dc' },
    ],
    Metal: [
      { name: 'White', hex: '#ffffff' },
      { name: 'Gold', hex: '#fbbf24' },
      { name: 'Silver', hex: '#9ca3af' },
      { name: 'Grey', hex: '#6b7280' },
    ],
    Water: [
      { name: 'Black', hex: '#000000' },
      { name: 'Navy Blue', hex: '#1e3a8a' },
      { name: 'Deep Blue', hex: '#1d4ed8' },
    ],
  };

  const DIRECTION_NAMES = {
    North: { zh: '北', py: 'Běi' },
    South: { zh: '南', py: 'Nán' },
    East: { zh: '东', py: 'Dōng' },
    West: { zh: '西', py: 'Xī' },
    Northeast: { zh: '东北', py: 'Dōngběi' },
    Northwest: { zh: '西北', py: 'Xīběi' },
    Southeast: { zh: '东南', py: 'Dōngnán' },
    Southwest: { zh: '西南', py: 'Xīnán' },
  };

  // The final entry covers 23:00-23:59 (late Zi hour).
  const HOURS = [
    { branch: '子', time: '00:00 - 01:00', py: 'Zǐ', endMinute: 60 },
    { branch: '丑', time: '01:00 - 03:00', py: 'Chǒu', endMinute: 180 },
    { branch: '寅', time: '03:00 - 05:00', py: 'Yín', endMinute: 300 },
    { branch: '卯', time: '05:00 - 07:00', py: 'Mǎo', endMinute: 420 },
    { branch: '辰', time: '07:00 - 09:00', py: 'Chén', endMinute: 540 },
    { branch: '巳', time: '09:00 - 11:00', py: 'Sì', endMinute: 660 },
    { branch: '午', time: '11:00 - 13:00', py: 'Wǔ', endMinute: 780 },
    { branch: '未', time: '13:00 - 15:00', py: 'Wèi', endMinute: 900 },
    { branch: '申', time: '15:00 - 17:00', py: 'Shēn', endMinute: 1020 },
    { branch: '酉', time: '17:00 - 19:00', py: 'Yǒu', endMinute: 1140 },
    { branch: '戌', time: '19:00 - 21:00', py: 'Xū', endMinute: 1260 },
    { branch: '亥', time: '21:00 - 23:00', py: 'Hài', endMinute: 1380 },
    { branch: '子', time: '23:00 - 23:59', py: 'Zǐ', endMinute: 1440 },
  ];

  const ACTIVITIES = [
    { en: 'Signing Contracts', zh: '立契', element: 'Metal', baseScore: 5 },
    { en: 'Wedding', zh: '結婚', element: 'Fire', baseScore: 6 },
    { en: 'Engagement', zh: '訂婚', element: 'Fire', baseScore: 5 },
    { en: 'Moving Home', zh: '入宅', element: 'Earth', baseScore: 4 },
    { en: 'Moving Office', zh: '搬辦公室', element: 'Earth', baseScore: 4 },
    { en: 'Renovation', zh: '動土', element: 'Wood', baseScore: 3 },
    { en: 'Opening Business', zh: '開市', element: 'Fire', baseScore: 5 },
    { en: 'Investment', zh: '立券交易', element: 'Water', baseScore: 4 },
    { en: 'Travel', zh: '出行', element: 'Wood', baseScore: 6 },
    { en: 'Job Interview', zh: '求職', element: 'Fire', baseScore: 5 },
    { en: 'Starting Project', zh: '動工', element: 'Wood', baseScore: 5 },
    { en: 'Networking', zh: '會友', element: 'Wood', baseScore: 7 },
    { en: 'Surgery', zh: '動手術', element: 'Metal', baseScore: 2 },
    { en: 'Lawsuits', zh: '興訟', element: 'Metal', baseScore: 1 },
    { en: 'Funeral', zh: '安葬', element: 'Water', baseScore: 2 },
    { en: 'Praying', zh: '祈福', element: 'Earth', baseScore: 8 },
    { en: 'Haircut', zh: '理髮', element: 'Metal', baseScore: 5 },
    { en: 'Buying Vehicle', zh: '買車', element: 'Metal', baseScore: 4 },
    { en: 'Hosting Event', zh: '宴會', element: 'Fire', baseScore: 6 },
    { en: 'Learning', zh: '入學', element: 'Water', baseScore: 8 },
  ];

  // Same element, or the element this one generates.
  function supports(element, dayMasterElement) {
    return element === dayMasterElement || GENERATES[element] === dayMasterElement;
  }

  // Clashes with the day master: it generates it, it controls it, or it is controlled by it.
  function strains(element, dayMasterElement) {
    return (
      GENERATES[dayMasterElement] === element ||
      CONTROLS[dayMasterElement] === element ||
      CONTROLS[element] === dayMasterElement
    );
  }

  function tenGod(stem, dayMaster) {
    const a = STEM_TRAITS[stem];
    const b = STEM_TRAITS[dayMaster];
    const samePolarity = a.polarity === b.polarity;
    if (a.element === b.element) return samePolarity ? '比肩' : '劫财';
    if (GENERATES[b.element] === a.element) return samePolarity ? '食神' : '伤官';
    if (CONTROLS[b.element] === a.element) return samePolarity ? '偏财' : '正财';
    if (CONTROLS[a.element] === b.element) return samePolarity ? '七杀' : '正官';
    if (GENERATES[a.element] === b.element) return samePolarity ? '偏印' : '正印';
    return '';
  }

  function dayPillarOf(date) {
    const ec = lunar.Solar.fromDate(date).getLunar().getEightChar();
    return ec.getDayGan() + ec.getDayZhi();
  }

  function monthPillarOf(date) {
    const ec = lunar.Solar.fromDate(date).getLunar().getEightChar();
    return ec.getMonthGan() + ec.getMonthZhi();
  }

  function yearPillarOf(date) {
    const ec = lunar.Solar.fromDate(date).getLunar().getEightChar();
    return ec.getYearGan() + ec.getYearZhi();
  }

  function pillarContribution(pillarGanZhi, dayMaster, bodyStatus) {
    const gan = pillarGanZhi[0];
    const zhi = pillarGanZhi[1];
    const table = bodyStatus === 'Strong' ? TEN_GOD_SCORE_STRONG : TEN_GOD_SCORE_WEAK;
    const ganTenGod = tenGod(gan, dayMaster);
    const ganScore = table[ganTenGod] || 0;
    let zhiScore = 0;
    const hidden = DAILY_HIDDEN_STEMS[zhi] || [];
    for (const entry of hidden) {
      const hiddenTenGod = tenGod(entry.stem, dayMaster);
      const s = table[hiddenTenGod] || 0;
      zhiScore += s * entry.weight;
    }
    return ganScore * 0.3 + zhiScore * 0.7;
  }

  function dailyScore(context, now) {
    const weights = [
      { pillar: dayPillarOf(now), weight: 0.6 },
      { pillar: monthPillarOf(now), weight: 0.25 },
      { pillar: yearPillarOf(now), weight: 0.15 },
    ];
    let total = 0;
    for (const { pillar, weight } of weights) {
      if (pillar === null) continue;
      const c = pillarContribution(pillar, context.dayMaster, context.bodyStatus);
      total += c * weight;
    }
    const score = Math.round(5 + total * 0.6);
    return Math.max(1, Math.min(10, score));
  }

  function scoreLabel(score) {
    if (score <= 2) return { en: 'Challenging Day', zh: '险阻日' };
    if (score <= 4) return { en: 'Cautious Day', zh: '谨慎日' };
    if (score === 5) return { en: 'Balanced Day', zh: '平稳日' };
    if (score <= 7) return { en: 'Favorable Day', zh: '顺利日' };
    if (score <= 9) return { en: 'Auspicious Day', zh: '吉祥日' };
    return { en: 'Super Auspicious Day', zh: '大吉日' };
  }

  // Favourable-element selector used when no stem shares a favourable element.
  function fallbackLuckyStem(dayMaster) {
    const chain = { Wood: 'Fire', Fire: 'Earth', Earth: 'Metal', Metal: 'Water', Water: 'Wood' };
    const dayElement = STEM_TRAITS[dayMaster].element;
    const supportsEl = (el) => el === dayElement || chain[el] === dayElement;
    let elements = Object.keys(STEM_TRAITS).map((s) => STEM_TRAITS[s].element).filter(supportsEl);
    elements = [...new Set(elements)];
    let stem = Object.keys(STEM_TRAITS).find((s) => elements.includes(STEM_TRAITS[s].element));
    if (!stem) stem = dayMaster;
    return {
      stem,
      number: STEM_INFO[stem].num,
      tenGods: tenGod(stem, dayMaster),
    };
  }

  function computeDailyLuck(birthDate, birthTime, gender, timeUnknown, now = new Date()) {
    const [y, mo, d] = birthDate.split('-').map(Number);
    let h = 12;
    let mi = 0;
    if (!timeUnknown && birthTime) {
      const parts = birthTime.split(':').map(Number);
      h = parts[0];
      mi = parts[1];
    }

    const birthSolar = lunar.Solar.fromYmdHms(y, mo, d, h, mi, 0);
    const birthLunar = birthSolar.getLunar();
    const ec = birthLunar.getEightChar();
    const yearGan = ec.getYearGan();
    const monthGan = ec.getMonthGan();
    const dayGan = ec.getDayGan();
    const timeGan = ec.getTimeGan();
    const yearZhi = ec.getYearZhi();
    const monthZhi = ec.getMonthZhi();
    const dayZhi = ec.getDayZhi();
    const timeZhi = ec.getTimeZhi();

    const lunarYear = birthLunar.getYear();
    const lastTwo = lunarYear % 100;
    let digitSum = Math.floor(lastTwo / 10) + (lastTwo % 10);
    if (digitSum > 9) digitSum = Math.floor(digitSum / 10) + (digitSum % 10);

    let gua;
    if (lunarYear < 2000) {
      gua = gender === 'male' ? 10 - digitSum : 5 + digitSum;
      if (gua > 9) gua -= 9;
    } else {
      if (gender === 'male') {
        gua = 9 - digitSum;
        if (gua === 0) gua = 9;
      } else {
        gua = 6 + digitSum;
        if (gua > 9) gua -= 9;
      }
    }
    if (gua === 5) gua = gender === 'male' ? 2 : 8;

    const guaLabel = GUA_LABEL[gua] || gua;

    const dayMasterElement = STEM_ELEMENT[dayGan];

    let support = 1;
    let strain = 0;
    [yearGan, monthGan, timeGan].forEach((gan) => {
      const el = STEM_ELEMENT[gan];
      if (supports(el, dayMasterElement)) support += 1;
      if (strains(el, dayMasterElement)) strain += 1;
    });
    [yearZhi, monthZhi, dayZhi, timeZhi].forEach((zhi) => {
      const hidden = BRANCH_HIDDEN_STEMS[zhi];
      for (const [stem, weight] of Object.entries(hidden)) {
        const el = STEM_ELEMENT[stem];
        if (supports(el, dayMasterElement)) support += weight;
        if (strains(el, dayMasterElement)) strain += weight;
      }
    });

    const monthPrimaryStem = Object.keys(BRANCH_HIDDEN_STEMS[monthZhi])[0];
    const monthPrimaryElement = STEM_ELEMENT[monthPrimaryStem];
    if (monthPrimaryElement === dayMasterElement) support += 3;
    else if (GENERATES[monthPrimaryElement] === dayMasterElement) support += 2.5;
    else if (GENERATES[dayMasterElement] === monthPrimaryElement) strain += 2;
    else if (CONTROLS[monthPrimaryElement] === dayMasterElement) strain += 2.5;
    else if (CONTROLS[dayMasterElement] === monthPrimaryElement) strain += 1.5;

    const isStrong = support > strain;
    const bodyStatus = isStrong ? 'Strong' : 'Weak';

    const today = lunar.Solar.fromDate(now);
    const todayEc = today.getLunar().getEightChar();
    todayEc.getDayGan();
    todayEc.getDayZhi();

    let favourable;
    if (isStrong) {
      favourable = Object.keys(STEM_ELEMENT)
        .map((s) => STEM_ELEMENT[s])
        .filter((el) => strains(el, dayMasterElement));
    } else {
      favourable = Object.keys(STEM_ELEMENT)
        .map((s) => STEM_ELEMENT[s])
        .filter((el) => supports(el, dayMasterElement));
    }
    favourable = [...new Set(favourable)];

    const score = dailyScore({ dayMaster: dayGan, bodyStatus }, now);

    let luckyStem = Object.keys(STEM_ELEMENT).find((s) => favourable.includes(STEM_ELEMENT[s]));
    if (!luckyStem) luckyStem = dayGan;
    const lucky = STEM_INFO[luckyStem];

    const colourSet = LUCKY_COLORS[favourable[0] || dayMasterElement];
    const dayOfMonth = today.getDay();
    const luckyColor = colourSet[dayOfMonth % colourSet.length];

    const dirs = GUA_DIRECTIONS[gua] || GUA_DIRECTIONS[1];
    const luckySeat = dirs[dayOfMonth % dirs.length];

    const sgtString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' });
    const sgtNow = new Date(sgtString);
    const sgtMinutes = sgtNow.getHours() * 60 + sgtNow.getMinutes();

    const favourableHours = HOURS.filter((hour) => favourable.includes(BRANCH_ELEMENT[hour.branch]));
    const remainingHours = favourableHours.filter((hour) => hour.endMinute > sgtMinutes + 15);
    let bestTime;
    if (remainingHours.length > 0) {
      bestTime = { ...remainingHours[0], isTomorrow: false };
    } else {
      bestTime = { ...(favourableHours[0] || HOURS[6]), isTomorrow: true };
    }

    const activitySeed = dayOfMonth + score;
    const scored = ACTIVITIES.map((activity, i) => {
      let s = activity.baseScore + ((activitySeed + i) % 5) - 2;
      if (favourable.includes(activity.element)) s += 3;
      if (score > 7) s += 2;
      if (score < 4) s -= 2;
      return { ...activity, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    const auspiciousActivities = scored.slice(0, 8);
    const inauspiciousActivities = scored.slice(-8).reverse();

    return {
      dayMaster: `${dayGan} (${dayMasterElement})`,
      bodyStatus,
      gua: guaLabel,
      luckScore: score,
      luckyNumber: {
        stem: luckyStem,
        pinyin: lucky.pinyin,
        number: lucky.num,
        tenGods: tenGod(luckyStem, dayGan),
      },
      luckyColor,
      luckySeat: { en: luckySeat, zh: DIRECTION_NAMES[luckySeat].zh, py: DIRECTION_NAMES[luckySeat].py },
      bestTime,
      auspiciousActivities,
      inauspiciousActivities,
      auspiciousDirs: dirs,
    };
  }

  return {
    computeDailyLuck,
    scoreLabel,
    tenGod,
    fallbackLuckyStem,
  };
});
