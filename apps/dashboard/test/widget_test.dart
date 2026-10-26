import 'package:flutter_test/flutter_test.dart';
import 'package:dashboard/main.dart';

void main() {
  testWidgets('GRS Dashboard App smoke test', (WidgetTester tester) async {
    // Build the GRS Dashboard App and trigger a frame.
    await tester.pumpWidget(const GrsDashboardApp());
    await tester.pumpAndSettle();

    // Verify trilingual showcase elements render
    expect(find.text('SINHALA (සිංහල)'), findsOneWidget);
    expect(find.text('TAMIL (தமிழ்)'), findsOneWidget);
    expect(find.text('ENGLISH'), findsOneWidget);
    expect(
      find.text('Democratic Socialist Republic of Sri Lanka'),
      findsOneWidget,
    );
  });
}
