import { GrsValidators } from '../common/validators/grs-validators';

export type DuplicateClassification = 'probable' | 'possible' | 'ignore';

export interface DuplicateScoringInput {
  id?: string;
  name: string;
  nameNorm?: string | null;
  age?: number | null;
  gender?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  householdId?: string | null;
  gnId?: string | null;
}

export interface DuplicateReasons {
  factors: string[];
  nameSimilarity: number;
  phoneMatch: boolean;
  sameHousehold: boolean;
  sameGn: boolean;
  ageDiff: number | null;
  genderMismatch: boolean;
  antiFalsePositiveCapped?: boolean;
}

export interface DuplicateScoreResult {
  score: number;
  classification: DuplicateClassification;
  reasons: DuplicateReasons;
}

export const DUPLICATE_THRESHOLDS = {
  probable: 70,
  possible: 45,
} as const;

const HONORIFICS_REGEX = /\b(mr|mrs|miss|ms|rev|dr|prof|ven)\b\.?/gi;
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/gu;
const PUNCTUATION_SYMBOLS_REGEX = /[\p{P}\p{S}]/gu;

const SINHALA_INITIAL_NAMES = new Set([
  'ඒ',
  'බී',
  'සී',
  'ඩී',
  'ඊ',
  'එෆ්',
  'ජී',
  'එච්',
  'අයි',
  'ජේ',
  'කේ',
  'එල්',
  'එම්',
  'එන්',
  'ඕ',
  'පී',
  'කියු',
  'ආර්',
  'එස්',
  'ටී',
  'යූ',
  'වී',
  'ඩබ්ලිව්',
  'එක්ස්',
  'වයි',
  'ඉසෙඩ්',
]);

/**
 * Normalizes a person's name into a canonical comparison key per M6.1:
 * - Unicode NFC normalization
 * - Lowercase
 * - Strips zero-width joiners/spaces WITHOUT splitting conjunct characters
 * - Strips honorific prefixes
 * - Replaces punctuation/symbols with spaces and sorts tokens alphabetically
 */
export function normalizeDuplicateName(name?: string | null): string {
  if (!name) return '';
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(ZERO_WIDTH_REGEX, '')
    .replace(HONORIFICS_REGEX, '')
    .replace(PUNCTUATION_SYMBOLS_REGEX, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Normalizes phone or WhatsApp numbers into a comparable E.164 string.
 * Reuses GrsValidators and falls back gracefully for local/variant inputs.
 */
export function normalizePhoneForDuplicate(raw?: string | null): string | null {
  if (!raw || raw.trim().length === 0) return null;
  const waRes = GrsValidators.normalizeWhatsApp(raw);
  if (waRes.isValid && waRes.value) {
    return waRes.value;
  }
  const clean = raw.replace(/[\s\-()]/g, '');
  if (!clean) return null;
  if (clean.startsWith('00')) return '+' + clean.slice(2);
  if (/^0\d{9}$/.test(clean)) return '+94' + clean.slice(1);
  if (/^94\d{9}$/.test(clean)) return '+' + clean;
  return clean;
}

function foldRomanToken(token: string): string {
  if (!/^[a-z]+$/.test(token)) return token;
  return token
    .replace(/(th|dh|bh|ph|kh|sh|ch|gh)/g, (m) => (m === 'ch' ? 'c' : m[0]))
    .replace(/([a-z])\1+/g, '$1');
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}

function isInitialToken(token: string): boolean {
  if (token.length <= 1) return true;
  if (SINHALA_INITIAL_NAMES.has(token)) return true;
  if (/^[\u0B80-\u0BFF][\u0BBE-\u0BCD\u0BD7]?$/u.test(token)) return true;
  if (/^[\u0D80-\u0DFF][\u0DCA-\u0DDF]?$/u.test(token)) return true;
  return false;
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 && b.startsWith(a)) return 0.85;
  if (b.length === 1 && a.startsWith(b)) return 0.85;

  const raw = levenshteinSimilarity(a, b);
  const foldedA = foldRomanToken(a);
  const foldedB = foldRomanToken(b);
  const folded =
    foldedA === foldedB ? 0.94 : levenshteinSimilarity(foldedA, foldedB) * 0.94;
  return Math.max(raw, folded);
}

/**
 * Computes token-aligned hybrid similarity in [0, 1] across Latin, Sinhala, and Tamil scripts.
 * Prevents shared surnames from inflating score when given names clearly differ, while supporting
 * initials and Sri Lankan Romanized spelling variations.
 */
export function nameSimilarity(rawA: string, rawB: string): number {
  const normA = normalizeDuplicateName(rawA);
  const normB = normalizeDuplicateName(rawB);
  return nameSimilarityNormalized(normA, normB);
}

export function nameSimilarityNormalized(normA: string, normB: string): number {
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const tokensA = normA.split(' ').filter(Boolean);
  const tokensB = normB.split(' ').filter(Boolean);
  if (!tokensA.length || !tokensB.length) return 0;

  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];

  const used = new Array<boolean>(longer.length).fill(false);
  const scores: number[] = [];

  for (const st of shorter) {
    let best = 0;
    let bestIdx = -1;
    for (let j = 0; j < longer.length; j++) {
      if (used[j]) continue;
      const sim = tokenSimilarity(st, longer[j]);
      if (sim > best) {
        best = sim;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0) {
      used[bestIdx] = true;
    }
    scores.push(best);
  }

  const unmatched = longer.filter((_, idx) => !used[idx]);
  const extraAreInitials =
    unmatched.length > 0 && unmatched.every(isInitialToken);

  if (unmatched.length > 0 && !extraAreInitials) {
    for (let i = 0; i < unmatched.length; i++) {
      scores.push(0);
    }
  }

  const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const minTok = Math.min(...scores);

  // If any non-initial token clearly disagrees, do not classify as strong name match.
  if (minTok < 0.7) {
    return Math.min(0.69, avg * 0.6 + minTok * 0.4);
  }

  return extraAreInitials ? avg * 0.92 : avg;
}

export function classifyDuplicateScore(score: number): DuplicateClassification {
  if (score >= DUPLICATE_THRESHOLDS.probable) return 'probable';
  if (score >= DUPLICATE_THRESHOLDS.possible) return 'possible';
  return 'ignore';
}

/**
 * Deterministic scoring function aligned with Build Plan §9 and docs/test-vectors/duplicates.json.
 */
export function scoreDuplicatePair(
  a: DuplicateScoringInput,
  b: DuplicateScoringInput,
): DuplicateScoreResult {
  const normA = a.nameNorm || normalizeDuplicateName(a.name);
  const normB = b.nameNorm || normalizeDuplicateName(b.name);
  const sim = nameSimilarityNormalized(normA, normB);

  const phonesA = [
    normalizePhoneForDuplicate(a.phone),
    normalizePhoneForDuplicate(a.whatsapp),
  ].filter((x): x is string => Boolean(x));
  const phonesB = [
    normalizePhoneForDuplicate(b.phone),
    normalizePhoneForDuplicate(b.whatsapp),
  ].filter((x): x is string => Boolean(x));

  const phoneMatch =
    phonesA.length > 0 && phonesB.some((pb) => phonesA.includes(pb));
  const sameHousehold = Boolean(
    a.householdId && b.householdId && a.householdId === b.householdId,
  );
  const sameGn = Boolean(a.gnId && b.gnId && a.gnId === b.gnId);

  const ageDiff =
    a.age !== undefined &&
      a.age !== null &&
      b.age !== undefined &&
      b.age !== null
      ? Math.abs(a.age - b.age)
      : null;
  const sameAge = ageDiff !== null && ageDiff <= 1;

  const genderA = a.gender?.trim().toUpperCase();
  const genderB = b.gender?.trim().toUpperCase();
  const genderMismatch = Boolean(genderA && genderB && genderA !== genderB);

  let score = 0;
  const factors: string[] = [];

  if (phoneMatch) {
    score += 50;
    factors.push('same_phone');
  }
  if (sim >= 0.85) {
    score += 30;
    factors.push('name_match');
  } else if (sim >= 0.7) {
    score += 15;
    factors.push('name_similar');
  }
  if (sameHousehold) {
    score += 15;
    factors.push('same_household');
  }
  if (sameGn) {
    score += 5;
    factors.push('same_gn');
  }
  if (sameAge) {
    score += 5;
    factors.push('same_age');
  }
  if (genderMismatch) {
    score -= 40;
    factors.push('gender_mismatch');
  }

  let antiFalsePositiveCapped = false;
  // Anti-false-positive rule (§9): siblings/family members sharing a household/phone
  // whose names clearly disagree must never be classified as probable (>= 70).
  if (sim < 0.7 && score >= DUPLICATE_THRESHOLDS.probable) {
    score = 65;
    antiFalsePositiveCapped = true;
    factors.push('family_phone_cap');
  }

  score = Math.max(0, Math.min(100, score));
  const classification = classifyDuplicateScore(score);

  return {
    score,
    classification,
    reasons: {
      factors,
      nameSimilarity: Number(sim.toFixed(4)),
      phoneMatch,
      sameHousehold,
      sameGn,
      ageDiff,
      genderMismatch,
      ...(antiFalsePositiveCapped ? { antiFalsePositiveCapped: true } : {}),
    },
  };
}
