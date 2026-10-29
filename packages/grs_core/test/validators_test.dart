import 'dart:convert';
import 'dart:io';
import 'package:grs_core/grs_core.dart';
import 'package:test/test.dart';

void main() {
  group('GrsValidators - Validation Test Vectors', () {
    late Map<String, dynamic> validationVectors;

    setUpAll(() {
      // Load docs/test-vectors/validation.json relative to project root
      final file = File('../../docs/test-vectors/validation.json');
      expect(
        file.existsSync(),
        isTrue,
        reason: 'docs/test-vectors/validation.json must exist',
      );
      validationVectors =
          jsonDecode(file.readAsStringSync())['vectors']
              as Map<String, dynamic>;
    });

    test('Name validation vectors', () {
      final vectors = validationVectors['name'] as List;
      for (final v in vectors) {
        final input = v['input'] as String?;
        final expectedValid = v['valid'] as bool;
        final result = GrsValidators.validateName(input);

        expect(
          result.isValid,
          equals(expectedValid),
          reason: 'Failed for name input: "$input"',
        );

        if (expectedValid && v.containsKey('normalized')) {
          expect(result.value, equals(v['normalized']));
        }
        if (!expectedValid && v.containsKey('reason')) {
          expect(result.error, equals(v['reason']));
        }
      }
    });

    test('Age validation vectors', () {
      final vectors = validationVectors['age'] as List;
      for (final v in vectors) {
        final input = v['input'];
        final expectedValid = v['valid'] as bool;
        final result = GrsValidators.validateAge(input);

        expect(
          result.isValid,
          equals(expectedValid),
          reason: 'Failed for age input: "$input"',
        );

        if (!expectedValid && v.containsKey('reason')) {
          expect(result.error, equals(v['reason']));
        }
      }

      // Explicit low-severity test checks:
      expect(GrsValidators.validateAge("1e1").isValid, isFalse);
      expect(GrsValidators.validateAge("0x10").isValid, isFalse);
      expect(GrsValidators.validateAge(true).isValid, isFalse);
    });

    test('Gender validation vectors', () {
      final vectors = validationVectors['gender'] as List;
      for (final v in vectors) {
        final input = v['input'] as String?;
        final expectedValid = v['valid'] as bool;
        final result = GrsValidators.validateGender(input);

        expect(
          result.isValid,
          equals(expectedValid),
          reason: 'Failed for gender input: "$input"',
        );

        if (!expectedValid && v.containsKey('reason')) {
          expect(result.error, equals(v['reason']));
        }
      }
    });

    test('House number normalization vectors', () {
      final vectors = validationVectors['house_no'] as List;
      for (final v in vectors) {
        final input = v['input'] as String?;
        final expectedValid = v['valid'] as bool;
        final result = GrsValidators.normalizeHouseNo(input);

        expect(
          result.isValid,
          equals(expectedValid),
          reason: 'Failed for house_no: "$input"',
        );

        if (expectedValid && v.containsKey('normalized')) {
          expect(result.value, equals(v['normalized']));
        }
      }
    });

    test('Age group parsing vectors', () {
      final vectors = validationVectors['age_group'] as List;
      for (final v in vectors) {
        final input = v['input'] as String?;
        final expectedValid = v['valid'] as bool;
        final result = GrsValidators.parseAgeGroup(input);

        expect(
          result.isValid,
          equals(expectedValid),
          reason: 'Failed for age_group: "$input"',
        );

        if (expectedValid) {
          expect(result.value!.min, equals(v['min']));
          expect(result.value!.max, equals(v['max']));
        }
      }
    });

    test('User code validation vectors', () {
      final vectors = validationVectors['user_code'] as List;
      for (final v in vectors) {
        final input = v['input'] as String?;
        final expectedValid = v['valid'] as bool;
        final result = GrsValidators.validateUserCode(input);

        expect(
          result.isValid,
          equals(expectedValid),
          reason: 'Failed for user_code: "$input"',
        );

        if (expectedValid && v.containsKey('normalized')) {
          expect(result.value, equals(v['normalized']));
        }
      }
    });

    test('Password validation vectors', () {
      final vectors = validationVectors['password'] as List;
      for (final v in vectors) {
        final input = v['input'] as String?;
        final expectedValid = v['valid'] as bool;
        final result = GrsValidators.validatePassword(input);

        expect(
          result.isValid,
          equals(expectedValid),
          reason: 'Failed for password: "$input"',
        );
      }
    });

    test('Future hopes validation vectors', () {
      final vectors = validationVectors['future_hopes'] as List;
      for (final v in vectors) {
        final input = v['input'] as List?;
        final expectedValid = v['valid'] as bool;
        final result = GrsValidators.validateFutureHopes(input);

        expect(
          result.isValid,
          equals(expectedValid),
          reason: 'Failed for future_hopes: "$input"',
        );
      }
    });
  });

  group('GrsValidators - Phone & WhatsApp Test Vectors', () {
    late List<dynamic> phoneVectors;

    setUpAll(() {
      final file = File('../../docs/test-vectors/phones.json');
      expect(file.existsSync(), isTrue);
      phoneVectors = jsonDecode(file.readAsStringSync())['vectors'] as List;
    });

    test('Phone normalization vectors', () {
      for (final v in phoneVectors) {
        final input = v['input'] as String?;
        final expectedValidSL = v['valid_sl'] as bool;
        final result = GrsValidators.normalizePhone(input);

        expect(
          result.isValid,
          equals(expectedValidSL),
          reason: 'Failed normalizePhone for: "$input"',
        );

        if (expectedValidSL) {
          expect(result.value, equals(v['e164']));
        }
      }

      // Explicit low-severity check:
      final res = GrsValidators.normalizePhone('+94 0771234567');
      expect(res.isValid, isTrue);
      expect(res.value, equals('+94771234567'));
    });

    test('WhatsApp normalization vectors', () {
      for (final v in phoneVectors) {
        final input = v['input'] as String?;
        final expectedValidWA = (v['valid_whatsapp'] ?? v['valid_sl']) as bool;
        final result = GrsValidators.normalizeWhatsApp(input);

        expect(
          result.isValid,
          equals(expectedValidWA),
          reason: 'Failed normalizeWhatsApp for: "$input"',
        );

        if (expectedValidWA) {
          expect(result.value, equals(v['e164']));
        }
      }
    });
  });
}
