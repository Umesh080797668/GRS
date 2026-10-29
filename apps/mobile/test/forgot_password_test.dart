import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:grs_ui/grs_ui.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/providers/api_client_provider.dart';
import 'package:mobile/screens/auth/forgot_password_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    final enFile = File('lib/l10n/app_en.arb');
    if (enFile.existsSync()) {
      final json =
          jsonDecode(enFile.readAsStringSync()) as Map<String, dynamic>;
      final map = json.map((k, v) => MapEntry(k, v.toString()));
      GrsL10n.setCache('en', map);
    }
  });

  group('Forgot & Reset Password Flow Tests (M2.5)', () {
    testWidgets(
      'Forgot password step 1 sends email code, step 2 resets password',
      (WidgetTester tester) async {
        int forgotCalls = 0;
        int resetCalls = 0;

        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/auth/forgot') {
            forgotCalls++;
            final body = jsonDecode(request.body) as Map<String, dynamic>;
            expect(body['email'], equals('verified@example.com'));
            return http.Response(jsonEncode({'message': 'Code sent'}), 200);
          }
          if (request.url.path == '/v1/auth/reset') {
            resetCalls++;
            final body = jsonDecode(request.body) as Map<String, dynamic>;
            expect(body['email'], equals('verified@example.com'));
            expect(body['code'], equals('654321'));
            expect(body['newPassword'], equals('NewStrongPass123!'));
            return http.Response(
              jsonEncode({'message': 'Password reset successful'}),
              200,
            );
          }
          return http.Response('Not Found', 404);
        });

        final fakeApiClient = GrsApiClient(
          baseUrl: 'http://localhost:3000',
          client: mockClient,
        );

        tester.view.physicalSize = const Size(600, 1000);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(
          ProviderScope(
            overrides: [apiClientProvider.overrideWithValue(fakeApiClient)],
            child: const MaterialApp(
              locale: Locale('en'),
              localizationsDelegates: [
                GrsLocalizationsDelegate(),
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: ForgotPasswordScreen(),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Step 1: Input email
        expect(find.text('Forgot Password'), findsWidgets);
        final emailField = find.byType(TextFormField).first;
        await tester.enterText(emailField, 'verified@example.com');
        await tester.pump();

        // Tap Send Reset Instructions
        final sendButton = find.widgetWithText(
          GrsButton,
          'Send Reset Instructions',
        );
        expect(sendButton, findsOneWidget);
        await tester.tap(sendButton);
        await tester.pumpAndSettle();

        expect(forgotCalls, equals(1));

        // Step 2: Input code and new password
        expect(find.text('Reset Password'), findsWidgets);
        final codeField = find.byType(TextFormField).first;
        final passField = find.byType(TextFormField).at(1);

        await tester.enterText(codeField, '654321');
        await tester.enterText(passField, 'NewStrongPass123!');
        await tester.pump();

        final resetButton = find.widgetWithText(
          GrsButton,
          'Reset Password & Log In',
        );
        expect(resetButton, findsOneWidget);
        await tester.tap(resetButton);
        await tester.pumpAndSettle();

        expect(resetCalls, equals(1));
      },
    );

    testWidgets(
      'Contact Admin button opens dialog for accounts without verified email',
      (WidgetTester tester) async {
        tester.view.physicalSize = const Size(600, 1000);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(
          const ProviderScope(
            child: MaterialApp(
              locale: Locale('en'),
              localizationsDelegates: [
                GrsLocalizationsDelegate(),
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: ForgotPasswordScreen(),
            ),
          ),
        );

        await tester.pumpAndSettle();

        final adminButton = find.widgetWithText(
          OutlinedButton,
          'Contact Admin',
        );
        expect(adminButton, findsOneWidget);
        await tester.tap(adminButton);
        await tester.pumpAndSettle();

        // Dialog opened
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(
          find.descendant(
            of: find.byType(AlertDialog),
            matching: find.text(
              'If you have registered a verified email, enter it below to receive a password reset link. Otherwise, contact your Level 4 Team Leader or Level 00 Admin to reissue your credentials.',
            ),
          ),
          findsOneWidget,
        );
      },
    );
  });
}
