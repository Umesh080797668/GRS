/// Shared validation and normalization functions across GRS.
/// Single source of truth aligned with docs/test-vectors/validation.json and phones.json.
library;

class ValidationResult<T> {
  final bool isValid;
  final T? value;
  final String? error;

  const ValidationResult.valid(this.value) : isValid = true, error = null;

  const ValidationResult.invalid(this.error) : isValid = false, value = null;
}

class GrsValidators {
  static const Set<String> _commonPasswords = {
    'password',
    'password123',
    'admin123',
    '12345678',
    'qwerty123',
  };

  /// Normalizes and validates a person or house leader name.
  /// Rules: 2-120 chars, collapse spaces, at least one letter (\p{L}), no digits-only.
  static ValidationResult<String> validateName(String? input) {
    if (input == null) return const ValidationResult.invalid('empty');
    if (input.isEmpty) return const ValidationResult.invalid('empty');
    if (input.trim().isEmpty) {
      return const ValidationResult.invalid('whitespace_only');
    }
    final trimmed = input.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (trimmed.length < 2) return const ValidationResult.invalid('too_short');
    if (trimmed.length > 120) return const ValidationResult.invalid('too_long');

    // Check for digits only
    if (RegExp(r'^\d+$').hasMatch(trimmed.replaceAll(' ', ''))) {
      return const ValidationResult.invalid('digits_only');
    }

    // Must contain at least one letter (supports Unicode / Sinhala / Tamil)
    // In Dart regex, \p{L} is supported via Unicode property escapes with unicode flag or character class
    final hasLetter = RegExp(r'\p{L}', unicode: true).hasMatch(trimmed);
    if (!hasLetter) {
      return const ValidationResult.invalid('no_letter');
    }

    return ValidationResult.valid(trimmed);
  }

  /// Validates age: integer between 1 and 120.
  static ValidationResult<int> validateAge(dynamic input) {
    if (input == null) return const ValidationResult.invalid('empty');
    if (input is bool) return const ValidationResult.invalid('non_integer');
    int? parsed;
    if (input is int) {
      parsed = input;
    } else if (input is String) {
      final trimmed = input.trim();
      if (!RegExp(r'^\d+$').hasMatch(trimmed)) {
        return const ValidationResult.invalid('non_integer');
      }
      parsed = int.tryParse(trimmed);
    } else {
      return const ValidationResult.invalid('non_integer');
    }
    if (parsed == null) return const ValidationResult.invalid('non_integer');
    if (parsed < 1) {
      return parsed < 0
          ? const ValidationResult.invalid('negative')
          : const ValidationResult.invalid('below_min');
    }
    if (parsed > 120) return const ValidationResult.invalid('above_max');
    return ValidationResult.valid(parsed);
  }

  /// Validates gender: 'F' or 'M'.
  static ValidationResult<String> validateGender(String? input) {
    if (input == null || input.trim().isEmpty) {
      return const ValidationResult.invalid('empty');
    }
    final upper = input.trim().toUpperCase();
    if (upper == 'F' || upper == 'M') {
      return ValidationResult.valid(upper);
    }
    if (upper == 'FEMALE' || upper == 'MALE') {
      return const ValidationResult.invalid('must_be_F_or_M');
    }
    return const ValidationResult.invalid('invalid_enum');
  }

  /// Normalizes a house number (Section 9 Layer 1):
  /// Trim, uppercase, remove spaces, \ -> /, strip leading zeros in numeric parts.
  static ValidationResult<String> normalizeHouseNo(String? input) {
    if (input == null || input.trim().isEmpty) {
      return const ValidationResult.invalid('empty');
    }
    var norm = input.trim().toUpperCase().replaceAll('\\', '/');

    // If there is a space before a letter/slash like "25 A" -> "25/A"
    norm = norm.replaceAllMapped(
      RegExp(r'(\d+)\s+([A-Z])'),
      (m) => '${m[1]}/${m[2]}',
    );
    // Remove remaining internal spaces
    norm = norm.replaceAll(' ', '');

    // Strip leading zeros on numeric segments: e.g. "025" -> "25", "007/A" -> "7/A"
    norm = norm
        .split('/')
        .map((seg) {
          final match = RegExp(r'^0+(\d+)$').firstMatch(seg);
          return match != null ? match.group(1)! : seg;
        })
        .join('/');

    if (norm.isEmpty) return const ValidationResult.invalid('empty');
    return ValidationResult.valid(norm);
  }

  /// Normalizes Sri Lankan phone numbers to E.164 (+94...).
  /// Rules: 07X..., 011..., 94..., 0094..., +94... -> +94[1-9][0-9]{8}
  static ValidationResult<String> normalizePhone(String? input) {
    if (input == null || input.trim().isEmpty) {
      return const ValidationResult.invalid('empty');
    }
    var digits = input.replaceAll(RegExp(r'[\s\-\(\)]'), '');
    if (!RegExp(r'^\+?[0-9]+$').hasMatch(digits)) {
      return const ValidationResult.invalid('non_numeric');
    }

    if (digits.startsWith('00940') && digits.length == 14) {
      digits = '+94${digits.substring(5)}';
    } else if (digits.startsWith('0094')) {
      digits = '+94${digits.substring(4)}';
    } else if (digits.startsWith('+940') && digits.length == 13) {
      digits = '+94${digits.substring(4)}';
    } else if (digits.startsWith('940') && digits.length == 12) {
      digits = '+94${digits.substring(3)}';
    } else if (digits.startsWith('94')) {
      digits = '+$digits';
    } else if (digits.startsWith('0') && digits.length >= 10) {
      digits = '+94${digits.substring(1)}';
    } else if (!digits.startsWith('+') && digits.length == 9) {
      digits = '+94$digits';
    }

    // Sri Lankan E.164: +94 followed by 9 digits starting with non-zero
    final slRegex = RegExp(r'^\+94[1-9][0-9]{8}$');
    if (slRegex.hasMatch(digits)) {
      return ValidationResult.valid(digits);
    }

    if (digits.length < 12) return const ValidationResult.invalid('too_short');
    if (digits.length > 12) return const ValidationResult.invalid('too_long');
    return const ValidationResult.invalid('invalid_sl_format');
  }

  /// Normalizes WhatsApp numbers (Sri Lankan or International E.164).
  static ValidationResult<String> normalizeWhatsApp(String? input) {
    if (input == null || input.trim().isEmpty) {
      return const ValidationResult.invalid('empty');
    }
    // Try Sri Lankan normalization first
    final slResult = normalizePhone(input);
    if (slResult.isValid) {
      return slResult;
    }

    // Check international E.164 format: +[1-9][0-9]{7,14}
    var clean = input.replaceAll(RegExp(r'[\s\-\(\)]'), '');
    if (clean.startsWith('00')) {
      clean = '+${clean.substring(2)}';
    } else if (!clean.startsWith('+')) {
      clean = '+$clean';
    }

    final intlRegex = RegExp(r'^\+[1-9][0-9]{7,14}$');
    if (intlRegex.hasMatch(clean)) {
      return ValidationResult.valid(clean);
    }

    return const ValidationResult.invalid('invalid_whatsapp_format');
  }

  /// Parses age group string: "18-25", "18–25", "18 - 25".
  static ValidationResult<({int min, int max})> parseAgeGroup(String? input) {
    if (input == null || input.trim().isEmpty) {
      return const ValidationResult.invalid('empty');
    }
    final match = RegExp(
      r'^(\d{1,3})\s*[-–]\s*(\d{1,3})$',
    ).firstMatch(input.trim());
    if (match == null) return const ValidationResult.invalid('bad_format');

    final min = int.parse(match.group(1)!);
    final max = int.parse(match.group(2)!);

    if (min < 0 || max > 120) {
      return const ValidationResult.invalid('out_of_range');
    }
    if (min > max) {
      return const ValidationResult.invalid('min_greater_than_max');
    }

    return ValidationResult.valid((min: min, max: max));
  }

  /// Validates user code format: ^GRS[0-9]{10}$ (case-insensitive, normalized to upper).
  static ValidationResult<String> validateUserCode(String? input) {
    if (input == null || input.trim().isEmpty) {
      return const ValidationResult.invalid('empty');
    }
    final trimmed = input.trim();
    if (!trimmed.toUpperCase().startsWith('GRS')) {
      return const ValidationResult.invalid('wrong_prefix');
    }
    if (trimmed.length != 13) {
      return const ValidationResult.invalid('wrong_length');
    }
    if (!RegExp(r'^GRS[0-9]{10}$', caseSensitive: false).hasMatch(trimmed)) {
      return const ValidationResult.invalid('non_digit');
    }
    return ValidationResult.valid(trimmed.toUpperCase());
  }

  /// Validates password: >= 8 characters and not in common passwords list.
  static ValidationResult<String> validatePassword(String? input) {
    if (input == null || input.isEmpty) {
      return const ValidationResult.invalid('empty');
    }
    if (input.length < 8) {
      return const ValidationResult.invalid('less_than_8_chars');
    }
    if (_commonPasswords.contains(input.toLowerCase())) {
      return const ValidationResult.invalid('common_password');
    }
    return ValidationResult.valid(input);
  }

  /// Validates future hopes: array of unique valid codes.
  static ValidationResult<List<String>> validateFutureHopes(
    List<dynamic>? input,
  ) {
    if (input == null) return const ValidationResult.valid([]);
    const validCodes = {
      'higher_education',
      'vocational_education',
      'entrepreneur',
      'local_job',
      'foreign_job',
    };

    final seen = <String>{};
    final result = <String>[];

    for (final item in input) {
      final code = item.toString();
      if (!validCodes.contains(code)) {
        return const ValidationResult.invalid('unknown_code');
      }
      if (seen.contains(code)) {
        return const ValidationResult.invalid('duplicates_not_allowed');
      }
      seen.add(code);
      result.add(code);
    }

    return ValidationResult.valid(result);
  }
}
