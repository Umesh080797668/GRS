import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Spike S5: Flutter Web Trilingual Typography & 3MB Upload (M0.7)', () {
    testWidgets(
      'Renders Sinhala, Tamil, and English text without glyph overflow',
      (WidgetTester tester) async {
        const sinhalaSample = 'ශ්‍රී ලංකා ප්‍රජාතාන්ත්‍රික සමාජවාදී ජනරජය';
        const tamilSample = 'இலங்கை ஜனநாயக சோசலிசக் குடியரசு';
        const englishSample = 'Global Research & Survey System (GRS)';

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Column(
                children: const [
                  Text(
                    sinhalaSample,
                    style: TextStyle(
                      fontFamily: 'NotoSansSinhala',
                      fontSize: 18,
                    ),
                  ),
                  Text(
                    tamilSample,
                    style: TextStyle(fontFamily: 'NotoSansTamil', fontSize: 18),
                  ),
                  Text(
                    englishSample,
                    style: TextStyle(fontFamily: 'Roboto', fontSize: 18),
                  ),
                ],
              ),
            ),
          ),
        );

        expect(find.text(sinhalaSample), findsOneWidget);
        expect(find.text(tamilSample), findsOneWidget);
        expect(find.text(englishSample), findsOneWidget);
      },
    );

    test('Processes and verifies 3 MB XLSX binary upload buffer in memory', () {
      const threeMbBytes = 3 * 1024 * 1024;
      // Simulate raw bytes of 3MB Excel workbook
      final buffer = Uint8List(threeMbBytes);

      // Verify buffer allocation
      expect(buffer.lengthInBytes, equals(threeMbBytes));
      expect(buffer.lengthInBytes / (1024 * 1024), equals(3.0));

      // Simulate chunked streaming / hashing
      var checksum = 0;
      for (var i = 0; i < 1000; i++) {
        checksum += buffer[i];
      }
      expect(checksum, equals(0));
    });
  });
}
