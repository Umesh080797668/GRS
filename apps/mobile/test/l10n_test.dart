import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('GRS Trilingual l10n Completeness CI Check (M2.3)', () {
    late Map<String, dynamic> enJson;
    late Map<String, dynamic> siJson;
    late Map<String, dynamic> taJson;

    setUpAll(() {
      final enFile = File('lib/l10n/app_en.arb');
      final siFile = File('lib/l10n/app_si.arb');
      final taFile = File('lib/l10n/app_ta.arb');

      expect(enFile.existsSync(), isTrue, reason: 'app_en.arb must exist');
      expect(siFile.existsSync(), isTrue, reason: 'app_si.arb must exist');
      expect(taFile.existsSync(), isTrue, reason: 'app_ta.arb must exist');

      enJson = jsonDecode(enFile.readAsStringSync()) as Map<String, dynamic>;
      siJson = jsonDecode(siFile.readAsStringSync()) as Map<String, dynamic>;
      taJson = jsonDecode(taFile.readAsStringSync()) as Map<String, dynamic>;
    });

    test('Every English key has matching Sinhala and Tamil keys', () {
      final enKeys = enJson.keys.where((k) => !k.startsWith('@')).toSet();
      final siKeys = siJson.keys.where((k) => !k.startsWith('@')).toSet();
      final taKeys = taJson.keys.where((k) => !k.startsWith('@')).toSet();

      expect(enKeys.isNotEmpty, isTrue);

      final missingInSi = enKeys.difference(siKeys);
      final missingInTa = enKeys.difference(taKeys);

      expect(
        missingInSi,
        isEmpty,
        reason: 'Keys missing in Sinhala (app_si.arb): $missingInSi',
      );
      expect(
        missingInTa,
        isEmpty,
        reason: 'Keys missing in Tamil (app_ta.arb): $missingInTa',
      );
    });

    test('Zero empty string values across all languages', () {
      for (final entry in enJson.entries) {
        if (!entry.key.startsWith('@')) {
          expect(
            entry.value.toString().trim(),
            isNotEmpty,
            reason: 'en key ${entry.key} is empty',
          );
        }
      }
      for (final entry in siJson.entries) {
        if (!entry.key.startsWith('@')) {
          expect(
            entry.value.toString().trim(),
            isNotEmpty,
            reason: 'si key ${entry.key} is empty',
          );
        }
      }
      for (final entry in taJson.entries) {
        if (!entry.key.startsWith('@')) {
          expect(
            entry.value.toString().trim(),
            isNotEmpty,
            reason: 'ta key ${entry.key} is empty',
          );
        }
      }
    });
  });
}
