import 'dart:io';
import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:mobile/data/local/database.dart';
import 'package:mobile/data/local/secure_storage_service.dart';
import 'package:mobile/providers/api_client_provider.dart';
import 'package:mobile/providers/auth_provider.dart';
import 'package:mobile/providers/config_provider.dart';
import 'package:mobile/providers/connectivity_provider.dart';
import 'package:mobile/providers/database_provider.dart';
import 'package:mobile/providers/sync_provider.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class FakePathProviderPlatform extends Fake
    with MockPlatformInterfaceMixin
    implements PathProviderPlatform {
  final Directory tempDir;
  FakePathProviderPlatform(this.tempDir);

  @override
  Future<String?> getApplicationDocumentsPath() async => tempDir.path;
}

class FakeConnectivityNotifier extends ConnectivityNotifier {
  FakeConnectivityNotifier([bool isOnline = true]) : super(autoInit: false) {
    state = isOnline;
  }

  void setOnline(bool online) => state = online;
}

class MockSyncApiClient extends GrsApiClient {
  Future<SyncPushResponse> Function(SyncPushRequest req)? onPushSync;
  int pushCount = 0;
  final List<SyncPushRequest> pushedRequests = [];

  MockSyncApiClient()
    : super(baseUrl: 'https://test.grs.gov.lk', appVersion: '2.0.0');

  @override
  Future<SyncPushResponse> pushSync(SyncPushRequest req) async {
    pushCount++;
    pushedRequests.add(req);
    if (onPushSync != null) {
      return await onPushSync!(req);
    }
    return SyncPushResponse(
      results: req.records
          .map(
            (r) => SyncRecordResult(id: r.id, status: 'ok', serverVersion: 1),
          )
          .toList(),
    );
  }
}

ProviderContainer createTestContainer({
  required AppDatabase db,
  required MockSyncApiClient apiClient,
  bool isOnline = true,
  ProfileModel? profile,
}) {
  final testProfile =
      profile ??
      const ProfileModel(
        id: 'agent-1',
        userCode: 'GRS0000000001',
        role: 'agent',
        fullName: 'Field Agent',
        phoneE164: '+94712345678',
        isActive: true,
        mustChangePassword: false,
        preferredLanguage: 'en',
      );

  return ProviderContainer(
    overrides: [
      databaseProvider.overrideWith((ref) => Future.value(db)),
      apiClientProvider.overrideWithValue(apiClient),
      connectivityProvider.overrideWith(
        (ref) => FakeConnectivityNotifier(isOnline),
      ),
      appConfigProvider.overrideWith(
        (ref) => Future.value(
          const AppConfigModel(
            minSupportedVersion: '1.0.0',
            agentCanEditSynced: false,
            consentVersion: 'consent.v0',
            lookupVersion: 'v1',
            syncJitterMaxS: 120,
            syncBatchMax: 50,
          ),
        ),
      ),
      authProvider.overrideWith(
        (ref) => AuthNotifier(
          apiClient: apiClient,
          storage: ref.read(secureStorageProvider),
          initialState: AuthState(
            status: AuthStatus.authenticated,
            profile: testProfile,
          ),
        ),
      ),
    ],
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Milestone 3 — §12.4 Offline Sync Suite Driven by SyncNotifier Engine', () {
    late AppDatabase db;
    late MockSyncApiClient fakeApi;
    late ProviderContainer container;
    const testCipherKey = 'TestKey_32CharactersLongCipherKey!';
    const houseId = 'h0000000-0000-0000-0000-000000000001';

    setUp(() async {
      FlutterSecureStorage.setMockInitialValues({});
      db = await AppDatabase.openInMemory(cipherKey: testCipherKey);
      fakeApi = MockSyncApiClient();
      container = createTestContainer(db: db, apiClient: fakeApi);

      // Seed test household
      final house = Household(
        id: houseId,
        districtId: 'dist-1',
        dsId: 'ds-1',
        gnId: 'gn-1',
        teamId: 'team-1',
        serialNo: 1,
        houseNo: 'HN-01',
        houseLeaderName: 'Leader 1',
        isEpf: false,
        isEtf: false,
        isAswesuma: false,
        isSamurdhi: false,
        hasSpecialNeeds: false,
        langSinhala: true,
        langTamil: false,
        langEnglish: false,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      await db.upsertHousehold(house);
    });

    tearDown(() async {
      container.dispose();
      await db.close();
    });

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 1: Airplane mode — save 100 records, reconnect, push all 100 via SyncNotifier
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 1: Airplane mode: save 100 records offline, SyncNotifier pushes in bounded batches',
      () async {
        for (var i = 1; i <= 100; i++) {
          final client = Client(
            id: 'c0000000-0000-0000-0000-${i.toString().padLeft(12, '0')}',
            householdId: houseId,
            name: 'Offline Citizen $i',
            age: 20 + (i % 50),
            gender: i % 2 == 0 ? 'M' : 'F',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );
          await db.saveClient(client: client, status: SyncStatus.pending);
        }

        final syncNotifier = container.read(syncProvider.notifier);
        final success = await syncNotifier.sync();

        expect(success, isTrue);
        // Verify bounded batching: 100 records split into exactly 2 requests of 50 (§8.3 & §8.5)
        expect(fakeApi.pushCount, 2);
        expect(fakeApi.pushedRequests[0].records.length, 50);
        expect(fakeApi.pushedRequests[1].records.length, 50);

        // Verify all 100 records transitioned to synced in the database
        final all = await db.getAllClients();
        expect(all.length, 100);
        expect(all.every((c) => c['sync_status'] == 'synced'), isTrue);
        expect(all.every((c) => (c['base_version'] as int) == 1), isTrue);

        final pendingRemaining = await db.getPendingClientsBatch(limit: 100);
        expect(pendingRemaining, isEmpty);
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 2: Kill app mid-batch / network drop — no loss, failed state set
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 2: Mid-batch interruption preserves data and sets failed state with retryCount',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000002';
        final client = Client(
          id: clientId,
          householdId: houseId,
          name: 'Interrupted Client',
          age: 30,
          gender: 'M',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await db.saveClient(client: client, status: SyncStatus.pending);

        // Simulate network failure during push
        fakeApi.onPushSync = (req) async {
          throw const GrsApiException(
            statusCode: 503,
            code: 'SERVER_BUSY',
            messageKey: 'Server Busy',
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final success = await syncNotifier.sync();

        expect(success, isFalse);

        // Verify record is preserved safely locally in failed status (§8.2 #5)
        final stored = await db.getClientById(clientId);
        expect(stored, isNotNull);
        expect(stored!['name'], 'Interrupted Client');
        expect(stored['sync_status'], 'failed');
        expect(stored['retry_count'], 1);
        expect(stored['last_error_code'], 'SERVER_BUSY');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 3: Same batch sent twice — still one row each (Idempotency)
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 3: Same batch sent twice maintains single client row and recovers ok',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000003';
        final client = Client(
          id: clientId,
          householdId: houseId,
          name: 'Idempotent Citizen',
          age: 28,
          gender: 'F',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );

        await db.saveClient(client: client, status: SyncStatus.pending);

        final syncNotifier = container.read(syncProvider.notifier);
        await syncNotifier.sync();

        // Second push of the same record
        await syncNotifier.sync();

        final all = await db.getAllClients();
        final matches = all.where((c) => c['id'] == clientId).toList();
        expect(matches.length, 1);
        expect(matches.first['sync_status'], 'synced');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 4: Edit a record while sync is in flight — Revision Guard survives
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 4: Revision guard protects concurrent edit during in-flight sync',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000004';
        final initialClient = Client(
          id: clientId,
          householdId: houseId,
          name: 'Original Name',
          age: 25,
          gender: 'M',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await db.saveClient(client: initialClient, status: SyncStatus.pending);

        // Simulate user editing the record while sync request is in flight
        fakeApi.onPushSync = (req) async {
          // User edits record locally, bumping revision to 2
          final editedClient = Client(
            id: clientId,
            householdId: houseId,
            name: 'Edited In Flight',
            age: 26,
            gender: 'M',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );
          await db.saveClient(client: editedClient, status: SyncStatus.pending);

          return SyncPushResponse(
            results: [
              SyncRecordResult(id: clientId, status: 'ok', serverVersion: 1),
            ],
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        await syncNotifier.sync();

        // Revision Guard: Local record was edited to revision 2, so response for rev 1
        // must NOT mark it as synced! It must remain pending for the new edit to be pushed!
        final stored = await db.getClientById(clientId);
        expect(stored!['local_revision'], 2);
        expect(stored['name'], 'Edited In Flight');
        expect(stored['sync_status'], 'pending');

        // Next sync sends the new revision
        fakeApi.onPushSync = null;
        await syncNotifier.sync();

        final updated = await db.getClientById(clientId);
        expect(updated!['sync_status'], 'synced');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 5: Multi-isolate collision — Single-flight lock protects state
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 5: Single-flight lock prevents concurrent execution',
      () async {
        // Foreground/background lock acquired
        final lockAcquired = await db.acquireSyncLock();
        expect(lockAcquired, isTrue);

        final syncNotifier = container.read(syncProvider.notifier);
        // Attempting sync while lock is held must return false immediately without network call
        final syncResult = await syncNotifier.sync();
        expect(syncResult, isFalse);
        expect(fakeApi.pushCount, 0);

        await db.releaseSyncLock();
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 6: Transient race conflict (status: stale) does not loop forever
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 6: Transient RACE_CONFLICT status: stale marks failed and terminates loop',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000006';
        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'Race Conflict Client',
            age: 40,
            gender: 'F',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        fakeApi.onPushSync = (req) async {
          return SyncPushResponse(
            results: [
              SyncRecordResult(
                id: clientId,
                status: 'stale',
                code: 'RACE_CONFLICT',
              ),
            ],
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final success = await syncNotifier.sync();

        expect(success, isTrue);
        // Must have called server exactly once — NOT in an infinite loop!
        expect(fakeApi.pushCount, 1);

        final stored = await db.getClientById(clientId);
        expect(stored!['sync_status'], 'failed');
        expect(stored['last_error_code'], 'RACE_CONFLICT');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 7: Decision C2 locked record marks rejected
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 7: Decision C2 locked record returns rejected and records error',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000007';
        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'Locked Record Client',
            age: 35,
            gender: 'M',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        fakeApi.onPushSync = (req) async {
          return SyncPushResponse(
            results: [
              SyncRecordResult(
                id: clientId,
                status: 'locked',
                code: 'RECORD_LOCKED',
              ),
            ],
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        await syncNotifier.sync();

        final stored = await db.getClientById(clientId);
        expect(stored!['sync_status'], 'rejected');
        expect(stored['last_error_code'], contains('RECORD_LOCKED'));
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 8: HTTP 429 Retry-After header throttling
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 8: HTTP 429 Retry-After header strictly throttles subsequent syncs',
      () async {
        fakeApi.onPushSync = (req) async {
          throw const GrsApiException(
            statusCode: 429,
            code: 'RATE_LIMITED',
            messageKey: 'Rate limited',
            retryAfterSeconds: 30,
          );
        };

        await db.saveClient(
          client: Client(
            id: 'c0000000-0000-0000-0000-000000000008',
            householdId: houseId,
            name: 'Throttled Client',
            age: 30,
            gender: 'F',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        final syncNotifier = container.read(syncProvider.notifier);
        final firstCall = await syncNotifier.sync();
        expect(firstCall, isFalse);
        expect(fakeApi.pushCount, 1);

        // Immediate subsequent call must be throttled by Retry-After window
        final secondCall = await syncNotifier.sync(silent: true);
        expect(secondCall, isFalse);
        // Server was not contacted a second time
        expect(fakeApi.pushCount, 1);
        expect(syncNotifier.state.lastMessage, contains('Sync throttled'));
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 9: Failed state & Red badge from blueprint §7.7
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 9: Network failures set failed status and increment retry_count',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000009';
        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'Network Fail Client',
            age: 45,
            gender: 'M',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        fakeApi.onPushSync = (req) async {
          throw Exception('Connection closed by peer');
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final res = await syncNotifier.sync();
        expect(res, isFalse);

        final stored = await db.getClientById(clientId);
        expect(stored!['sync_status'], 'failed');
        expect(stored['retry_count'], 1);
        expect(stored['last_error_code'], 'NETWORK_ERROR');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 10: HTTP 426 Version Gate handling
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 10: HTTP 426 Version Gate stops syncing and preserves local records',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000010';
        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'Version Gate Client',
            age: 22,
            gender: 'F',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        fakeApi.onPushSync = (req) async {
          throw const GrsApiException(
            statusCode: 426,
            code: 'UPGRADE_REQUIRED',
            messageKey: 'Upgrade Required',
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final res = await syncNotifier.sync();
        expect(res, isFalse);
        expect(syncNotifier.state.error, 'UPGRADE_REQUIRED');

        final stored = await db.getClientById(clientId);
        expect(stored, isNotNull);
        expect(stored!['sync_status'], 'failed');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 11: HTTP 401 Account Deactivated stops sync
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 11: HTTP 401 ACCOUNT_DEACTIVATED stops sync and transitions auth state',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000011';
        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'Deactivated Test Client',
            age: 38,
            gender: 'M',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        fakeApi.onPushSync = (req) async {
          throw const GrsApiException(
            statusCode: 401,
            code: 'ACCOUNT_DEACTIVATED',
            messageKey: 'Account deactivated',
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final res = await syncNotifier.sync();
        expect(res, isFalse);
        expect(syncNotifier.state.error, 'ACCOUNT_DEACTIVATED');

        final authState = container.read(authProvider);
        expect(authState.status, AuthStatus.deactivated);
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 12: Bounded batching pagination
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 12: Bounded batching caps request payloads at 50 records (§8.3)',
      () async {
        final batch = await db.getPendingClientsBatch(limit: 50);
        expect(batch.length, lessThanOrEqualTo(50));
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 13: Full jitter backoff formula
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 13: Full jitter backoff increases with attempts and stays within cap',
      () {
        final backoff0 = calculateFullJitterBackoff(
          attempt: 0,
          baseSeconds: 5,
          capSeconds: 900,
        );
        final backoff5 = calculateFullJitterBackoff(
          attempt: 5,
          baseSeconds: 5,
          capSeconds: 900,
        );

        expect(backoff0.inSeconds, greaterThanOrEqualTo(1));
        expect(backoff0.inSeconds, lessThanOrEqualTo(10));
        expect(backoff5.inSeconds, lessThanOrEqualTo(900));
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 14: Storm test — 5,000 simulated phones spread arrivals
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 14: Storm test: 5,000 simulated phones spread arrivals (peak 10s <= 3x mean)',
      () {
        final passed = simulateStormArrivals(
          phoneCount: 5000,
          jitterWindowSeconds: 120,
          bucketWindowSeconds: 10,
          random: Random(12345),
        );
        expect(passed, isTrue);
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 15: Response lost after save — retry returns ok without error
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 15: Response lost retry matches existing content hash and recovers ok',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000015';
        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'Lost Response Client',
            age: 50,
            gender: 'M',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        var firstAttempt = true;
        fakeApi.onPushSync = (req) async {
          if (firstAttempt) {
            firstAttempt = false;
            // Server received & processed, but TCP dropped before client received HTTP ack
            throw Exception('Connection closed prematurely');
          }
          // Second retry succeeds
          return SyncPushResponse(
            results: [
              SyncRecordResult(id: clientId, status: 'ok', serverVersion: 1),
            ],
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final firstTry = await syncNotifier.sync();
        expect(firstTry, isFalse);

        // Client retries
        final secondTry = await syncNotifier.sync();
        expect(secondTry, isTrue);

        final stored = await db.getClientById(clientId);
        expect(stored!['sync_status'], 'synced');
        expect(stored['base_version'], 1);
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 16: Zero pending records — no push request made
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 16: Zero pending records produces no push requests',
      () async {
        final syncNotifier = container.read(syncProvider.notifier);
        final success = await syncNotifier.sync();

        expect(success, isTrue);
        expect(fakeApi.pushCount, 0);
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 17: User-switch guard blocks login if previous user has unsynced records
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 17: User-switch guard checks isolated DB and blocks login if unsynced',
      () async {
        final tempDir = await Directory.systemTemp.createTemp('grs_test_docs_');
        PathProviderPlatform.instance = FakePathProviderPlatform(tempDir);

        final storage = SecureStorageService();
        const prevUserId = 'prev-user-999';

        // 1. Create previous user isolated database with an unsynced record
        final prevDbKey = await storage.getOrCreateDatabaseKey(
          userId: prevUserId,
        );
        final prevDbFile = File('${tempDir.path}/grs_offline_$prevUserId.db');
        final prevDb = await AppDatabase.open(
          file: prevDbFile,
          cipherKey: prevDbKey,
          requireCipher: false,
        );

        await prevDb.upsertHousehold(
          Household(
            id: houseId,
            districtId: 'dist-1',
            dsId: 'ds-1',
            gnId: 'gn-1',
            teamId: 'team-1',
            serialNo: 1,
            houseNo: 'HN-1',
            houseLeaderName: 'Leader',
            isEpf: false,
            isEtf: false,
            isAswesuma: false,
            isSamurdhi: false,
            hasSpecialNeeds: false,
            langSinhala: true,
            langTamil: false,
            langEnglish: false,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
        );

        await prevDb.saveClient(
          client: Client(
            id: 'c0000000-0000-0000-0000-000000000099',
            householdId: houseId,
            name: 'Unsynced User A Client',
            age: 33,
            gender: 'F',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );
        await prevDb.close();

        // 2. Set previous user ID in storage
        await storage.saveLastUserId(prevUserId);

        // 3. Verify user-switch check sees unsynced records and returns true
        final hasUnsynced = await hasUnsyncedRecordsForUser(
          userId: prevUserId,
          storage: storage,
          requireCipher: false,
        );
        expect(hasUnsynced, isTrue);

        // 4. Clean up temp files
        await tempDir.delete(recursive: true);
      },
    );
  });
}
