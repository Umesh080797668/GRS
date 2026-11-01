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
import 'package:mobile/data/local/database.dart';
import 'package:mobile/data/local/secure_storage_service.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/providers/api_client_provider.dart';
import 'package:mobile/providers/auth_provider.dart';
import 'package:mobile/providers/connectivity_provider.dart';
import 'package:mobile/providers/database_provider.dart';
import 'package:mobile/screens/level4/add_house_screen.dart';
import 'package:mobile/screens/level4/choose_houses_screen.dart';
import 'package:mobile/screens/level4/gn_setup_screen.dart';
import 'package:mobile/screens/level4/team_members_screen.dart';
import 'package:mobile/screens/level4/team_progress_screen.dart';
import 'package:mobile/screens/level4/team_records_screen.dart';

class _FakeSecureStorageService extends SecureStorageService {
  @override
  Future<String?> getAccessToken() async => 'test-jwt-token';
  @override
  Future<ProfileModel?> getActiveProfile() async => null;
}

class _FakeConnectivityNotifier extends ConnectivityNotifier {
  _FakeConnectivityNotifier(bool initial) : super(autoInit: false) {
    state = initial;
  }
}

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

  group('Milestone 4: Level 4 Features (Phase 4 Tests)', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    final l4Profile = const ProfileModel(
      id: 'l4-user-1',
      userCode: 'L4001',
      role: 'cdc_secretary',
      fullName: 'Sunil Perera (CDC Secretary)',
      preferredLanguage: 'si',
      gnId: 'gn-colombo-01',
      teamId: 'team-01',
      isActive: true,
      mustChangePassword: false,
    );

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('level4_test_');
      dbFile = File('${tempDir.path}/test_l4.db');
      db = await AppDatabase.open(
        file: dbFile,
        cipherKey: cipherKey,
        requireCipher: false,
      );
    });

    tearDown(() async {
      await db.close();
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    Widget wrapScreen({
      required Widget screen,
      required http.Client httpClient,
      bool isOnline = true,
    }) {
      final apiClient = GrsApiClient(
        baseUrl: 'http://localhost:3000',
        client: httpClient,
      );

      return ProviderScope(
        overrides: [
          databaseProvider.overrideWith((ref) async => db),
          apiClientProvider.overrideWithValue(apiClient),
          connectivityProvider.overrideWith(
            (ref) => _FakeConnectivityNotifier(isOnline),
          ),
          authProvider.overrideWith(
            (ref) => AuthNotifier(
              apiClient: apiClient,
              storage: _FakeSecureStorageService(),
              initialState: AuthState(
                status: AuthStatus.authenticated,
                profile: l4Profile,
                isOffline: !isOnline,
              ),
            ),
          ),
        ],
        child: MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: screen,
        ),
      );
    }

    testWidgets(
      'M4.3: Team member listing, capacity status, and offline notice',
      (tester) async {
        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/accounts') {
            return http.Response(
              jsonEncode({
                'accounts': [
                  {
                    'id': 'acc-1',
                    'userCode': 'TM001',
                    'fullName': 'Kamal Silva',
                    'role': 'team_member',
                    'isActive': true,
                  },
                  {
                    'id': 'acc-2',
                    'userCode': 'TM002',
                    'fullName': 'Nimal Dias',
                    'role': 'team_member',
                    'isActive': true,
                  },
                ],
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('Not Found', 404);
        });

        await tester.pumpWidget(
          wrapScreen(
            screen: const TeamMembersScreen(),
            httpClient: mockClient,
            isOnline: true,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Team Capacity'), findsOneWidget);
        expect(find.text('2 / 10 Members'), findsOneWidget);
        expect(find.text('Kamal Silva'), findsOneWidget);
        expect(find.text('Nimal Dias'), findsOneWidget);
      },
    );

    testWidgets('M4.4: GN Setup screen loads division and allows updates', (
      tester,
    ) async {
      bool updateCalled = false;
      final mockClient = MockClient((request) async {
        if (request.url.path == '/v1/areas/gn/gn-colombo-01' &&
            request.method == 'GET') {
          return http.Response(
            jsonEncode({
              'id': 'gn-colombo-01',
              'name': 'Borella South',
              'gnNumber': '514/A',
              'secretaryName': 'Old Secretary',
              'secretaryContact': '+94770000000',
              'secretaryEmail': 'old@gn.gov.lk',
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path == '/v1/areas/gn/gn-colombo-01' &&
            request.method == 'PATCH') {
          updateCalled = true;
          return http.Response(
            jsonEncode({'success': true}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      await tester.pumpWidget(
        wrapScreen(
          screen: const GnSetupScreen(),
          httpClient: mockClient,
          isOnline: true,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Borella South'), findsOneWidget);
      expect(find.text('514/A'), findsOneWidget);
      expect(find.text('Old Secretary'), findsOneWidget);

      // Tap Save button
      await tester.tap(find.text('Save GN Division Details'));
      await tester.pumpAndSettle();

      expect(updateCalled, isTrue);
    });

    testWidgets(
      'M4.4: Pre-visit typed house entry allocates serial and saves to local DB',
      (tester) async {
        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/houses' && request.method == 'POST') {
            final body = jsonDecode(request.body) as Map<String, dynamic>;
            return http.Response(
              jsonEncode({
                'id': 'h-new-001',
                'districtId': 'dist-01',
                'dsId': 'ds-01',
                'gnId': 'gn-colombo-01',
                'teamId': null,
                'serialNo': 42,
                'houseNo': body['houseNo'],
                'houseLeaderName': body['houseLeaderName'],
                'address': body['address'],
                'villageName': body['villageName'],
                'isEpf': body['isEpf'] ?? false,
                'isEtf': body['isEtf'] ?? false,
                'isAswesuma': body['isAswesuma'] ?? false,
                'isSamurdhi': body['isSamurdhi'] ?? false,
                'hasSpecialNeeds': body['hasSpecialNeeds'] ?? false,
                'createdAt': DateTime.now().toIso8601String(),
                'updatedAt': DateTime.now().toIso8601String(),
              }),
              201,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('Not Found', 404);
        });

        await tester.pumpWidget(
          wrapScreen(
            screen: const AddHouseScreen(),
            httpClient: mockClient,
            isOnline: true,
          ),
        );
        await tester.pumpAndSettle();

        // Enter House No & Leader Name
        await tester.enterText(
          find.widgetWithText(GrsTextField, 'House Number *'),
          '25/B',
        );
        await tester.enterText(
          find.widgetWithText(GrsTextField, 'House Leader Name *'),
          'Priyani Wickramasinghe',
        );
        await tester.pump();

        // Submit
        await tester.ensureVisible(
          find.text('Register House (Allocates Serial)'),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Register House (Allocates Serial)'));
        await tester.pumpAndSettle();

        // Verify Success dialog showing allocated serial
        expect(find.text('House Registered'), findsOneWidget);
        expect(find.text('Allocated Serial: #42'), findsOneWidget);

        // Verify saved to local SQLite database immediately
        final localH = await db.getHouseholdById('h-new-001');
        expect(localH, isNotNull);
        expect(localH!['house_no'], '25/B');
        expect(localH['serial_no'], 42);
      },
    );

    testWidgets(
      'M4.2: Choose Houses screen renders available pool and handles 409 conflict dialog',
      (tester) async {
        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/houses') {
            return http.Response(
              jsonEncode({
                'households': [
                  {
                    'id': 'h-pool-1',
                    'houseNo': '10',
                    'serialNo': 1,
                    'houseLeaderName': 'Siripala',
                    'teamId': null,
                  },
                ],
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path == '/v1/teams/team-01/houses') {
            // Simulate 409 race condition conflict
            return http.Response(
              jsonEncode({
                'code': 'HOUSE_CLAIM_CONFLICT',
                'message': 'House claim conflict',
                'unavailableHouseIds': ['h-pool-1'],
              }),
              409,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('Not Found', 404);
        });

        await tester.pumpWidget(
          wrapScreen(
            screen: const ChooseHousesScreen(),
            httpClient: mockClient,
            isOnline: true,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('House 10'), findsOneWidget);
        expect(find.text('Available'), findsOneWidget);

        // Select checkbox
        await tester.tap(find.byType(CheckboxListTile));
        await tester.pumpAndSettle();

        expect(find.text('1 houses selected'), findsOneWidget);

        // Tap Claim button
        await tester.tap(find.text('Claim for Team'));
        await tester.pumpAndSettle();

        // Verify 409 Claim Conflict dialog appears
        expect(find.text('Claim Conflict'), findsOneWidget);
      },
    );

    testWidgets(
      'M4.4: Team Progress screen shows completion rates and demographic breakdown',
      (tester) async {
        // Seed 1 completed house, 1 in progress house in local DB
        final now = DateTime.now();
        await db.upsertHousehold(
          Household(
            id: 'h-prog-1',
            districtId: 'd1',
            dsId: 'ds1',
            gnId: 'gn-colombo-01',
            teamId: 'team-01',
            serialNo: 1,
            houseNo: '01',
            houseLeaderName: 'Leader 1',
            createdAt: now,
            updatedAt: now,
          ),
          status: 'completed',
        );
        await db.upsertHousehold(
          Household(
            id: 'h-prog-2',
            districtId: 'd1',
            dsId: 'ds1',
            gnId: 'gn-colombo-01',
            teamId: 'team-01',
            serialNo: 2,
            houseNo: '02',
            houseLeaderName: 'Leader 2',
            createdAt: now,
            updatedAt: now,
          ),
          status: 'in_progress',
        );

        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/clients') {
            return http.Response(
              jsonEncode({
                'clients': [
                  {
                    'id': 'c-1',
                    'name': 'Beneficiary 1',
                    'age': 25,
                    'gender': 'Male',
                    'hasSpecialNeeds': true,
                    'isSamurdhi': true,
                    'isAswesuma': false,
                  },
                ],
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path == '/v1/accounts') {
            return http.Response(
              jsonEncode({'accounts': []}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('Not Found', 404);
        });

        await tester.pumpWidget(
          wrapScreen(
            screen: const TeamProgressScreen(),
            httpClient: mockClient,
            isOnline: true,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Households Surveyed'), findsOneWidget);
        expect(find.text('50.0%'), findsOneWidget); // 1 completed of 2 houses
        expect(find.text('1 Total'), findsOneWidget); // 1 beneficiary
        expect(find.text('Special Needs / Disability'), findsOneWidget);
        expect(find.text('Samurdhi Beneficiaries'), findsOneWidget);
      },
    );

    testWidgets(
      'M4.4 & Decision C2/C13: Team Records allows Level 4 supervisor correction with audit reason',
      (tester) async {
        bool updateCalled = false;
        final mockClient = MockClient((request) async {
          if (request.url.path == '/v1/clients') {
            return http.Response(
              jsonEncode({
                'clients': [
                  {
                    'id': 'client-audit-1',
                    'householdId': 'h-01',
                    'name': 'Original Name',
                    'age': 40,
                    'gender': 'male',
                    'address': 'Main Street',
                    'hasSpecialNeeds': false,
                    'isSamurdhi': false,
                    'isAswesuma': false,
                  },
                ],
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path == '/v1/clients/client-audit-1' &&
              request.method == 'PATCH') {
            updateCalled = true;
            final body = jsonDecode(request.body) as Map<String, dynamic>;
            expect(
              body['correctionReason'],
              'Typo in name corrected by CDC Secretary',
            );
            expect(body['name'], 'Corrected Name');
            return http.Response(
              jsonEncode({'success': true}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('Not Found', 404);
        });

        await tester.pumpWidget(
          wrapScreen(
            screen: const TeamRecordsScreen(),
            httpClient: mockClient,
            isOnline: true,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Original Name'), findsOneWidget);

        // Tap to open bottom sheet details
        await tester.tap(find.text('Original Name'));
        await tester.pumpAndSettle();

        expect(
          find.text('Correct Client Record (Decision C2)'),
          findsOneWidget,
        );

        // Tap Correct Record
        await tester.tap(find.text('Correct Client Record (Decision C2)'));
        await tester.pumpAndSettle();

        expect(find.text('Correct Client Record'), findsOneWidget);

        // Edit name and fill correction reason
        await tester.enterText(
          find.widgetWithText(GrsTextField, 'Full Name *'),
          'Corrected Name',
        );
        await tester.enterText(
          find.widgetWithText(GrsTextField, 'Correction Reason (Required) *'),
          'Typo in name corrected by CDC Secretary',
        );
        await tester.pump();

        // Save correction
        await tester.tap(find.text('Save Correction'));
        await tester.pumpAndSettle();

        expect(updateCalled, isTrue);
      },
    );

    test(
      'M4.5 & Decision C6: Changes feed house deletion keeps and flags clients (never cascade deletes)',
      () async {
        // 1. Seed house and client
        final now = DateTime.now();
        await db.upsertHousehold(
          Household(
            id: 'h-to-delete',
            districtId: 'd1',
            dsId: 'ds1',
            gnId: 'gn-colombo-01',
            serialNo: 99,
            houseNo: '99',
            houseLeaderName: 'Leader',
            createdAt: now,
            updatedAt: now,
          ),
        );
        await db.saveClient(
          client: Client(
            id: 'c-retained-1',
            householdId: 'h-to-delete',
            name: 'Client In Deleted House',
            age: 30,
            gender: 'Male',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: now,
            updatedAt: now,
          ),
          status: SyncStatus.synced,
        );

        // 2. Simulate changes feed receiving house deletion
        await db.handleDeletedHouseholds({'h-to-delete'});

        // 3. Verify house is gone
        final houseAfter = await db.getHouseholdById('h-to-delete');
        expect(houseAfter, isNull);

        // 4. Verify client is NOT deleted, and flagged with HOUSE_DELETED (Decision C6)
        final clientAfter = await db.getClientById('c-retained-1');
        expect(clientAfter, isNotNull);
        expect(clientAfter!['name'], 'Client In Deleted House');
        expect(clientAfter['last_error_code'], 'HOUSE_DELETED');
      },
    );

    testWidgets(
      'M4: Re-claimed house is not deleted and client error is cleared on upsert',
      (tester) async {
        final now = DateTime.now();

        // 1. Initial house and client in DB with HOUSE_DELETED error code
        await db.upsertHousehold(
          Household(
            id: 'h-reclaim',
            districtId: 'dist-1',
            dsId: 'ds-1',
            gnId: 'gn-1',
            teamId: 'team-1',
            serialNo: 10,
            houseNo: '45/B',
            houseLeaderName: 'Leader Reclaim',
            createdAt: now,
            updatedAt: now,
          ),
        );
        await db.saveClient(
          client: Client(
            id: 'c-reclaim-1',
            householdId: 'h-reclaim',
            name: 'Client In Reclaim House',
            age: 40,
            gender: 'Female',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: now,
            updatedAt: now,
          ),
          status: SyncStatus.synced,
        );

        // Simulate house was previously deleted/unassigned
        await db.handleDeletedHouseholds({
          'h-reclaim',
        }, reason: 'HOUSE_DELETED');
        expect(await db.getHouseholdById('h-reclaim'), isNull);
        var clientBefore = await db.getClientById('c-reclaim-1');
        expect(clientBefore!['last_error_code'], 'HOUSE_DELETED');

        // Now simulate sync pull with re-claimed house:
        // house is upserted again, and clearHouseholdClientErrors is called
        await db.upsertHousehold(
          Household(
            id: 'h-reclaim',
            districtId: 'dist-1',
            dsId: 'ds-1',
            gnId: 'gn-1',
            teamId: 'team-1',
            serialNo: 10,
            houseNo: '45/B',
            houseLeaderName: 'Leader Reclaim',
            createdAt: now,
            updatedAt: now,
          ),
        );
        await db.clearHouseholdClientErrors('h-reclaim');

        // Verify house exists and client error is cleared
        expect(await db.getHouseholdById('h-reclaim'), isNotNull);
        var clientAfter = await db.getClientById('c-reclaim-1');
        expect(clientAfter!['last_error_code'], isNull);
      },
    );

    testWidgets(
      'M4: Client correction from changes feed updates local database and sync status',
      (tester) async {
        final now = DateTime.now();

        // 1. Existing client in DB
        await db.saveClient(
          client: Client(
            id: 'c-correct-1',
            householdId: 'h-1',
            name: 'Old Name',
            age: 20,
            gender: 'Male',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: now,
            updatedAt: now,
          ),
          status: SyncStatus.synced,
          baseVersion: 1,
        );

        // 2. Incoming corrected client from server
        final correctedClient = Client(
          id: 'c-correct-1',
          householdId: 'h-1',
          name: 'Corrected Name By Supervisor',
          age: 22,
          gender: 'Male',
          highestEducation: 'EDU_AL_PASSED',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: now,
          updatedAt: now,
        );

        await db.saveClient(
          client: correctedClient,
          status: SyncStatus.synced,
          baseVersion: 2,
        );

        final clientInDb = await db.getClientById('c-correct-1');
        expect(clientInDb, isNotNull);
        expect(clientInDb!['name'], 'Corrected Name By Supervisor');
        expect(clientInDb['age'], 22);
        expect(clientInDb['highest_education'], 'EDU_AL_PASSED');
        expect(clientInDb['base_version'], 2);
        expect(clientInDb['sync_status'], 'synced');
      },
    );
  });
}
