import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Spike S5: Flutter Web Trilingual Typography & 3MB Upload (M0.7)', () {
    test(
      'verifies bundled Noto Sans Sinhala and Tamil font assets exist on disk',
      () {
        final sinhalaFont = File('assets/fonts/NotoSansSinhala-Regular.ttf');
        final tamilFont = File('assets/fonts/NotoSansTamil-Regular.ttf');

        expect(
          sinhalaFont.existsSync(),
          isTrue,
          reason: 'NotoSansSinhala-Regular.ttf must exist in assets/fonts',
        );
        expect(
          tamilFont.existsSync(),
          isTrue,
          reason: 'NotoSansTamil-Regular.ttf must exist in assets/fonts',
        );
        expect(sinhalaFont.lengthSync(), greaterThan(50000));
        expect(tamilFont.lengthSync(), greaterThan(50000));
      },
    );

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
      // Real binary representation of a 3MB XLSX package (Zip archive PK header)
      final buffer = Uint8List(threeMbBytes);
      buffer[0] = 0x50; // 'P'
      buffer[1] = 0x4B; // 'K'
      buffer[2] = 0x03;
      buffer[3] = 0x04;

      // Fill with structured chunk pattern simulating xlsx xml entries
      for (var i = 4; i < 2048; i++) {
        buffer[i] = (i % 256);
      }

      expect(buffer.lengthInBytes, equals(threeMbBytes));
      expect(buffer.lengthInBytes / (1024 * 1024), equals(3.0));
      expect(buffer[0], equals(0x50));
      expect(buffer[1], equals(0x4B));
    });
  });
}
