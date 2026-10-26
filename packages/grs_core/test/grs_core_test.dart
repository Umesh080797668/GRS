import 'package:grs_core/grs_core.dart';
import 'package:test/test.dart';

void main() {
  group('grs_core entrypoint', () {
    test('exports GrsValidators and validates basic input', () {
      final res = GrsValidators.validateUserCode('GRS1234567890');
      expect(res.isValid, isTrue);
      expect(res.value, equals('GRS1234567890'));
    });
  });
}
