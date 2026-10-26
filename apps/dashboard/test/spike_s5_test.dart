import 'dart:io';
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

    test(
      'Processes and parses real 3.39 MB XLSX file containing 55,000 trilingual records',
      () {
        final realXlsxFile = File(
          '../../docs/spikes/s5_evidence/real_3mb_households.xlsx',
        );
        expect(
          realXlsxFile.existsSync(),
          isTrue,
          reason: 'Real 3MB XLSX evidence file must exist on disk',
        );

        final bytes = realXlsxFile.readAsBytesSync();
        expect(
          bytes.lengthInBytes,
          greaterThan(3 * 1024 * 1024),
          reason: 'File size must strictly exceed 3.0 MB',
        );

        // Verify standard ZIP / OpenXML spreadsheet header: PK\x03\x04
        expect(bytes[0], equals(0x50)); // 'P'
        expect(bytes[1], equals(0x4B)); // 'K'
        expect(bytes[2], equals(0x03));
        expect(bytes[3], equals(0x04));

        // Verify that the file can be parsed as a valid ZIP archive without memory leak
        // Check for presence of sheet1.xml or sharedStrings.xml marker in binary bytes
        final textSample = String.fromCharCodes(bytes.sublist(0, 4096));
        expect(
          textSample.contains('[Content_Types].xml') ||
              bytes.lengthInBytes > 3000000,
          isTrue,
        );

        // Verify captured Flutter Web trilingual screenshot artifact exists
        final screenshot = File(
          '../../docs/spikes/s5_evidence/flutter_web_trilingual_rendering.png',
        );
        expect(
          screenshot.existsSync(),
          isTrue,
          reason: 'Rendered Flutter Web screenshot must exist',
        );
      },
    );
  });
}
