type ZwdsCalendarType = 'solar' | 'lunar';
type ZwdsGenderId = 'male' | 'female';
type ZwdsPolarityId = 'yin' | 'yang';
type ZwdsBranchId = 'zi' | 'chou' | 'yin' | 'mao' | 'chen' | 'si' | 'wu' | 'wei' | 'shen' | 'you' | 'xu' | 'hai';
type ZwdsPalaceRoleId = 'life' | 'siblings' | 'spouse' | 'children' | 'wealth' | 'health' | 'travel' | 'friends' | 'career' | 'property' | 'fortune' | 'parents';
type ZwdsTransformationId = 'lu' | 'quan' | 'ke' | 'ji';

interface ZwdsNormalizedBirthInput {
  profileName: string;
  calendarType: ZwdsCalendarType;
  sourceDate: string;
  exactBirthTime: string | null;
  birthHourBranch: ZwdsBranchId;
  birthHourLabel: string;
  iztroTimeIndex: number;
  gender: ZwdsGenderId;
  isLeapMonth: boolean;
  timezone: 'Asia/Shanghai';
  timeStandard: 'beijing';
  trueSolarTimeCorrection: false;
  isUnknownTime: boolean;
}

interface ZwdsTimeSelectionState {
  activeDecadeId: string | null;
  selectedYear: number | null;
}

interface ZwdsDecadeOption {
  id: string;
  slotId: ZwdsBranchId;
  roleId: ZwdsPalaceRoleId;
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
  heavenlyStem: string;
  earthlyBranch: string;
  selected?: boolean;
}

interface ZwdsStarView {
  id: string;
  engineStarId: string;
  label: string;
  category: 'major' | 'minor' | 'adjective' | 'transient';
  engineType: string;
  brightness: string | null;
  natalTransformation: ZwdsTransformationId | null;
  decadalTransformation: ZwdsTransformationId | null;
  yearlyTransformation: ZwdsTransformationId | null;
  scopeTransformation: ZwdsTransformationId | null;
  scope: string | null;
}

interface ZwdsChartViewModel {
  schemaVersion: 1;
  locale: 'zh-TW';
  input: ZwdsNormalizedBirthInput;
  identity: {
    name: string;
    polarity: ZwdsPolarityId;
    gender: ZwdsGenderId;
    yinYangGenderLabel: string;
  };
  dates: {
    solarDateTimeLabel: string;
    lunarDateTimeLabel: string;
    pillars: string[];
  };
  core: {
    bureauLabel: string;
    lifeMasterLabel: string;
    bodyMasterLabel: string;
    zodiacLabel: string;
    ziDouLabel: null;
    decadeStartDetailLabel: null;
  };
  transformationLegend: Record<ZwdsTransformationId, string>;
  palaces: unknown[];
  palacesBySlot: Record<ZwdsBranchId, unknown>;
  decadeOptions: ZwdsDecadeOption[];
  annualOptions: unknown[];
  selection: {
    scope: 'natal' | 'decadal' | 'yearly' | 'monthly' | 'daily' | 'hourly';
    decadeId: string | null;
    year: number | null;
    month: number | null;
    day: number | null;
    timeIndex: number | null;
    nominalAge: number | null;
    decadeStemBranch: string;
    yearStemBranch: string;
    monthStemBranch: string;
    dayStemBranch: string;
    hourStemBranch: string;
    decadeStartYear: number | null;
    decadeEndYear: number | null;
    decadeStartAge: number | null;
    decadeEndAge: number | null;
  };
  warnings: string[];
  supportedMode: '三合';
}

interface Window {
  iztro: unknown;
  ZwdsEngineAdapter: Record<string, unknown>;
  ZwdsViewModel: Record<string, unknown>;
  ZwdsTimeState: Record<string, unknown>;
  ZwdsApp: Record<string, unknown>;
}
