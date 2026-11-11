import 'dart:convert';
import 'dart:io';
import 'package:grs_core/src/duplicates.dart';
import 'package:test/test.dart';

void main() {
  group('Duplicate Scoring Engine (M6.1 & M6.3)', () {
    late Map<String, dynamic> vectors;

    setUpAll(() {
      final file = File('../../docs/test-vectors/duplicates.json');
      vectors = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
    });

    test('normalizeDuplicateName handles honorifics, order, and ZWJ', () {
      expect(
        GrsDuplicates.normalizeName('Mr. Nimal Shantha'),
        equals(GrsDuplicates.normalizeName('Nimal Shantha')),
      );
      expect(
        GrsDuplicates.normalizeName('Mohamed Rizwan'),
        equals(GrsDuplicates.normalizeName('Rizwan Mohamed')),
      );

      final si = GrsDuplicates.normalizeName('නිමල් ප්‍රනාන්දු');
      expect(si.split(' ').length, equals(2));
      expect(si.contains('\u200D'), isFalse);
    });

    test(
      'achieves >=0.95 precision for probable and >=0.90 recall on 62 vectors',
      () {
        final pairs = vectors['pairs'] as List<dynamic>;
        expect(pairs.length, greaterThanOrEqualTo(60));

        var tpProbable = 0;
        var fpProbable = 0;
        var tpDetected = 0;
        var totalTrue = 0;

        for (final rawPair in pairs) {
          final pair = rawPair as Map<String, dynamic>;
          final ra = pair['record_a'] as Map<String, dynamic>;
          final rb = pair['record_b'] as Map<String, dynamic>;

          final a = DuplicateCandidateInput(
            id: 'a',
            name: ra['name'] as String,
            age: ra['age'] as int?,
            gender: ra['gender'] as String?,
            phone: ra['phone'] as String?,
            whatsapp: ra['whatsapp'] as String?,
            householdId: ra['household_id'] as String?,
            gnId: ra['gn_id'] as String?,
          );
          final b = DuplicateCandidateInput(
            id: 'b',
            name: rb['name'] as String,
            age: rb['age'] as int?,
            gender: rb['gender'] as String?,
            phone: rb['phone'] as String?,
            whatsapp: rb['whatsapp'] as String?,
            householdId: rb['household_id'] as String?,
            gnId: rb['gn_id'] as String?,
          );

          final res = GrsDuplicates.scorePair(a, b);
          if (pair['label'] == 'true_duplicate') {
            totalTrue++;
            if (res.classification == DuplicateClassification.probable ||
                res.classification == DuplicateClassification.possible) {
              tpDetected++;
            }
            if (res.classification == DuplicateClassification.probable) {
              tpProbable++;
            }
          } else if (res.classification == DuplicateClassification.probable) {
            fpProbable++;
          }
        }

        final precision = tpProbable / (tpProbable + fpProbable);
        final recall = tpDetected / totalTrue;
        expect(precision, greaterThanOrEqualTo(0.95));
        expect(recall, greaterThanOrEqualTo(0.90));
        expect(fpProbable, equals(0));
      },
    );

    test('findSameHouseMatches flags same phone or similar name in house', () {
      final existing = [
        const DuplicateCandidateInput(
          id: 'existing-1',
          name: 'Kavinda Bandara',
          age: 24,
          gender: 'M',
          phone: '+94771234567',
          householdId: 'H1',
        ),
        const DuplicateCandidateInput(
          id: 'existing-2',
          name: 'Sanduni Silva',
          age: 21,
          gender: 'F',
          phone: '+94719998887',
          householdId: 'H1',
        ),
      ];

      final nameMatch = GrsDuplicates.findSameHouseMatches(
        draft: const DuplicateCandidateInput(
          id: 'draft',
          name: 'Bandara Kavinda',
          householdId: 'H1',
        ),
        existingInHouse: existing,
      );
      expect(nameMatch, isNotEmpty);
      expect(nameMatch.first.existing.id, equals('existing-1'));

      final phoneMatch = GrsDuplicates.findSameHouseMatches(
        draft: const DuplicateCandidateInput(
          id: 'draft',
          name: 'Ruwan Perera',
          phone: '0771234567',
          householdId: 'H1',
        ),
        existingInHouse: existing,
      );
      expect(phoneMatch, isNotEmpty);
      expect(phoneMatch.first.existing.id, equals('existing-1'));
      expect(phoneMatch.first.samePhone, isTrue);
    });
  });
}
