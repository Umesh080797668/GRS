import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/providers/permission_provider.dart';
import 'package:mobile/screens/guard/permission_gate_screen.dart';
import 'package:mobile/services/permission_service.dart';
import 'package:permission_handler/permission_handler.dart';

class MockPermissionService extends PermissionService {
  bool mockGranted;
  bool mockPermanentlyDenied;
  bool exitAppCalled = false;
  bool requestPermissionsCalled = false;
  bool openSettingsCalled = false;

  MockPermissionService({
    this.mockGranted = false,
    this.mockPermanentlyDenied = false,
  });

  @override
  Future<bool> arePermissionsGranted() async => mockGranted;

  @override
  Future<bool> hasPermanentlyDeniedPermissions() async => mockPermanentlyDenied;

  @override
  Future<Map<Permission, PermissionStatus>> requestPermissions() async {
    requestPermissionsCalled = true;
    return {
      Permission.notification: mockGranted
          ? PermissionStatus.granted
          : PermissionStatus.denied,
    };
  }

  @override
  Future<bool> openSettings() async {
    openSettingsCalled = true;
    return true;
  }

  @override
  void exitApp() {
    exitAppCalled = true;
  }
}

void main() {
  group('PermissionGate Tests', () {
    test(
      'PermissionGateNotifier transitions state on check and request',
      () async {
        final mockService = MockPermissionService(mockGranted: false);
        final notifier = PermissionGateNotifier(mockService);

        await notifier.checkPermissions();
        expect(notifier.state.isGranted, isFalse);
        expect(notifier.state.isPermanentlyDenied, isFalse);

        mockService.mockGranted = true;
        final result = await notifier.requestPermissions();
        expect(result, isTrue);
        expect(notifier.state.isGranted, isTrue);
        expect(mockService.requestPermissionsCalled, isTrue);
      },
    );

    test('PermissionGateNotifier detects permanently denied state', () async {
      final mockService = MockPermissionService(
        mockGranted: false,
        mockPermanentlyDenied: true,
      );
      final notifier = PermissionGateNotifier(mockService);

      await notifier.checkPermissions();
      expect(notifier.state.isGranted, isFalse);
      expect(notifier.state.isPermanentlyDenied, isTrue);

      notifier.exitApp();
      expect(mockService.exitAppCalled, isTrue);
    });

    testWidgets(
      'PermissionGateScreen renders required elements and handles grant/exit actions',
      (tester) async {
        final mockService = MockPermissionService(mockGranted: false);

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              permissionServiceProvider.overrideWithValue(mockService),
            ],
            child: const MaterialApp(
              locale: Locale('en'),
              localizationsDelegates: [
                GrsLocalizationsDelegate(),
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: PermissionGateScreen(),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Verify title & messages render
        expect(find.text('Permissions Required'), findsOneWidget);
        expect(find.text('Notifications & Alerts'), findsOneWidget);
        expect(find.text('Exit Application'), findsOneWidget);
        expect(find.text('Grant Permissions'), findsOneWidget);

        // Tap Grant Permissions button
        await tester.ensureVisible(find.text('Grant Permissions'));
        await tester.tap(find.text('Grant Permissions'));
        await tester.pumpAndSettle();
        expect(mockService.requestPermissionsCalled, isTrue);

        // Tap Exit Application button
        await tester.ensureVisible(find.text('Exit Application'));
        await tester.tap(find.text('Exit Application'));
        await tester.pumpAndSettle();
        expect(mockService.exitAppCalled, isTrue);
      },
    );

    testWidgets(
      'PermissionGateScreen renders Open Device Settings when permanently denied',
      (tester) async {
        final mockService = MockPermissionService(
          mockGranted: false,
          mockPermanentlyDenied: true,
        );

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              permissionServiceProvider.overrideWithValue(mockService),
            ],
            child: const MaterialApp(
              locale: Locale('en'),
              localizationsDelegates: [
                GrsLocalizationsDelegate(),
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: PermissionGateScreen(),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Should show 'Open Device Settings' instead of 'Grant Permissions'
        expect(find.text('Open Device Settings'), findsOneWidget);
        expect(find.text('Grant Permissions'), findsNothing);

        await tester.ensureVisible(find.text('Open Device Settings'));
        await tester.tap(find.text('Open Device Settings'));
        await tester.pumpAndSettle();
        expect(mockService.openSettingsCalled, isTrue);
      },
    );
  });
}
