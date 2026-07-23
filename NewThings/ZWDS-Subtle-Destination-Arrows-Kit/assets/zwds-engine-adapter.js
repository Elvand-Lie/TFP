// @ts-check
//zwds-engine-adapter.js

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).ZwdsEngineAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MUTAGEN_CONFIG = Object.freeze({
    甲: Object.freeze(['廉贞', '破军', '武曲', '太阳']),
    乙: Object.freeze(['天机', '天梁', '紫微', '太阴']),
    丙: Object.freeze(['天同', '天机', '文昌', '廉贞']),
    丁: Object.freeze(['太阴', '天同', '天机', '巨门']),
    戊: Object.freeze(['贪狼', '太阴', '右弼', '天机']),
    己: Object.freeze(['武曲', '贪狼', '天梁', '文曲']),
    庚: Object.freeze(['太阳', '武曲', '太阴', '天同']),
    辛: Object.freeze(['巨门', '太阳', '文曲', '文昌']),
    壬: Object.freeze(['天梁', '紫微', '左辅', '武曲']),
    癸: Object.freeze(['破军', '巨门', '太阴', '贪狼'])
  });

  const BRANCHES = Object.freeze([
    Object.freeze({ id: 'yin', symbol: '寅' }),
    Object.freeze({ id: 'mao', symbol: '卯' }),
    Object.freeze({ id: 'chen', symbol: '辰' }),
    Object.freeze({ id: 'si', symbol: '巳' }),
    Object.freeze({ id: 'wu', symbol: '午' }),
    Object.freeze({ id: 'wei', symbol: '未' }),
    Object.freeze({ id: 'shen', symbol: '申' }),
    Object.freeze({ id: 'you', symbol: '酉' }),
    Object.freeze({ id: 'xu', symbol: '戌' }),
    Object.freeze({ id: 'hai', symbol: '亥' }),
    Object.freeze({ id: 'zi', symbol: '子' }),
    Object.freeze({ id: 'chou', symbol: '丑' })
  ]);

  const TIME_OPTIONS = Object.freeze([
    Object.freeze({ index: 0, branchId: 'zi', branchLabel: '早子時', range: '00:00–00:59' }),
    Object.freeze({ index: 1, branchId: 'chou', branchLabel: '丑時', range: '01:00–02:59' }),
    Object.freeze({ index: 2, branchId: 'yin', branchLabel: '寅時', range: '03:00–04:59' }),
    Object.freeze({ index: 3, branchId: 'mao', branchLabel: '卯時', range: '05:00–06:59' }),
    Object.freeze({ index: 4, branchId: 'chen', branchLabel: '辰時', range: '07:00–08:59' }),
    Object.freeze({ index: 5, branchId: 'si', branchLabel: '巳時', range: '09:00–10:59' }),
    Object.freeze({ index: 6, branchId: 'wu', branchLabel: '午時', range: '11:00–12:59' }),
    Object.freeze({ index: 7, branchId: 'wei', branchLabel: '未時', range: '13:00–14:59' }),
    Object.freeze({ index: 8, branchId: 'shen', branchLabel: '申時', range: '15:00–16:59' }),
    Object.freeze({ index: 9, branchId: 'you', branchLabel: '酉時', range: '17:00–18:59' }),
    Object.freeze({ index: 10, branchId: 'xu', branchLabel: '戌時', range: '19:00–20:59' }),
    Object.freeze({ index: 11, branchId: 'hai', branchLabel: '亥時', range: '21:00–22:59' }),
    Object.freeze({ index: 12, branchId: 'zi', branchLabel: '晚子時', range: '23:00–23:59' })
  ]);

  const PALACE_ROLE_LABELS = Object.freeze({
    life: '命宮', siblings: '兄弟', spouse: '夫妻', children: '子女', wealth: '財帛',
    health: '疾厄', travel: '遷移', friends: '僕役', career: '官祿', property: '田宅',
    fortune: '福德', parents: '父母'
  });

  const ROLE_BY_LABEL = Object.freeze({
    命宫: 'life', 命宮: 'life',
    兄弟: 'siblings',
    夫妻: 'spouse',
    子女: 'children',
    财帛: 'wealth', 財帛: 'wealth',
    疾厄: 'health',
    迁移: 'travel', 遷移: 'travel',
    仆役: 'friends', 僕役: 'friends', 交友: 'friends',
    官禄: 'career', 官祿: 'career', 事業: 'career',
    田宅: 'property',
    福德: 'fortune',
    父母: 'parents'
  });

  const TRANSFORMATION_IDS = Object.freeze(['lu', 'quan', 'ke', 'ji']);
  const TRANSFORMATION_LABELS = Object.freeze({ lu: '祿', quan: '權', ke: '科', ji: '忌' });
  const TRANSFORMATION_BY_LABEL = Object.freeze({ 禄: 'lu', 祿: 'lu', 权: 'quan', 權: 'quan', 科: 'ke', 忌: 'ji' });
  const GRID_SLOT_ORDER = Object.freeze(['si', 'wu', 'wei', 'shen', 'chen', 'you', 'mao', 'xu', 'yin', 'chou', 'zi', 'hai']);
  const HEAVENLY_STEM_IDS = Object.freeze({
    甲: 'jia', 乙: 'yi', 丙: 'bing', 丁: 'ding', 戊: 'wu',
    己: 'ji', 庚: 'geng', 辛: 'xin', 壬: 'ren', 癸: 'gui'
  });
  const STAR_ID_BY_LABEL = Object.freeze(Object.fromEntries([
    ['ziweiMaj', '紫微'], ['tianjiMaj', '天機'], ['taiyangMaj', '太陽'], ['wuquMaj', '武曲'],
    ['tiantongMaj', '天同'], ['lianzhenMaj', '廉貞'], ['tianfuMaj', '天府'], ['taiyinMaj', '太陰'],
    ['tanlangMaj', '貪狼'], ['jumenMaj', '巨門'], ['tianxiangMaj', '天相'], ['tianliangMaj', '天梁'],
    ['qishaMaj', '七殺'], ['pojunMaj', '破軍'], ['zuofuMin', '左輔'], ['youbiMin', '右弼'],
    ['wenchangMin', '文昌'], ['wenquMin', '文曲'], ['lucunMin', '祿存'], ['tianmaMin', '天馬'],
    ['qingyangMin', '擎羊'], ['tuoluoMin', '陀羅'], ['huoxingMin', '火星'], ['lingxingMin', '鈴星'],
    ['tiankuiMin', '天魁'], ['tianyueMin', '天鉞'], ['dikongMin', '地空'], ['dijieMin', '地劫'],
    ['tiankong', '天空'], ['tianxing', '天刑'], ['tianyao', '天姚'], ['jieshen', '解神'],
    ['yinsha', '陰煞'], ['tianxi', '天喜'], ['tianguan', '天官'], ['tianfu', '天福'],
    ['tianku', '天哭'], ['tianxu', '天虛'], ['longchi', '龍池'], ['fengge', '鳳閣'],
    ['hongluan', '紅鸞'], ['guchen', '孤辰'], ['guasu', '寡宿'], ['feilian', '蜚廉'],
    ['posui', '破碎'], ['taifu', '台輔'], ['fenggao', '封誥'], ['tianwu', '天巫'],
    ['tianyue', '天月'], ['santai', '三台'], ['bazuo', '八座'], ['engguang', '恩光'],
    ['tiangui', '天貴'], ['tiancai', '天才'], ['tianshou', '天壽'], ['jiekong', '截空'],
    ['xunzhong', '旬中'], ['xunkong', '旬空'], ['kongwang', '空亡'], ['yuede', '月德'],
    ['tianshang', '天傷'], ['tianshi', '天使'], ['tianchu', '天廚'], ['changsheng', '長生'],
    ['muyu', '沐浴'], ['guandai', '冠帶'], ['linguan', '臨官'], ['diwang', '帝旺'],
    ['shuai', '衰'], ['bing', '病'], ['si', '死'], ['mu', '墓'], ['jue', '絕'], ['tai', '胎'],
    ['yang', '養'], ['boshi', '博士'], ['lishi', '力士'], ['qinglong', '青龍'],
    ['xiaohao', '小耗'], ['jiangjun', '將軍'], ['zhoushu', '奏書'], ['faylian', '飛廉'],
    ['xishen', '喜神'], ['bingfu', '病符'], ['dahao', '大耗'], ['fubing', '伏兵'],
    ['guanfu', '官府'], ['suijian', '歲建'], ['huiqi', '晦氣'], ['sangmen', '喪門'],
    ['guansuo', '貫索'], ['gwanfu', '官符'], ['longde', '龍德'], ['baihu', '白虎'],
    ['tiande', '天德'], ['diaoke', '弔客'], ['jiangxing', '將星'], ['panan', '攀鞍'],
    ['suiyi', '歲驛'], ['xiishen', '息神'], ['huagai', '華蓋'], ['jiesha', '劫煞'],
    ['zhaisha', '災煞'], ['tiansha', '天煞'], ['zhibei', '指背'], ['xianchi', '咸池'],
    ['yuesha', '月煞'], ['wangshen', '亡神'], ['yunkui', '運魁'], ['yunyue', '運鉞'],
    ['yunchang', '運昌'], ['yunqu', '運曲'], ['yunluan', '運鸞'], ['yunxi', '運喜'],
    ['yunlu', '運祿'], ['yunyang', '運羊'], ['yuntuo', '運陀'], ['yunma', '運馬'],
    ['liukui', '流魁'], ['liuyue', '流鉞'], ['liuchang', '流昌'], ['liuqu', '流曲'],
    ['liuluan', '流鸞'], ['liuxi', '流喜'], ['liulu', '流祿'], ['liuyang', '流羊'],
    ['liutuo', '流陀'], ['liuma', '流馬'], ['nianjie', '年解'], ['yuekui', '月魁'],
    ['yueyue', '月鉞'], ['yuechang', '月昌'], ['yuequ', '月曲'], ['yueluan', '月鸞'],
    ['yuexi', '月喜'], ['yuelu', '月祿'], ['yueyang', '月羊'], ['yuetuo', '月陀'],
    ['yuema', '月馬'], ['rikui', '日魁'], ['riyue', '日鉞'], ['richang', '日昌'],
    ['riqu', '日曲'], ['riluan', '日鸞'], ['rixi', '日喜'], ['rilu', '日祿'],
    ['riyang', '日羊'], ['rituo', '日陀'], ['rima', '日馬'], ['shikui', '時魁'],
    ['shiyue', '時鉞'], ['shichang', '時昌'], ['shiqu', '時曲'], ['shiluan', '時鸞'],
    ['shixi', '時喜'], ['shilu', '時祿'], ['shiyang', '時羊'], ['shituo', '時陀'],
    ['shima', '時馬']
  ].map(([id, label]) => [label, id])));

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function normalizeDateParts(value) {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value || '').trim());
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }

  function isValidGregorianDate(value) {
    const parts = normalizeDateParts(value);
    if (!parts || parts.year < 1900 || parts.year > 2099 || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return false;
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    return date.getUTCFullYear() === parts.year && date.getUTCMonth() === parts.month - 1 && date.getUTCDate() === parts.day;
  }

  function isConservativeLunarDate(value) {
    const parts = normalizeDateParts(value);
    return !!parts && parts.year >= 1900 && parts.year <= 2099 && parts.month >= 1 && parts.month <= 12 && parts.day >= 1 && parts.day <= 30;
  }

  function normalizeDateString(value) {
    const parts = normalizeDateParts(value);
    if (!parts) throw new Error('Date must use the YYYY-MM-DD format.');
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }

  function parseExactTime(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute, label: `${pad2(hour)}:${pad2(minute)}` };
  }

  function timeToIndex(value) {
    const parsed = parseExactTime(value);
    if (!parsed) throw new Error('Enter a valid birth time.');
    if (parsed.hour === 0) return 0;
    if (parsed.hour === 23) return 12;
    return Math.floor((parsed.hour + 1) / 2);
  }

  function branchIdFromSymbol(symbol) {
    const item = BRANCHES.find((branch) => branch.symbol === symbol);
    if (!item) throw new Error(`Unsupported Earthly Branch: ${symbol}`);
    return item.id;
  }

  function branchSymbolFromId(id) {
    const item = BRANCHES.find((branch) => branch.id === id);
    if (!item) throw new Error(`Unsupported Earthly Branch ID: ${id}`);
    return item.symbol;
  }

  function palaceRoleId(label) {
    const id = ROLE_BY_LABEL[label];
    if (!id) throw new Error(`Unsupported palace name: ${label}`);
    return id;
  }

  function transformationId(label) {
    return label ? (TRANSFORMATION_BY_LABEL[label] || null) : null;
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function stableStarId(label) {
    const normalized = String(label || '');
    return STAR_ID_BY_LABEL[normalized] || `unmapped-${stableHash(normalized)}`;
  }

  function normalizeInput(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Birth details are missing.');
    const calendarType = raw.calendarType === 'lunar' ? 'lunar' : 'solar';
    const gender = raw.gender === 'female' ? 'female' : 'male';
    const birthDate = normalizeDateString(raw.birthDate);

    if (calendarType === 'solar' && !isValidGregorianDate(birthDate)) {
      throw new Error('The solar date is invalid. Check the month and day.');
    }
    if (calendarType === 'lunar' && !isConservativeLunarDate(birthDate)) {
      throw new Error('The lunar date is invalid. Lunar days must be between 1 and 30.');
    }

    const isUnknownTime = raw.isUnknownTime === true;
    const parsedTime = isUnknownTime ? null : parseExactTime(raw.birthTime);
    if (!isUnknownTime && !parsedTime) throw new Error('Enter a valid birth time.');
    const iztroTimeIndex = isUnknownTime ? 6 : timeToIndex(parsedTime.label);
    const timeOption = TIME_OPTIONS[iztroTimeIndex];
    const suppliedBranch = raw.birthHourBranch ? branchIdFromSymbol(raw.birthHourBranch) : null;
    if (!isUnknownTime && suppliedBranch && suppliedBranch !== timeOption.branchId) {
      throw new Error('The birth time does not match the supplied Chinese hour branch.');
    }

    const profileName = String(raw.profileName || raw.name || '').trim().slice(0, 80) || 'Chart Owner';

    return {
      profileName,
      calendarType,
      sourceDate: birthDate,
      exactBirthTime: parsedTime ? parsedTime.label : null,
      birthHourBranch: timeOption.branchId,
      birthHourLabel: timeOption.branchLabel,
      iztroTimeIndex,
      gender,
      isLeapMonth: calendarType === 'lunar' && raw.isLeapMonth === true,
      timezone: 'Asia/Shanghai',
      timeStandard: 'beijing',
      trueSolarTimeCorrection: false,
      isUnknownTime
    };
  }

  function configureIztro(iztroLib) {
    if (!iztroLib || !iztroLib.astro || typeof iztroLib.astro.config !== 'function') {
      throw new Error('The ZWDS calculation engine did not load.');
    }
    iztroLib.astro.config({ mutagens: MUTAGEN_CONFIG });
    return iztroLib.astro;
  }

  function cloneStar(star) {
    const name = String(star && star.name || '');
    return {
      stableId: stableStarId(name),
      name,
      type: String(star && star.type || 'unknown'),
      scope: star && star.scope ? String(star.scope) : null,
      brightness: star && star.brightness ? String(star.brightness) : null,
      mutagen: transformationId(star && star.mutagen ? String(star.mutagen) : '')
    };
  }

  function cloneScope(scope, palaces) {
    if (!scope) return null;
    const palaceNames = Array.isArray(scope.palaceNames) ? scope.palaceNames : [];
    const stars = Array.isArray(scope.stars) ? scope.stars : [];
    const rolesBySlot = {};
    const starsBySlot = {};

    palaces.forEach((palace, index) => {
      const label = palaceNames[index] ? String(palaceNames[index]) : null;
      rolesBySlot[palace.slotId] = label ? { roleId: palaceRoleId(label), label } : null;
      starsBySlot[palace.slotId] = Array.isArray(stars[index]) ? stars[index].map(cloneStar) : [];
    });

    return {
      index: Number.isInteger(scope.index) ? scope.index : -1,
      name: scope.name ? String(scope.name) : '',
      heavenlyStem: scope.heavenlyStem ? String(scope.heavenlyStem) : '',
      earthlyBranch: scope.earthlyBranch ? String(scope.earthlyBranch) : '',
      nominalAge: Number.isFinite(scope.nominalAge) ? Number(scope.nominalAge) : null,
      rolesBySlot,
      mutagenStars: Array.isArray(scope.mutagen) ? scope.mutagen.map(String) : [],
      mutagenStarIds: Array.isArray(scope.mutagen) ? scope.mutagen.map(stableStarId) : [],
      starsBySlot
    };
  }

  function snapshotHoroscope(horoscope, palaces) {
    return {
      solarDate: String(horoscope.solarDate || ''),
      lunarDate: String(horoscope.lunarDate || ''),
      decadal: cloneScope(horoscope.decadal, palaces),
      age: cloneScope(horoscope.age, palaces),
      yearly: cloneScope(horoscope.yearly, palaces),
      monthly: cloneScope(horoscope.monthly, palaces),
      daily: cloneScope(horoscope.daily, palaces),
      hourly: cloneScope(horoscope.hourly, palaces)
    };
  }

  function snapshotAstrolabe(astrolabe, input) {
    if (!astrolabe || !Array.isArray(astrolabe.palaces) || astrolabe.palaces.length !== 12) {
      throw new Error('The calculation engine did not return twelve palaces.');
    }

    const palaces = astrolabe.palaces.map((palace, engineIndex) => {
      const slotId = branchIdFromSymbol(String(palace.earthlyBranch));
      return {
        engineIndex,
        slotId,
        roleId: palaceRoleId(String(palace.name)),
        label: String(palace.name),
        heavenlyStem: String(palace.heavenlyStem || ''),
        earthlyBranch: String(palace.earthlyBranch || ''),
        isBodyPalace: palace.isBodyPalace === true,
        majorStars: Array.isArray(palace.majorStars) ? palace.majorStars.map(cloneStar) : [],
        minorStars: Array.isArray(palace.minorStars) ? palace.minorStars.map(cloneStar) : [],
        adjectiveStars: Array.isArray(palace.adjectiveStars) ? palace.adjectiveStars.map(cloneStar) : [],
        auxiliaryLabels: [palace.changsheng12, palace.boshi12, palace.jiangqian12, palace.suiqian12].filter(Boolean).map(String),
        decadal: {
          range: [Number(palace.decadal.range[0]), Number(palace.decadal.range[1])],
          heavenlyStem: String(palace.decadal.heavenlyStem || ''),
          earthlyBranch: String(palace.decadal.earthlyBranch || '')
        },
        ages: Array.isArray(palace.ages) ? palace.ages.map(Number) : []
      };
    });

    const uniqueSlots = new Set(palaces.map((palace) => palace.slotId));
    if (uniqueSlots.size !== 12) throw new Error('The palace branches must contain twelve unique stable IDs.');
    BRANCHES.forEach((branch, index) => {
      if (palaces[index].slotId !== branch.id) throw new Error(`Unexpected palace order at index ${index}; expected ${branch.symbol}.`);
    });

    const rawDates = JSON.parse(JSON.stringify(astrolabe.rawDates || {}));
    const yearlyStemLabel = rawDates.chineseDate && rawDates.chineseDate.yearly ? rawDates.chineseDate.yearly[0] : '';
    return {
      engineVersion: '2.4.7',
      locale: 'zh-TW',
      input,
      genderLabel: String(astrolabe.gender || ''),
      solarDate: String(astrolabe.solarDate || ''),
      lunarDate: String(astrolabe.lunarDate || ''),
      chineseDate: String(astrolabe.chineseDate || ''),
      rawDates,
      yearHeavenlyStemId: HEAVENLY_STEM_IDS[yearlyStemLabel] || null,
      timeLabel: String(astrolabe.time || ''),
      timeRange: String(astrolabe.timeRange || ''),
      zodiacLabel: String(astrolabe.zodiac || ''),
      signLabel: String(astrolabe.sign || ''),
      lifePalaceBranch: branchIdFromSymbol(String(astrolabe.earthlyBranchOfSoulPalace)),
      bodyPalaceBranch: branchIdFromSymbol(String(astrolabe.earthlyBranchOfBodyPalace)),
      lifeMasterLabel: String(astrolabe.soul || ''),
      bodyMasterLabel: String(astrolabe.body || ''),
      bureauLabel: String(astrolabe.fiveElementsClass || ''),
      palaces
    };
  }

  function createChartSession(iztroLib, rawInput) {
    const input = normalizeInput(rawInput);
    const astro = configureIztro(iztroLib);
    const dateForEngine = input.sourceDate.replace(/-0?(\d+)-0?(\d+)$/, '-$1-$2');
    const genderLabel = input.gender === 'male' ? '男' : '女';
    let astrolabe;

    if (input.calendarType === 'lunar') {
      astrolabe = astro.byLunar(dateForEngine, input.iztroTimeIndex, genderLabel, input.isLeapMonth, true, 'zh-TW');
      const lunar = astrolabe.rawDates && astrolabe.rawDates.lunarDate;
      const parts = normalizeDateParts(input.sourceDate);
      if (!lunar || !parts || lunar.lunarYear !== parts.year || lunar.lunarMonth !== parts.month || lunar.lunarDay !== parts.day) {
        throw new Error('The lunar date is invalid or was adjusted by the engine. Choose another date.');
      }
      if (input.isLeapMonth && lunar.isLeap !== true) throw new Error('The selected lunar month is not a leap month.');
    } else {
      astrolabe = astro.bySolar(dateForEngine, input.iztroTimeIndex, genderLabel, true, 'zh-TW');
    }

    const raw = snapshotAstrolabe(astrolabe, input);

    return {
      input,
      raw,
      getHoroscope(selection) {
        const source = typeof selection === 'number' ? { year: selection } : (selection || {});
        const year = Number(source.year);
        const month = source.month == null ? 7 : Number(source.month);
        const day = source.day == null ? 1 : Number(source.day);
        const timeIndex = source.timeIndex == null ? input.iztroTimeIndex : Number(source.timeIndex);

        if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error('The selected annual year is invalid.');
        if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('The selected month is invalid.');
        if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('The selected day is invalid.');
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
          throw new Error('The selected date is invalid.');
        }
        if (!TIME_OPTIONS.some((item) => item.index === timeIndex)) throw new Error('The selected two-hour period is invalid.');

        return snapshotHoroscope(astrolabe.horoscope(`${year}-${month}-${day}`, timeIndex), raw.palaces);
      },
      getFlights(slotId) {
        const source = raw.palaces.find((palace) => palace.slotId === slotId);
        if (!source) throw new Error('The selected palace could not be found.');
        if (source.roleId === 'fortune') {
          return { sourceSlotId: slotId, sourceRoleId: source.roleId, blocked: true, destinations: [] };
        }
        const palace = astrolabe.palace(source.engineIndex);
        const destinations = palace.mutagedPlaces();
        return {
          sourceSlotId: slotId,
          sourceRoleId: source.roleId,
          blocked: false,
          destinations: destinations.map((destination, index) => ({
            transformationId: TRANSFORMATION_IDS[index],
            transformationLabel: TRANSFORMATION_LABELS[TRANSFORMATION_IDS[index]],
            slotId: raw.palaces[destination.index].slotId,
            roleId: raw.palaces[destination.index].roleId,
            roleLabel: raw.palaces[destination.index].label
          }))
        };
      }
    };
  }

  /**
   * 三方四正 — Three Directions and Four Palaces.
   * Given a physical palace slot, return the three related slots at
   * offsets +4 (first trine), +6 (opposite), and +8 (second trine)
   * in the canonical twelve Earthly Branch circular order (BRANCHES).
   * @param {string} slotId
   * @returns {[string, string, string]}
   */
  function getTrineSlots(slotId) {
    const index = BRANCHES.findIndex(function (b) { return b.id === slotId; });
    if (index < 0) throw new Error('Unknown palace slot: ' + slotId);
    return [
      BRANCHES[(index + 4) % 12].id,
      BRANCHES[(index + 6) % 12].id,
      BRANCHES[(index + 8) % 12].id
    ];
  }

  return Object.freeze({
    MUTAGEN_CONFIG,
    STAR_ID_BY_LABEL,
    HEAVENLY_STEM_IDS,
    BRANCHES,
    TIME_OPTIONS,
    PALACE_ROLE_LABELS,
    TRANSFORMATION_IDS,
    TRANSFORMATION_LABELS,
    GRID_SLOT_ORDER,
    isValidGregorianDate,
    isConservativeLunarDate,
    normalizeDateString,
    parseExactTime,
    timeToIndex,
    branchIdFromSymbol,
    branchSymbolFromId,
    palaceRoleId,
    transformationId,
    stableStarId,
    normalizeInput,
    configureIztro,
    snapshotAstrolabe,
    snapshotHoroscope,
    createChartSession,
    getTrineSlots
  });
});
