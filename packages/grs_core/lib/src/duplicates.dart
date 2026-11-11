import 'dart:math' as math;
import 'validators.dart';

enum DuplicateClassification { probable, possible, ignore }

class DuplicateCandidateInput {
  final String id;
  final String name;
  final int? age;
  final String? gender;
  final String? phone;
  final String? whatsapp;
  final String? householdId;
  final String? gnId;

  const DuplicateCandidateInput({
    required this.id,
    required this.name,
    this.age,
    this.gender,
    this.phone,
    this.whatsapp,
    this.householdId,
    this.gnId,
  });
}

class DuplicateScoreResult {
  final int score;
  final DuplicateClassification classification;
  final double nameSimilarity;
  final bool samePhone;
  final bool sameHousehold;
  final bool sameGn;
  final bool genderMismatch;

  const DuplicateScoreResult({
    required this.score,
    required this.classification,
    required this.nameSimilarity,
    required this.samePhone,
    required this.sameHousehold,
    required this.sameGn,
    required this.genderMismatch,
  });
}

class SameHouseDuplicateMatch {
  final DuplicateCandidateInput existing;
  final double nameSimilarity;
  final bool samePhone;
  final int score;

  const SameHouseDuplicateMatch({
    required this.existing,
    required this.nameSimilarity,
    required this.samePhone,
    required this.score,
  });
}

/// Shared duplicate name normalization, phonetic-tolerant token similarity,
/// and deterministic scoring aligned with the NestJS backend and docs/test-vectors/duplicates.json.
class GrsDuplicates {
  static const int probableThreshold = 70;
  static const int possibleThreshold = 45;

  static final RegExp _honorificsRegex = RegExp(
    r'\b(mr|mrs|miss|ms|rev|dr|prof|ven)\b\.?',
    caseSensitive: false,
  );
  static final RegExp _zeroWidthRegex = RegExp(
    r'[\u200B-\u200D\uFEFF]',
    unicode: true,
  );
  static final RegExp _punctSymbolsRegex = RegExp(
    r'[\p{P}\p{S}]',
    unicode: true,
  );
  static final RegExp _romanWordRegex = RegExp(r'^[a-z]+$');
  static final RegExp _romanDigraphsRegex = RegExp(
    r'(th|dh|bh|ph|kh|sh|ch|gh)',
  );
  static final RegExp _repeatedLetterRegex = RegExp(r'([a-z])\1+');
  static final RegExp _tamilInitialRegex = RegExp(
    r'^[\u0B80-\u0BFF][\u0BBE-\u0BCD\u0BD7]?$',
    unicode: true,
  );
  static final RegExp _sinhalaCharInitialRegex = RegExp(
    r'^[\u0D80-\u0DFF][\u0DCA-\u0DDF]?$',
    unicode: true,
  );

  static const Set<String> _sinhalaInitialNames = {
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
  };

  /// Canonicalizes a name for duplicate comparison (strips zero-width joiners cleanly,
  /// removes honorifics & punctuation, sorts tokens alphabetically).
  static String normalizeName(String? name) {
    if (name == null || name.isEmpty) return '';
    final cleaned = name
        .toLowerCase()
        .replaceAll(_zeroWidthRegex, '')
        .replaceAll(_honorificsRegex, '')
        .replaceAll(_punctSymbolsRegex, ' ')
        .trim();
    if (cleaned.isEmpty) return '';
    final tokens =
        cleaned.split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toList()
          ..sort();
    return tokens.join(' ');
  }

  /// Normalizes phone/WhatsApp inputs to canonical E.164 format for comparison.
  static String? normalizePhoneForComparison(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    final waRes = GrsValidators.normalizeWhatsApp(raw);
    if (waRes.isValid && waRes.value != null) {
      return waRes.value;
    }
    final clean = raw.replaceAll(RegExp(r'[\s\-()]'), '');
    if (clean.isEmpty) return null;
    if (clean.startsWith('00')) return '+${clean.substring(2)}';
    if (RegExp(r'^0\d{9}$').hasMatch(clean)) return '+94${clean.substring(1)}';
    if (RegExp(r'^94\d{9}$').hasMatch(clean)) return '+$clean';
    return clean;
  }

  static String _foldRomanToken(String token) {
    if (!_romanWordRegex.hasMatch(token)) return token;
    final folded = token.replaceAllMapped(
      _romanDigraphsRegex,
      (m) => m[0] == 'ch' ? 'c' : m[0]![0],
    );
    return folded.replaceAllMapped(_repeatedLetterRegex, (m) => m[1]!);
  }

  static double _levenshteinSimilarity(String a, String b) {
    if (a == b) return 1.0;
    if (a.isEmpty || b.isEmpty) return 0.0;

    final dp = List.generate(
      a.length + 1,
      (i) => List<int>.filled(b.length + 1, 0),
    );
    for (var i = 0; i <= a.length; i++) {
      dp[i][0] = i;
    }
    for (var j = 0; j <= b.length; j++) {
      dp[0][j] = j;
    }
    for (var i = 1; i <= a.length; i++) {
      for (var j = 1; j <= b.length; j++) {
        final cost = a.codeUnitAt(i - 1) == b.codeUnitAt(j - 1) ? 0 : 1;
        dp[i][j] = math.min(
          dp[i - 1][j] + 1,
          math.min(dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost),
        );
      }
    }
    return 1.0 - dp[a.length][b.length] / math.max(a.length, b.length);
  }

  static bool _isInitialToken(String token) {
    if (token.length <= 1) return true;
    if (_sinhalaInitialNames.contains(token)) return true;
    if (_tamilInitialRegex.hasMatch(token)) return true;
    if (_sinhalaCharInitialRegex.hasMatch(token)) return true;
    return false;
  }

  static double _tokenSimilarity(String a, String b) {
    if (a == b) return 1.0;
    if (a.length == 1 && b.startsWith(a)) return 0.85;
    if (b.length == 1 && a.startsWith(b)) return 0.85;

    final raw = _levenshteinSimilarity(a, b);
    final fa = _foldRomanToken(a);
    final fb = _foldRomanToken(b);
    final folded = fa == fb ? 0.94 : _levenshteinSimilarity(fa, fb) * 0.94;
    return math.max(raw, folded);
  }

  static double nameSimilarity(String rawA, String rawB) {
    final normA = normalizeName(rawA);
    final normB = normalizeName(rawB);
    if (normA.isEmpty || normB.isEmpty) return 0.0;
    if (normA == normB) return 1.0;

    final tokensA = normA.split(' ').where((t) => t.isNotEmpty).toList();
    final tokensB = normB.split(' ').where((t) => t.isNotEmpty).toList();
    if (tokensA.isEmpty || tokensB.isEmpty) return 0.0;

    final shorter = tokensA.length <= tokensB.length ? tokensA : tokensB;
    final longer = tokensA.length <= tokensB.length ? tokensB : tokensA;

    final used = List<bool>.filled(longer.length, false);
    final scores = <double>[];

    for (final st in shorter) {
      var best = 0.0;
      var bestIdx = -1;
      for (var j = 0; j < longer.length; j++) {
        if (used[j]) continue;
        final s = _tokenSimilarity(st, longer[j]);
        if (s > best) {
          best = s;
          bestIdx = j;
        }
      }
      if (bestIdx >= 0) used[bestIdx] = true;
      scores.add(best);
    }

    final unmatched = <String>[];
    for (var j = 0; j < longer.length; j++) {
      if (!used[j]) unmatched.add(longer[j]);
    }
    final extraAreInitials =
        unmatched.isNotEmpty && unmatched.every(_isInitialToken);

    if (unmatched.isNotEmpty && !extraAreInitials) {
      for (var i = 0; i < unmatched.length; i++) {
        scores.add(0.0);
      }
    }

    final avg = scores.reduce((a, b) => a + b) / scores.length;
    final minTok = scores.reduce(math.min);
    if (minTok < 0.70) {
      return math.min(0.69, avg * 0.6 + minTok * 0.4);
    }
    return extraAreInitials ? avg * 0.92 : avg;
  }

  static DuplicateClassification classify(int score) {
    if (score >= probableThreshold) return DuplicateClassification.probable;
    if (score >= possibleThreshold) return DuplicateClassification.possible;
    return DuplicateClassification.ignore;
  }

  static DuplicateScoreResult scorePair(
    DuplicateCandidateInput a,
    DuplicateCandidateInput b,
  ) {
    final sim = nameSimilarity(a.name, b.name);

    final phonesA = <String>[
      if (normalizePhoneForComparison(a.phone) != null)
        normalizePhoneForComparison(a.phone)!,
      if (normalizePhoneForComparison(a.whatsapp) != null)
        normalizePhoneForComparison(a.whatsapp)!,
    ];
    final phonesB = <String>[
      if (normalizePhoneForComparison(b.phone) != null)
        normalizePhoneForComparison(b.phone)!,
      if (normalizePhoneForComparison(b.whatsapp) != null)
        normalizePhoneForComparison(b.whatsapp)!,
    ];

    final samePhone =
        phonesA.isNotEmpty && phonesB.any((pb) => phonesA.contains(pb));
    final sameHousehold =
        a.householdId != null &&
        a.householdId!.isNotEmpty &&
        a.householdId == b.householdId;
    final sameGn = a.gnId != null && a.gnId!.isNotEmpty && a.gnId == b.gnId;
    final sameAge =
        a.age != null && b.age != null && (a.age! - b.age!).abs() <= 1;

    final gA = a.gender?.trim().toUpperCase();
    final gB = b.gender?.trim().toUpperCase();
    final genderMismatch =
        gA != null && gA.isNotEmpty && gB != null && gB.isNotEmpty && gA != gB;

    var score = 0;
    if (samePhone) score += 50;
    if (sim >= 0.85) {
      score += 30;
    } else if (sim >= 0.70) {
      score += 15;
    }
    if (sameHousehold) score += 15;
    if (sameGn) score += 5;
    if (sameAge) score += 5;
    if (genderMismatch) score -= 40;

    if (sim < 0.70 && score >= probableThreshold) {
      score = 65;
    }

    score = math.max(0, math.min(100, score));
    return DuplicateScoreResult(
      score: score,
      classification: classify(score),
      nameSimilarity: double.parse(sim.toStringAsFixed(4)),
      samePhone: samePhone,
      sameHousehold: sameHousehold,
      sameGn: sameGn,
      genderMismatch: genderMismatch,
    );
  }

  /// On-device same-house non-blocking warning check (M6.3 / Build Plan §9 Layer 2).
  /// Flags any existing record in the same house with name similarity >= 0.70 or same phone.
  static List<SameHouseDuplicateMatch> findSameHouseMatches({
    required DuplicateCandidateInput draft,
    required List<DuplicateCandidateInput> existingInHouse,
    double nameThreshold = 0.70,
  }) {
    final draftNorm = normalizeName(draft.name);
    final draftPhones = <String>[
      if (normalizePhoneForComparison(draft.phone) != null)
        normalizePhoneForComparison(draft.phone)!,
      if (normalizePhoneForComparison(draft.whatsapp) != null)
        normalizePhoneForComparison(draft.whatsapp)!,
    ];

    if (draftNorm.length < 2 && draftPhones.isEmpty) {
      return const [];
    }

    final matches = <SameHouseDuplicateMatch>[];
    for (final existing in existingInHouse) {
      if (existing.id == draft.id) continue;

      final sim = draftNorm.length >= 2
          ? nameSimilarity(draft.name, existing.name)
          : 0.0;
      final existingPhones = <String>[
        if (normalizePhoneForComparison(existing.phone) != null)
          normalizePhoneForComparison(existing.phone)!,
        if (normalizePhoneForComparison(existing.whatsapp) != null)
          normalizePhoneForComparison(existing.whatsapp)!,
      ];
      final samePhone =
          draftPhones.isNotEmpty &&
          existingPhones.any((ep) => draftPhones.contains(ep));

      if (sim >= nameThreshold || samePhone) {
        final pairScore = scorePair(
          DuplicateCandidateInput(
            id: draft.id,
            name: draft.name,
            age: draft.age,
            gender: draft.gender,
            phone: draft.phone,
            whatsapp: draft.whatsapp,
            householdId: existing.householdId ?? draft.householdId,
            gnId: existing.gnId ?? draft.gnId,
          ),
          existing,
        );
        matches.add(
          SameHouseDuplicateMatch(
            existing: existing,
            nameSimilarity: double.parse(sim.toStringAsFixed(4)),
            samePhone: samePhone,
            score: pairScore.score,
          ),
        );
      }
    }

    matches.sort((a, b) {
      final byScore = b.score.compareTo(a.score);
      if (byScore != 0) return byScore;
      return b.nameSimilarity.compareTo(a.nameSimilarity);
    });
    return matches;
  }
}
