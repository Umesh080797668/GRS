import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';

void main() {
  testWidgets('GRS Mobile App boots with Riverpod ProviderScope', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: GrsMobileApp()));
    await tester.pump();

    // App should build without crashing
    expect(find.byType(GrsMobileApp), findsOneWidget);
  });
}
