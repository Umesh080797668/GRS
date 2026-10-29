/**
 * Shared validation and normalization functions across NestJS API.
 * Single source of truth aligned with docs/test-vectors/validation.json, phones.json, ids.json.
 */

export interface ValidationResult<T> {
  isValid: boolean;
  value?: T;
  error?: string;
}

export class GrsValidators {
  private static readonly COMMON_PASSWORDS = new Set([
    'password',
    'password123',
    'admin123',
    '12345678',
    'qwerty123',
  ]);

  /**
   * Normalizes and validates a person or house leader name.
   * Rules: 2-120 chars, collapse spaces, at least one letter (\p{L}), no digits-only.
   */
  static validateName(input?: string | null): ValidationResult<string> {
    if (input === undefined || input === null) {
      return { isValid: false, error: 'empty' };
    }
    if (input.length === 0) {
      return { isValid: false, error: 'empty' };
    }
    if (input.trim().length === 0) {
      return { isValid: false, error: 'whitespace_only' };
    }
    const trimmed = input.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2) {
      return { isValid: false, error: 'too_short' };
    }
    if (trimmed.length > 120) {
      return { isValid: false, error: 'too_long' };
    }

    // Digits only check
    if (/^\d+$/.test(trimmed.replace(/\s/g, ''))) {
      return { isValid: false, error: 'digits_only' };
    }

    // Must contain at least one letter (Unicode property escape supports Sinhala/Tamil/English)
    if (!/\p{L}/u.test(trimmed)) {
      return { isValid: false, error: 'no_letter' };
    }

    return { isValid: true, value: trimmed };
  }

  /**
   * Validates age: integer between 1 and 120.
   */
  static validateAge(input: any): ValidationResult<number> {
    if (input === undefined || input === null) {
      return { isValid: false, error: 'empty' };
    }
    if (typeof input === 'boolean') {
      return { isValid: false, error: 'non_integer' };
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!/^\d+$/.test(trimmed)) {
        return { isValid: false, error: 'non_integer' };
      }
    } else if (typeof input !== 'number') {
      return { isValid: false, error: 'non_integer' };
    }
    const parsed =
      typeof input === 'number' ? input : parseInt(input.trim(), 10);
    if (!Number.isInteger(parsed) || isNaN(parsed)) {
      return { isValid: false, error: 'non_integer' };
    }
    if (parsed < 1) {
      return { isValid: false, error: parsed < 0 ? 'negative' : 'below_min' };
    }
    if (parsed > 120) {
      return { isValid: false, error: 'above_max' };
    }
    return { isValid: true, value: parsed };
  }

  /**
   * Validates gender: 'F' or 'M'.
   */
  static validateGender(input?: string | null): ValidationResult<string> {
    if (!input || input.trim().length === 0) {
      return { isValid: false, error: 'empty' };
    }
    const upper = input.trim().toUpperCase();
    if (upper === 'F' || upper === 'M') {
      return { isValid: true, value: upper };
    }
    if (upper === 'FEMALE' || upper === 'MALE') {
      return { isValid: false, error: 'must_be_F_or_M' };
    }
    return { isValid: false, error: 'invalid_enum' };
  }

  /**
   * Normalizes a house number (Section 9 Layer 1):
   * Trim, uppercase, remove spaces, \ -> /, strip leading zeros in numeric parts.
   */
  static normalizeHouseNo(input?: string | null): ValidationResult<string> {
    if (!input || input.trim().length === 0) {
      return { isValid: false, error: 'empty' };
    }
    let norm = input.trim().toUpperCase().replace(/\\/g, '/');

    // If space before letter/slash: "25 A" -> "25/A"
    norm = norm.replace(/(\d+)\s+([A-Z])/g, '$1/$2');
    norm = norm.replace(/\s+/g, '');

    // Strip leading zeros on numeric parts: "025" -> "25", "007/A" -> "7/A"
    norm = norm
      .split('/')
      .map((seg) => {
        const m = /^0+(\d+)$/.exec(seg);
        return m ? m[1] : seg;
      })
      .join('/');

    if (norm.length === 0) {
      return { isValid: false, error: 'empty' };
    }
    return { isValid: true, value: norm };
  }

  /**
   * Normalizes Sri Lankan phone numbers to E.164 (+94...).
   */
  static normalizePhone(input?: string | null): ValidationResult<string> {
    if (!input || input.trim().length === 0) {
      return { isValid: false, error: 'empty' };
    }
    let digits = input.replace(/[\s\-()]/g, '');
    if (!/^\+?[0-9]+$/.test(digits)) {
      return { isValid: false, error: 'non_numeric' };
    }

    if (digits.startsWith('00940') && digits.length === 14) {
      digits = '+94' + digits.substring(5);
    } else if (digits.startsWith('0094')) {
      digits = '+94' + digits.substring(4);
    } else if (digits.startsWith('+940') && digits.length === 13) {
      digits = '+94' + digits.substring(4);
    } else if (digits.startsWith('940') && digits.length === 12) {
      digits = '+94' + digits.substring(3);
    } else if (digits.startsWith('94')) {
      digits = '+' + digits;
    } else if (digits.startsWith('0') && digits.length >= 10) {
      digits = '+94' + digits.substring(1);
    } else if (!digits.startsWith('+') && digits.length === 9) {
      digits = '+94' + digits;
    }

    // Sri Lankan E.164: +94 followed by 9 digits starting with non-zero
    const slRegex = /^\+94[1-9][0-9]{8}$/;
    if (slRegex.test(digits)) {
      return { isValid: true, value: digits };
    }

    if (digits.length < 12) {
      return { isValid: false, error: 'too_short' };
    }
    if (digits.length > 12) {
      return { isValid: false, error: 'too_long' };
    }
    return { isValid: false, error: 'invalid_sl_format' };
  }

  /**
   * Normalizes WhatsApp numbers (Sri Lankan or International E.164).
   */
  static normalizeWhatsApp(input?: string | null): ValidationResult<string> {
    if (!input || input.trim().length === 0) {
      return { isValid: false, error: 'empty' };
    }
    const slResult = this.normalizePhone(input);
    if (slResult.isValid) {
      return slResult;
    }

    let clean = input.replace(/[\s\-()]/g, '');
    if (clean.startsWith('00')) {
      clean = '+' + clean.substring(2);
    } else if (!clean.startsWith('+')) {
      clean = '+' + clean;
    }

    const intlRegex = /^\+[1-9][0-9]{7,14}$/;
    if (intlRegex.test(clean)) {
      return { isValid: true, value: clean };
    }

    return { isValid: false, error: 'invalid_whatsapp_format' };
  }

  /**
   * Parses age group string: "18-25", "18–25", "18 - 25".
   */
  static parseAgeGroup(
    input?: string | null,
  ): ValidationResult<{ min: number; max: number }> {
    if (!input || input.trim().length === 0) {
      return { isValid: false, error: 'empty' };
    }
    const match = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(input.trim());
    if (!match) {
      return { isValid: false, error: 'bad_format' };
    }

    const min = parseInt(match[1], 10);
    const max = parseInt(match[2], 10);

    if (min < 0 || max > 120) {
      return { isValid: false, error: 'out_of_range' };
    }
    if (min > max) {
      return { isValid: false, error: 'min_greater_than_max' };
    }

    return { isValid: true, value: { min, max } };
  }

  /**
   * Validates user code format: ^GRS[0-9]{10}$ (case-insensitive, normalized to upper).
   */
  static validateUserCode(input?: string | null): ValidationResult<string> {
    if (!input || input.trim().length === 0) {
      return { isValid: false, error: 'empty' };
    }
    const trimmed = input.trim();
    if (!trimmed.toUpperCase().startsWith('GRS')) {
      return { isValid: false, error: 'wrong_prefix' };
    }
    if (trimmed.length !== 13) {
      return { isValid: false, error: 'wrong_length' };
    }
    if (!/^GRS[0-9]{10}$/i.test(trimmed)) {
      return { isValid: false, error: 'non_digit' };
    }
    return { isValid: true, value: trimmed.toUpperCase() };
  }

  /**
   * Validates password: >= 8 characters and not in common passwords list.
   */
  static validatePassword(input?: string | null): ValidationResult<string> {
    if (!input || input.length === 0) {
      return { isValid: false, error: 'empty' };
    }
    if (input.length < 8) {
      return { isValid: false, error: 'less_than_8_chars' };
    }
    if (this.COMMON_PASSWORDS.has(input.toLowerCase())) {
      return { isValid: false, error: 'common_password' };
    }
    return { isValid: true, value: input };
  }

  /**
   * Validates future hopes: array of unique valid codes.
   */
  static validateFutureHopes(input?: any[] | null): ValidationResult<string[]> {
    if (!input) {
      return { isValid: true, value: [] };
    }
    const validCodes = new Set([
      'higher_education',
      'vocational_education',
      'entrepreneur',
      'local_job',
      'foreign_job',
    ]);

    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of input) {
      const code = String(item);
      if (!validCodes.has(code)) {
        return { isValid: false, error: 'unknown_code' };
      }
      if (seen.has(code)) {
        return { isValid: false, error: 'duplicates_not_allowed' };
      }
      seen.add(code);
      result.push(code);
    }

    return { isValid: true, value: result };
  }
}
