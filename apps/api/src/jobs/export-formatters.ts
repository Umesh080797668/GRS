import { LookupItem } from '../lookups/lookup.data';

export type ReportLanguage = 'en' | 'si' | 'ta';
export type ExportKind =
  | 'progress'
  | 'clients'
  | 'beneficiaries'
  | 'interests'
  | 'duplicates';
export type ExportFormat = 'xlsx' | 'csv';

export interface TrilingualText {
  en: string;
  si: string;
  ta: string;
}

const FORMULA_LEADING_PATTERN = /^[=+\-@\t\r]/;

/**
 * Invariants 8 & 9:
 * - Normalizes Unicode strings to NFC for consistent Sinhala/Tamil rendering.
 * - Prefixes any cell starting with =, +, -, @, \t, or \r with ' to neutralize spreadsheet formula injection.
 */
export function sanitizeSpreadsheetCell(value: unknown): string | number {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value instanceof Date) {
    return formatColomboTimestamp(value);
  }

  const normalized = String(value).normalize('NFC');
  if (normalized.length === 0) {
    return '';
  }
  if (FORMULA_LEADING_PATTERN.test(normalized)) {
    return `'${normalized}`;
  }
  return normalized;
}

/**
 * Formats an array of cells as an RFC-4180 CSV line after applying formula-injection protection.
 */
export function formatCsvRow(cells: Array<unknown>): string {
  const escaped = cells.map((cell) => {
    const safe = sanitizeSpreadsheetCell(cell);
    if (typeof safe === 'number') {
      return String(safe);
    }
    if (/[",\n\r]/.test(safe)) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  });
  return `${escaped.join(',')}\r\n`;
}

/**
 * Formats a timestamp in Sri Lanka time (Asia/Colombo, UTC+05:30) per Invariant 15.
 */
export function formatColomboTimestamp(value?: Date | string | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute} IST`;
}

export function normalizeReportLanguage(lang?: string | null): ReportLanguage {
  if (lang === 'si' || lang === 'ta' || lang === 'en') {
    return lang;
  }
  return 'en';
}

export function pickTrilingual(
  labels: TrilingualText,
  lang: ReportLanguage,
): string {
  return (labels[lang] || labels.en).normalize('NFC');
}

export function formatBooleanLabel(
  value: boolean | null | undefined,
  lang: ReportLanguage,
): string {
  if (value === true) {
    return pickTrilingual({ en: 'Yes', si: 'ඔව්', ta: 'ஆம்' }, lang);
  }
  return pickTrilingual({ en: 'No', si: 'නැත', ta: 'இல்லை' }, lang);
}

export function formatGenderLabel(
  gender: string | null | undefined,
  lang: ReportLanguage,
): string {
  if (gender === 'F') {
    return pickTrilingual({ en: 'Female', si: 'ස්ත්‍රී', ta: 'பெண்' }, lang);
  }
  if (gender === 'M') {
    return pickTrilingual({ en: 'Male', si: 'පුරුෂ', ta: 'ஆண்' }, lang);
  }
  return gender || '';
}

export function formatInfoProvidedByLabel(
  value: string | null | undefined,
  lang: ReportLanguage,
): string {
  const map: Record<string, TrilingualText> = {
    self: { en: 'Self', si: 'තමාම', ta: 'தானே' },
    mother: { en: 'Mother', si: 'මව', ta: 'தாய்' },
    father: { en: 'Father', si: 'පියා', ta: 'தந்தை' },
    sister: { en: 'Sister', si: 'සහෝදරිය', ta: 'சகோதரி' },
    other: {
      en: 'Other (specify)',
      si: 'වෙනත් (සඳහන් කරන්න)',
      ta: 'ஏனையோர் (குறிப்பிடவும்)',
    },
  };
  if (!value) return '';
  return map[value] ? pickTrilingual(map[value], lang) : value;
}

export function formatDuplicateStatusLabel(
  status: string | null | undefined,
  lang: ReportLanguage,
): string {
  const map: Record<string, TrilingualText> = {
    open: { en: 'Open', si: 'විවෘත', ta: 'திறந்த' },
    confirmed: { en: 'Confirmed', si: 'තහවුරු කළ', ta: 'உறுதிப்படுத்தப்பட்ட' },
    dismissed: { en: 'Dismissed', si: 'ඉවත් කළ', ta: 'தள்ளுபடி' },
  };
  if (!status) return '';
  return map[status] ? pickTrilingual(map[status], lang) : status;
}

export function formatDuplicateTierLabel(
  score: number,
  lang: ReportLanguage,
): string {
  if (score >= 90) {
    return pickTrilingual(
      { en: 'Probable Duplicate', si: 'බොහෝ විට අනුපිටපත්', ta: 'அதிக சாத்தியமான நகல்' },
      lang,
    );
  }
  return pickTrilingual(
    { en: 'Possible Duplicate', si: 'හැකි අනුපිටපත්', ta: 'சாத்தியமான நகல்' },
    lang,
  );
}

export function formatScopeLevelLabel(
  scopeLevel: string,
  lang: ReportLanguage,
): string {
  const map: Record<string, TrilingualText> = {
    national: { en: 'National', si: 'ජාතික', ta: 'தேசிய' },
    district: { en: 'District', si: 'දිස්ත්‍රික්කය', ta: 'மாவட்டம்' },
    ds: {
      en: 'Divisional Secretariat',
      si: 'ප්‍රාදේශීය ලේකම් කොට්ඨාසය',
      ta: 'பிரதேச செயலகம்',
    },
    gn: {
      en: 'GN Division',
      si: 'ග්‍රාම නිලධාරී වසම',
      ta: 'கிராம சேவகர் பிரிவு',
    },
    team: { en: 'Team', si: 'කණ්ඩායම', ta: 'குழு' },
  };
  return map[scopeLevel] ? pickTrilingual(map[scopeLevel], lang) : scopeLevel;
}

export function formatInterestCategoryLabel(
  category: string,
  lang: ReportLanguage,
): string {
  const map: Record<string, TrilingualText> = {
    interested_vocational_stream: {
      en: 'Interested Vocational Stream',
      si: 'උනන්දුවක් දක්වන වෘත්තීය අංශය',
      ta: 'ஆர்வமுள்ள தொழிற்பயிற்சி துறை',
    },
    interested_job: {
      en: 'Interested Job',
      si: 'උනන්දුවක් දක්වන රැකියාව',
      ta: 'ஆர்வமுள்ள வேலை',
    },
    future_hopes: {
      en: 'Future Hopes',
      si: 'අනාගත අපේක්ෂා',
      ta: 'எதிர்கால நம்பிக்கைகள்',
    },
    highest_education: {
      en: 'Highest Education',
      si: 'ඉහළම අධ්‍යාපන සුදුසුකම',
      ta: 'உயர்ந்த கல்வித் தகுதி',
    },
    highest_vocational: {
      en: 'Highest Vocational Qualification',
      si: 'ඉහළම වෘත්තීය සුදුසුකම',
      ta: 'உயர்ந்த தொழிற்பயிற்சித் தகுதி',
    },
  };
  return map[category] ? pickTrilingual(map[category], lang) : category;
}

/**
 * Resolves lookup translations by category -> code -> TrilingualText.
 */
export type LookupTranslationMap = Map<string, Map<string, TrilingualText>>;

export function buildLookupTranslationMap(
  items: LookupItem[],
): LookupTranslationMap {
  const map: LookupTranslationMap = new Map();
  for (const item of items) {
    if (!map.has(item.category)) {
      map.set(item.category, new Map());
    }
    map.get(item.category)!.set(item.code, {
      en: item.labelEn,
      si: item.labelSi,
      ta: item.labelTa,
    });
  }
  return map;
}

export function translateLookupCode(
  map: LookupTranslationMap,
  category: string,
  code: string | null | undefined,
  lang: ReportLanguage,
): string {
  if (!code) return '';
  const entry = map.get(category)?.get(code);
  if (entry) {
    return pickTrilingual(entry, lang);
  }
  // Fallback across canonical categories with matching code (e.g. 'vocational_stream' vs field name)
  return code.normalize('NFC');
}

export function translateLookupCodes(
  map: LookupTranslationMap,
  category: string,
  codes: string[] | null | undefined,
  lang: ReportLanguage,
): string {
  if (!codes || codes.length === 0) return '';
  return codes
    .map((code) => translateLookupCode(map, category, code, lang))
    .filter((v) => v.length > 0)
    .join(', ');
}

/**
 * Ordered column specification for all 47 traceable §7 fields in R2 (`clients`).
 */
export const R2_CLIENT_COLUMN_KEYS = [
  'district_name',
  'ds_name',
  'sdo_name',
  'gn_number',
  'gn_name',
  'secretary_name',
  'secretary_contact',
  'secretary_email',
  'serial_no',
  'house_no',
  'house_leader_name',
  'address',
  'village_name',
  'is_epf',
  'is_etf',
  'is_aswesuma',
  'is_samurdhi',
  'has_special_needs',
  'target_female',
  'target_male',
  'age_group_min',
  'age_group_max',
  'lang_sinhala',
  'lang_tamil',
  'lang_english',
  'team_no',
  'client_name',
  'client_age',
  'client_gender',
  'client_address',
  'phone_raw',
  'phone_e164',
  'whatsapp_raw',
  'whatsapp_e164',
  'highest_education',
  'highest_vocational',
  'interested_vocational_stream',
  'interested_job',
  'client_is_epf',
  'client_is_etf',
  'client_is_aswesuma',
  'client_is_samurdhi',
  'client_has_special_needs',
  'future_hopes',
  'info_provided_by',
  'info_provided_by_other',
  'consent_given',
] as const;

export const R2_COLUMN_HEADERS_I18N: Record<string, TrilingualText> = {
  district_name: {
    en: 'District',
    si: 'දිස්ත්‍රික්කය',
    ta: 'மாவட்டம்',
  },
  ds_name: {
    en: 'Divisional Secretariat',
    si: 'ප්‍රාදේශීය ලේකම් කොට්ඨාසය',
    ta: 'பிரதேச செயலகம்',
  },
  sdo_name: {
    en: 'SDO Officer Name',
    si: 'කුසලතා සංවර්ධන නිලධාරි නම',
    ta: 'SDO அதிகாரி பெயர்',
  },
  gn_number: {
    en: 'GN Division Number',
    si: 'ග්‍රාම නිලධාරී වසම් අංකය',
    ta: 'கிராம சேவகர் பிரிவு எண்',
  },
  gn_name: {
    en: 'GN Division Name',
    si: 'ග්‍රාම නිලධාරී වසමේ නම',
    ta: 'கிராம சேவகர் பிரிவு பெயர்',
  },
  secretary_name: {
    en: 'CDC Secretary Name',
    si: 'CDC ලේකම් නම',
    ta: 'CDC செயலாளர் பெயர்',
  },
  secretary_contact: {
    en: 'CDC Secretary Contact',
    si: 'CDC ලේකම් දුරකථන',
    ta: 'CDC செயலாளர் தொடர்பு',
  },
  secretary_email: {
    en: 'CDC Secretary Email',
    si: 'CDC ලේකම් විද්‍යුත් තැපෑල',
    ta: 'CDC செயலாளர் மின்னஞ்சல்',
  },
  serial_no: {
    en: 'Serial Number',
    si: 'අනුක්‍රමික අංකය',
    ta: 'வரிசை எண்',
  },
  house_no: {
    en: 'House Number',
    si: 'නිවාස අංකය',
    ta: 'வீட்டு எண்',
  },
  house_leader_name: {
    en: 'House Leader Name',
    si: 'ගෘහ මූලික නම',
    ta: 'வீட்டுத் தலைவர் பெயர்',
  },
  address: {
    en: 'Household Address',
    si: 'නිවසේ ලිපිනය',
    ta: 'வீட்டு முகவரி',
  },
  village_name: {
    en: 'Village Name',
    si: 'ගමේ නම',
    ta: 'கிராமத்தின் பெயர்',
  },
  is_epf: {
    en: 'Household EPF Beneficiary',
    si: 'නිවස EPF ප්‍රතිලාභී',
    ta: 'வீடு EPF பயனாளி',
  },
  is_etf: {
    en: 'Household ETF Beneficiary',
    si: 'නිවස ETF ප්‍රතිලාභී',
    ta: 'வீடு ETF பயனாளி',
  },
  is_aswesuma: {
    en: 'Household Aswesuma Beneficiary',
    si: 'නිවස අස්වැසුම ප්‍රතිලාභී',
    ta: 'வீடு அஸ்வெசும பயனாளி',
  },
  is_samurdhi: {
    en: 'Household Samurdhi Beneficiary',
    si: 'නිවස සමෘද්ධි ප්‍රතිලාභී',
    ta: 'வீடு சமுர்த்தி பயனாளி',
  },
  has_special_needs: {
    en: 'Household Special Needs',
    si: 'නිවසේ විශේෂ අවශ්‍යතා',
    ta: 'வீடு சிறப்பு தேவைகள்',
  },
  target_female: {
    en: 'Target Female Count',
    si: 'ඉලක්ක ස්ත්‍රී ගණන',
    ta: 'இலக்கு பெண் எண்ணிக்கை',
  },
  target_male: {
    en: 'Target Male Count',
    si: 'ඉලක්ක පුරුෂ ගණන',
    ta: 'இலக்கு ஆண் எண்ணிக்கை',
  },
  age_group_min: {
    en: 'Age Group Min',
    si: 'අවම වයස් කාණ්ඩය',
    ta: 'குறைந்த வயது பிரிவு',
  },
  age_group_max: {
    en: 'Age Group Max',
    si: 'උපරිම වයස් කාණ්ඩය',
    ta: 'அதிகபட்ச வயது பிரிவு',
  },
  lang_sinhala: {
    en: 'Language Sinhala',
    si: 'සිංහල භාෂාව',
    ta: 'சிங்கள மொழி',
  },
  lang_tamil: {
    en: 'Language Tamil',
    si: 'දෙමළ භාෂාව',
    ta: 'தமிழ் மொழி',
  },
  lang_english: {
    en: 'Language English',
    si: 'ඉංග්‍රීසි භාෂාව',
    ta: 'ஆங்கில மொழி',
  },
  team_no: {
    en: 'Assigned Team',
    si: 'පවරන ලද කණ්ඩායම',
    ta: 'ஒதுக்கப்பட்ட குழு',
  },
  client_name: {
    en: 'Client Name',
    si: 'සාමාජිකයාගේ නම',
    ta: 'பயனாளியின் பெயர்',
  },
  client_age: {
    en: 'Client Age',
    si: 'වයස',
    ta: 'வயது',
  },
  client_gender: {
    en: 'Gender',
    si: 'ස්ත්‍රී / පුරුෂ භාවය',
    ta: 'பாலினம்',
  },
  client_address: {
    en: 'Client Address',
    si: 'සාමාජික ලිපිනය',
    ta: 'பயனாளி முகவரி',
  },
  phone_raw: {
    en: 'Phone (Raw)',
    si: 'දුරකථන අංකය (ඇතුළත් කළ)',
    ta: 'தொலைபேசி எண் (அசல்)',
  },
  phone_e164: {
    en: 'Phone (E.164)',
    si: 'දුරකථන අංකය (E.164)',
    ta: 'தொலைபேசி எண் (E.164)',
  },
  whatsapp_raw: {
    en: 'WhatsApp (Raw)',
    si: 'WhatsApp අංකය (ඇතුළත් කළ)',
    ta: 'WhatsApp எண் (அசல்)',
  },
  whatsapp_e164: {
    en: 'WhatsApp (E.164)',
    si: 'WhatsApp අංකය (E.164)',
    ta: 'WhatsApp எண் (E.164)',
  },
  highest_education: {
    en: 'Highest Education',
    si: 'ඉහළම අධ්‍යාපන සුදුසුකම',
    ta: 'உயர்ந்த கல்வித் தகுதி',
  },
  highest_vocational: {
    en: 'Highest Vocational Qualification',
    si: 'ඉහළම වෘත්තීය සුදුසුකම',
    ta: 'உயர்ந்த தொழிற்பயிற்சித் தகுதி',
  },
  interested_vocational_stream: {
    en: 'Interested Vocational Stream',
    si: 'උනන්දුවක් දක්වන වෘත්තීය අංශය',
    ta: 'ஆர்வமுள்ள தொழிற்பயிற்சி துறை',
  },
  interested_job: {
    en: 'Interested Job',
    si: 'උනන්දුවක් දක්වන රැකියාව',
    ta: 'ஆர்வமுள்ள வேலை',
  },
  client_is_epf: {
    en: 'Client EPF',
    si: 'සාමාජික EPF',
    ta: 'பயனாளி EPF',
  },
  client_is_etf: {
    en: 'Client ETF',
    si: 'සාමාජික ETF',
    ta: 'பயனாளி ETF',
  },
  client_is_aswesuma: {
    en: 'Client Aswesuma',
    si: 'සාමාජික අස්වැසුම',
    ta: 'பயனாளி அஸ்வெசும',
  },
  client_is_samurdhi: {
    en: 'Client Samurdhi',
    si: 'සාමාජික සමෘද්ධි',
    ta: 'பயனாளி சமுர்த்தி',
  },
  client_has_special_needs: {
    en: 'Client Special Needs',
    si: 'සාමාජික විශේෂ අවශ්‍යතා',
    ta: 'பயனாளி சிறப்பு தேவைகள்',
  },
  future_hopes: {
    en: 'Future Hopes',
    si: 'අනාගත අපේක්ෂා',
    ta: 'எதிர்கால நம்பிக்கைகள்',
  },
  info_provided_by: {
    en: 'Information Provided By',
    si: 'තොරතුරු ලබා දුන් අය',
    ta: 'தகவல் வழங்கியவர்',
  },
  info_provided_by_other: {
    en: 'Information Provided By (Other)',
    si: 'තොරතුරු ලබා දුන් (වෙනත්)',
    ta: 'தகவல் வழங்கியவர் (மற்றவை)',
  },
  consent_given: {
    en: 'Consent Given',
    si: 'එකඟතාව ලබා දී ඇත',
    ta: 'சம்மதம் வழங்கப்பட்டது',
  },
};

export const REPORT_COLUMN_HEADERS_I18N: Record<
  'progress' | 'beneficiaries' | 'interests' | 'duplicates',
  Array<{ key: string; labels: TrilingualText; width: number }>
> = {
  progress: [
    {
      key: 'scope_level',
      labels: { en: 'Scope Level', si: 'මට්ටම', ta: 'நிலை' },
      width: 18,
    },
    {
      key: 'area_name',
      labels: { en: 'Area Name', si: 'ප්‍රදේශයේ නම', ta: 'பகுதியின் பெயர்' },
      width: 28,
    },
    {
      key: 'gn_number',
      labels: { en: 'GN Number', si: 'වසම් අංකය', ta: 'பிரிவு எண்' },
      width: 14,
    },
    {
      key: 'team_no',
      labels: { en: 'Team No', si: 'කණ්ඩායම් අංකය', ta: 'குழு எண்' },
      width: 14,
    },
    {
      key: 'houses_assigned',
      labels: { en: 'Houses Assigned', si: 'පවරන ලද නිවාස', ta: 'ஒதுக்கப்பட்ட வீடுகள்' },
      width: 16,
    },
    {
      key: 'houses_started',
      labels: { en: 'Houses Started', si: 'ආරම්භ කළ නිවාස', ta: 'தொடங்கிய வீடுகள்' },
      width: 16,
    },
    {
      key: 'houses_done',
      labels: { en: 'Houses Done', si: 'අවසන් කළ නිවාස', ta: 'முடிந்த வீடுகள்' },
      width: 16,
    },
    {
      key: 'completion_rate',
      labels: { en: 'Completion Rate (%)', si: 'සම්පූර්ණ ප්‍රතිශතය (%)', ta: 'முடிவு விகிதம் (%)' },
      width: 18,
    },
    {
      key: 'clients_count',
      labels: { en: 'Clients Collected', si: 'රැස් කළ සාමාජිකයන්', ta: 'சேகரிக்கப்பட்ட பயனாளிகள்' },
      width: 18,
    },
    {
      key: 'epf_count',
      labels: { en: 'EPF Count', si: 'EPF ගණන', ta: 'EPF எண்ணிக்கை' },
      width: 14,
    },
    {
      key: 'etf_count',
      labels: { en: 'ETF Count', si: 'ETF ගණන', ta: 'ETF எண்ணிக்கை' },
      width: 14,
    },
    {
      key: 'aswesuma_count',
      labels: { en: 'Aswesuma Count', si: 'අස්වැසුම ගණන', ta: 'அஸ்வெசும எண்ணிக்கை' },
      width: 16,
    },
    {
      key: 'samurdhi_count',
      labels: { en: 'Samurdhi Count', si: 'සමෘද්ධි ගණන', ta: 'சமுர்த்தி எண்ணிக்கை' },
      width: 16,
    },
    {
      key: 'special_needs_count',
      labels: { en: 'Special Needs Count', si: 'විශේෂ අවශ්‍යතා ගණන', ta: 'சிறப்பு தேவைகள் எண்ணிக்கை' },
      width: 18,
    },
    {
      key: 'refreshed_at',
      labels: { en: 'Refreshed At (IST)', si: 'යාවත්කාලීන කළ වේලාව', ta: 'புதுப்பிக்கப்பட்ட நேரம்' },
      width: 22,
    },
  ],
  beneficiaries: [
    {
      key: 'scope_level',
      labels: { en: 'Area Level', si: 'මට්ටම', ta: 'பகுதி நிலை' },
      width: 18,
    },
    {
      key: 'area_code',
      labels: { en: 'Area Code / No', si: 'කේතය / අංකය', ta: 'குறியீடு / எண்' },
      width: 16,
    },
    {
      key: 'area_name',
      labels: { en: 'Area Name', si: 'ප්‍රදේශයේ නම', ta: 'பகுதியின் பெயர்' },
      width: 28,
    },
    {
      key: 'houses_assigned',
      labels: { en: 'Houses Assigned', si: 'පවරන ලද නිවාස', ta: 'ஒதுக்கப்பட்ட வீடுகள்' },
      width: 16,
    },
    {
      key: 'clients_count',
      labels: { en: 'Clients Collected', si: 'මුළු සාමාජිකයන්', ta: 'மொத்த பயனாளிகள்' },
      width: 18,
    },
    {
      key: 'epf_count',
      labels: { en: 'EPF Beneficiaries', si: 'EPF ප්‍රතිලාභීන්', ta: 'EPF பயனாளிகள்' },
      width: 18,
    },
    {
      key: 'etf_count',
      labels: { en: 'ETF Beneficiaries', si: 'ETF ප්‍රතිලාභීන්', ta: 'ETF பயனாளிகள்' },
      width: 18,
    },
    {
      key: 'aswesuma_count',
      labels: { en: 'Aswesuma Beneficiaries', si: 'අස්වැසුම ප්‍රතිලාභීන්', ta: 'அஸ்வெசும பயனாளிகள்' },
      width: 20,
    },
    {
      key: 'samurdhi_count',
      labels: { en: 'Samurdhi Beneficiaries', si: 'සමෘද්ධි ප්‍රතිලාභීන්', ta: 'சமுர்த்தி பயனாளிகள்' },
      width: 20,
    },
    {
      key: 'special_needs_count',
      labels: { en: 'Special Needs', si: 'විශේෂ අවශ්‍යතා', ta: 'சிறப்பு தேவைகள்' },
      width: 18,
    },
    {
      key: 'refreshed_at',
      labels: { en: 'Refreshed At (IST)', si: 'යාවත්කාලීන කළ වේලාව', ta: 'புதுப்பிக்கப்பட்ட நேரம்' },
      width: 22,
    },
  ],
  interests: [
    {
      key: 'category',
      labels: { en: 'Category', si: 'ප්‍රවර්ගය', ta: 'வகை' },
      width: 28,
    },
    {
      key: 'code',
      labels: { en: 'Code', si: 'කේතය', ta: 'குறியீடு' },
      width: 22,
    },
    {
      key: 'label',
      labels: { en: 'Label', si: 'නාමය', ta: 'பெயர்' },
      width: 34,
    },
    {
      key: 'clients_count',
      labels: { en: 'Clients Count', si: 'සාමාජික ගණන', ta: 'பயனாளிகள் எண்ணிக்கை' },
      width: 18,
    },
    {
      key: 'share_percent',
      labels: { en: 'Share (%)', si: 'ප්‍රතිශතය (%)', ta: 'பங்கு (%)' },
      width: 16,
    },
  ],
  duplicates: [
    {
      key: 'candidate_id',
      labels: { en: 'Candidate ID', si: 'අපේක්ෂක අංකය', ta: 'வேட்பாளர் ID' },
      width: 38,
    },
    {
      key: 'score',
      labels: { en: 'Match Score', si: 'ගැලපුම් ලකුණු', ta: 'பொருத்த மதிப்பெண்' },
      width: 14,
    },
    {
      key: 'classification',
      labels: { en: 'Match Tier', si: 'ගැලපුම් මට්ටම', ta: 'பொருத்த நிலை' },
      width: 20,
    },
    {
      key: 'status',
      labels: { en: 'Status', si: 'තත්ත්වය', ta: 'நிலை' },
      width: 16,
    },
    {
      key: 'reasons',
      labels: { en: 'Match Signals', si: 'ගැලපුම් සංඥා', ta: 'பொருத்த சமிக்ஞைகள்' },
      width: 32,
    },
    {
      key: 'client_a_id',
      labels: { en: 'Client A ID', si: 'සාමාජික A අංකය', ta: 'பயனாளி A ID' },
      width: 38,
    },
    {
      key: 'client_a_name',
      labels: { en: 'Client A Name', si: 'සාමාජික A නම', ta: 'பயனாளி A பெயர்' },
      width: 26,
    },
    {
      key: 'client_a_age',
      labels: { en: 'Client A Age', si: 'සාමාජික A වයස', ta: 'பயனாளி A வயது' },
      width: 14,
    },
    {
      key: 'client_a_gender',
      labels: { en: 'Client A Gender', si: 'සාමාජික A ස්ත්‍රී/පුරුෂ', ta: 'பயனாளி A பாலினம்' },
      width: 16,
    },
    {
      key: 'client_a_phone',
      labels: { en: 'Client A Phone', si: 'සාමාජික A දුරකථන', ta: 'பயனாளி A தொலைபேசி' },
      width: 20,
    },
    {
      key: 'client_a_gn',
      labels: { en: 'Client A GN Division', si: 'සාමාජික A වසම', ta: 'பயனாளி A பிரிவு' },
      width: 24,
    },
    {
      key: 'client_a_house_no',
      labels: { en: 'Client A House No', si: 'සාමාජික A නිවාස අංකය', ta: 'பயனாளி A வீட்டு எண்' },
      width: 16,
    },
    {
      key: 'client_b_id',
      labels: { en: 'Client B ID', si: 'සාමාජික B අංකය', ta: 'பயனாளி B ID' },
      width: 38,
    },
    {
      key: 'client_b_name',
      labels: { en: 'Client B Name', si: 'සාමාජික B නම', ta: 'பயனாளி B பெயர்' },
      width: 26,
    },
    {
      key: 'client_b_age',
      labels: { en: 'Client B Age', si: 'සාමාජික B වයස', ta: 'பயனாளி B வயது' },
      width: 14,
    },
    {
      key: 'client_b_gender',
      labels: { en: 'Client B Gender', si: 'සාමාජික B ස්ත්‍රී/පුරුෂ', ta: 'பயனாளி B பாலினம்' },
      width: 16,
    },
    {
      key: 'client_b_phone',
      labels: { en: 'Client B Phone', si: 'සාමාජික B දුරකථන', ta: 'பயனாளி B தொலைபேசி' },
      width: 20,
    },
    {
      key: 'client_b_gn',
      labels: { en: 'Client B GN Division', si: 'සාමාජික B වසම', ta: 'பயனாளி B பிரிவு' },
      width: 24,
    },
    {
      key: 'client_b_house_no',
      labels: { en: 'Client B House No', si: 'සාමාජික B නිවාස අංකය', ta: 'பயனாளி B வீட்டு எண்' },
      width: 16,
    },
    {
      key: 'reviewed_by',
      labels: { en: 'Reviewed By', si: 'සමාලෝචනය කළ අය', ta: 'மதிப்பாய்வு செய்தவர்' },
      width: 18,
    },
    {
      key: 'reviewed_at',
      labels: { en: 'Reviewed At (IST)', si: 'සමාලෝචනය කළ වේලාව', ta: 'மதிப்பாய்வு நேரம்' },
      width: 22,
    },
    {
      key: 'created_at',
      labels: { en: 'Flagged At (IST)', si: 'සටහන් කළ වේලාව', ta: 'பதிவு செய்யப்பட்ட நேரம்' },
      width: 22,
    },
  ],
};

export const SHEET_TITLES_I18N: Record<ExportKind, TrilingualText> = {
  progress: {
    en: 'Progress Report',
    si: 'ප්‍රගති වාර්තාව',
    ta: 'முன்னேற்ற அறிக்கை',
  },
  beneficiaries: {
    en: 'Beneficiary Summary',
    si: 'ප්‍රතිලාභී සාරාංශය',
    ta: 'பயனாளிகள் சுருக்கம்',
  },
  interests: {
    en: 'Interests Summary',
    si: 'උනන්දු සාරාංශය',
    ta: 'ஆர்வங்கள் சுருக்கம்',
  },
  clients: {
    en: 'Client Register',
    si: 'සාමාජික ලේඛනය',
    ta: 'பயனாளி பதிவேடு',
  },
  duplicates: {
    en: 'Duplicate Review List',
    si: 'අනුපිටපත් සමාලෝචන ලැයිස්තුව',
    ta: 'நகல் மதிப்பாய்வு பட்டியல்',
  },
};
