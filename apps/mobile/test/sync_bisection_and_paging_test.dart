import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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

class _FakePathProviderPlatform extends Fake
    with MockPlatformInterfaceMixin
    implements PathProviderPlatform {
  final Directory tempDir;
  _FakePathProviderPlatform(this.tempDir);

  @override
  Future<String?> getApplicationDocumentsPath() async => tempDir.path;
}

class _FakeConnectivityNotifier extends ConnectivityNotifier {
  _FakeConnectivityNotifier([bool isOnline = true]) : super(autoInit: false) {
    state = isOnline;
  }
}

class _MockSyncApiClient extends GrsApiClient {
  Future<SyncPushResponse> Function(SyncPushRequest req)? onPushSync;
  Future<Map<String, dynamic>> Function({
    String? since,
    String? cursor,
    int? limit,
  })?
  onGetChanges;
  int pushCount = 0;
  final List<SyncPushRequest> pushedRequests = [];

  _MockSyncApiClient()
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

  @override
  Future<Map<String, dynamic>> getChanges({
    String? since,
    String? cursor,
    int? limit,
  }) async {
    if (onGetChanges != null) {
      return await onGetChanges!(since: since, cursor: cursor, limit: limit);
    }
    return {
      'serverTime': DateTime.now().toIso8601String(),
      'households': [],
      'deletedHouseholds': [],
      'clients': [],
      'hasMore': false,
      'nextCursor': null,
    };
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FlutterSecureStorage.setMockInitialValues({});

  late Directory tempDir;
  late File dbFile;
  late AppDatabase db;
  late _MockSyncApiClient fakeApi;
  late ProviderContainer container;

  const houseId = 'h0000000-0000-0000-0000-000000000001';

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('grs_bisection_test_');
    PathProviderPlatform.instance = _FakePathProviderPlatform(tempDir);

    dbFile = File('${tempDir.path}/test.db');
    db = await AppDatabase.open(
      file: dbFile,
      cipherKey: '0123456789abcdef0123456789abcdef',
      requireCipher: false,
    );

    await db.upsertHousehold(
      Household(
        id: houseId,
        districtId: 'd-1',
        dsId: 'ds-1',
        gnId: 'gn-1',
        teamId: 't-1',
        serialNo: 1,
        houseNo: 'HN-01',
        houseLeaderName: 'Leader 1',
        address: '123 Main St',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
    );

    fakeApi = _MockSyncApiClient();

    const testProfile = ProfileModel(
      id: 'agent-1',
      userCode: 'GRS0000000001',
      role: 'agent',
      fullName: 'Field Agent',
      phoneE164: '+94712345678',
      isActive: true,
      mustChangePassword: false,
      preferredLanguage: 'en',
    );

    container = ProviderContainer(
      overrides: [
        databaseProvider.overrideWith((ref) => Future.value(db)),
        apiClientProvider.overrideWithValue(fakeApi),
        connectivityProvider.overrideWith(
          (ref) => _FakeConnectivityNotifier(true),
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
            apiClient: fakeApi,
            storage: SecureStorageService(),
            initialState: AuthState(
              status: AuthStatus.authenticated,
              profile: testProfile,
              isOffline: false,
            ),
          ),
        ),
      ],
    );
  });

  tearDown(() async {
    container.dispose();
    await db.close();
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('Sync Bisection & Paging Resiliency Tests', () {
    test(
      'Batch bisection isolates a 400 validation error and allows good records to sync',
      () async {
        final goodId1 = 'c0000000-0000-0000-0000-000000000001';
        final badId = 'c0000000-0000-0000-0000-000000000002';
        final goodId2 = 'c0000000-0000-0000-0000-000000000003';

        for (final id in [goodId1, badId, goodId2]) {
          await db.saveClient(
            client: Client(
              id: id,
              householdId: houseId,
              name: 'Client $id',
              age: 25,
              gender: 'M',
              infoProvidedBy: 'self',
              consentGiven: true,
              createdAt: DateTime.now(),
              updatedAt: DateTime.now(),
            ),
            status: SyncStatus.pending,
          );
        }

        // Mock API: if the batch contains badId, reject the whole request with 400 DTO error
        fakeApi.onPushSync = (req) async {
          final containsBad = req.records.any((r) => r.id == badId);
          if (containsBad) {
            throw const GrsApiException(
              statusCode: 400,
              code: 'VALIDATION_FAILED',
              messageKey: 'Invalid phone format in batch',
            );
          }
          return SyncPushResponse(
            results: req.records
                .map(
                  (r) => SyncRecordResult(
                    id: r.id,
                    status: 'ok',
                    serverVersion: 1,
                  ),
                )
                .toList(),
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final success = await syncNotifier.sync();

        expect(success, isTrue);

        // Good records must be synced!
        final storedGood1 = await db.getClientById(goodId1);
        expect(storedGood1!['sync_status'], 'synced');

        final storedGood2 = await db.getClientById(goodId2);
        expect(storedGood2!['sync_status'], 'synced');

        // Bad record must be isolated and marked rejected so it doesn't block sync!
        final storedBad = await db.getClientById(badId);
        expect(storedBad!['sync_status'], 'rejected');
        expect(storedBad['last_error_code'], contains('VALIDATION_FAILED'));
      },
    );

    test(
      'Batch bisection isolates a 500 server crash and allows good records to sync',
      () async {
        final goodId = 'c0000000-0000-0000-0000-000000000004';
        final badId = 'c0000000-0000-0000-0000-000000000005';

        for (final id in [goodId, badId]) {
          await db.saveClient(
            client: Client(
              id: id,
              householdId: houseId,
              name: 'Client $id',
              age: 30,
              gender: 'F',
              infoProvidedBy: 'self',
              consentGiven: true,
              createdAt: DateTime.now(),
              updatedAt: DateTime.now(),
            ),
            status: SyncStatus.pending,
          );
        }

        // Mock API: if batch contains badId, throw 500 server error
        fakeApi.onPushSync = (req) async {
          final containsBad = req.records.any((r) => r.id == badId);
          if (containsBad) {
            throw const GrsApiException(
              statusCode: 500,
              code: 'DATABASE_ERROR',
              messageKey: 'Deadlock in bulk upsert',
            );
          }
          return SyncPushResponse(
            results: req.records
                .map(
                  (r) => SyncRecordResult(
                    id: r.id,
                    status: 'ok',
                    serverVersion: 1,
                  ),
                )
                .toList(),
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final success = await syncNotifier.sync();

        expect(success, isTrue);

        // Good record synced
        final storedGood = await db.getClientById(goodId);
        expect(storedGood!['sync_status'], 'synced');

        // Bad record marked failed with retry count incremented
        final storedBad = await db.getClientById(badId);
        expect(storedBad!['sync_status'], 'failed');
        expect(storedBad['retry_count'], 1);
      },
    );

    test(
      'Records reaching maxRetries (5) transition from failed to rejected',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000006';
        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'Retry Client',
            age: 40,
            gender: 'M',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        // Fail 4 times
        for (var i = 1; i <= 4; i++) {
          await db.markClientsFailed(
            [clientId],
            errorCode: 'TRANSIENT_ERR',
            maxRetries: 5,
          );
          final row = await db.getClientById(clientId);
          expect(row!['sync_status'], 'failed');
          expect(row['retry_count'], i);
        }

        // 5th failure exceeds limit -> transitions to rejected
        await db.markClientsFailed(
          [clientId],
          errorCode: 'TRANSIENT_ERR',
          maxRetries: 5,
        );
        final finalRow = await db.getClientById(clientId);
        expect(finalRow!['sync_status'], 'rejected');
        expect(finalRow['retry_count'], 5);

        // Rejected record must NOT be fetched by getPendingClientsBatch
        final pending = await db.getPendingClientsBatch(limit: 50);
        expect(pending.any((r) => r['id'] == clientId), isFalse);
      },
    );

    test(
      'getChanges pages through multiple delta chunks using cursor and limit',
      () async {
        var pageCount = 0;
        fakeApi.onGetChanges = ({since, cursor, limit}) async {
          pageCount++;
          if (cursor == null) {
            // Page 1
            return {
              'serverTime': '2026-11-01T12:00:00Z',
              'households': [
                {
                  'id': 'h-page-1',
                  'districtId': 'd-1',
                  'dsId': 'ds-1',
                  'gnId': 'gn-1',
                  'teamId': 't-1',
                  'serialNo': 101,
                  'houseNo': 'H-101',
                  'houseLeaderName': 'Page 1 Leader',
                  'address': 'Page 1 House',
                  'createdAt': '2026-11-01T10:00:00Z',
                  'updatedAt': '2026-11-01T10:00:00Z',
                },
              ],
              'deletedHouseholds': [],
              'clients': [],
              'hasMore': true,
              'nextCursor': 'h-page-1',
            };
          } else {
            // Page 2
            return {
              'serverTime': '2026-11-01T12:00:05Z',
              'households': [
                {
                  'id': 'h-page-2',
                  'districtId': 'd-1',
                  'dsId': 'ds-1',
                  'gnId': 'gn-1',
                  'teamId': 't-1',
                  'serialNo': 102,
                  'houseNo': 'H-102',
                  'houseLeaderName': 'Page 2 Leader',
                  'address': 'Page 2 House',
                  'createdAt': '2026-11-01T10:05:00Z',
                  'updatedAt': '2026-11-01T10:05:00Z',
                },
              ],
              'deletedHouseholds': [],
              'clients': [],
              'hasMore': false,
              'nextCursor': null,
            };
          }
        };

        final syncNotifier = container.read(syncProvider.notifier);
        await syncNotifier.pullChanges();

        // Must have fetched exactly 2 pages
        expect(pageCount, 2);

        // Both households must be in local DB
        final h1 = await db.getHouseholdById('h-page-1');
        expect(h1, isNotNull);
        expect(h1!['house_no'], 'H-101');

        final h2 = await db.getHouseholdById('h-page-2');
        expect(h2, isNotNull);
        expect(h2!['house_no'], 'H-102');

        // Last sync time must be updated to final page serverTime
        final savedSyncTime = await db.getMeta('last_sync_time');
        expect(savedSyncTime, '2026-11-01T12:00:05Z');
      },
    );

    test(
      'Systemic 400 (forbidNonWhitelisted) stops bisection and keeps records pending with update app message',
      () async {
        final id1 = 'c0000000-0000-0000-0000-000000000011';
        final id2 = 'c0000000-0000-0000-0000-000000000012';

        for (final id in [id1, id2]) {
          await db.saveClient(
            client: Client(
              id: id,
              householdId: houseId,
              name: 'Client $id',
              age: 28,
              gender: 'M',
              infoProvidedBy: 'self',
              consentGiven: true,
              createdAt: DateTime.now(),
              updatedAt: DateTime.now(),
            ),
            status: SyncStatus.pending,
          );
        }

        // Mock API: server throws systemic 400 (schema mismatch / unknown field)
        fakeApi.onPushSync = (req) async {
          throw const GrsApiException(
            statusCode: 400,
            code: 'BAD_REQUEST',
            messageKey: 'forbidNonWhitelisted: unexpected field in payload',
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final success = await syncNotifier.sync();

        expect(success, isFalse);
        // Only 1 request made - must NOT bisect down to single records
        expect(fakeApi.pushCount, 1);

        // Neither record should be rejected! Both must remain pending with update app message
        final rec1 = await db.getClientById(id1);
        final rec2 = await db.getClientById(id2);

        expect(rec1!['sync_status'], 'pending');
        expect(rec1['last_error_code'], contains('Please update the app'));

        expect(rec2!['sync_status'], 'pending');
        expect(rec2['last_error_code'], contains('Please update the app'));
      },
    );

    test(
      'Server 5xx outage aborts when sibling half also fails, avoiding request amplification',
      () async {
        // Create 8 records
        final ids = List.generate(
          8,
          (i) => 'c0000000-0000-0000-0000-00000000002$i',
        );

        for (final id in ids) {
          await db.saveClient(
            client: Client(
              id: id,
              householdId: houseId,
              name: 'Outage Client $id',
              age: 32,
              gender: 'F',
              infoProvidedBy: 'self',
              consentGiven: true,
              createdAt: DateTime.now(),
              updatedAt: DateTime.now(),
            ),
            status: SyncStatus.pending,
          );
        }

        // Mock API: server is down (500 on all calls)
        fakeApi.pushCount = 0;
        fakeApi.onPushSync = (req) async {
          throw const GrsApiException(
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
            messageKey: 'Server unavailable',
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final success = await syncNotifier.sync();

        expect(success, isFalse);
        // Initial batch (1) + left sibling (1) + right sibling (1) = exactly 3 requests!
        // Does NOT explode into 15+ requests.
        expect(fakeApi.pushCount, 3);

        // Records should not be permanently rejected on initial outage
        final check = await db.getClientById(ids[0]);
        expect(check!['sync_status'], 'failed');
      },
    );

    test(
      'Finished house sync arrives even when pendingRows is empty, and clears pending list on ok',
      () async {
        const houseId = 'house-finish-empty-clients';
        await db.upsertHousehold(
          Household(
            id: houseId,
            districtId: 'd-1',
            dsId: 'ds-1',
            gnId: 'gn-1',
            serialNo: 801,
            houseNo: 'H-801',
            houseLeaderName: 'Leader 801',
            visitStatus: 'in_progress',
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
        );

        // Finish house locally without any pending client records
        await db.markHouseholdCompletedLocally(houseId);
        expect(await db.getPendingFinishedHouseholdIds(), contains(houseId));

        fakeApi.pushCount = 0;
        fakeApi.pushedRequests.clear();
        fakeApi.onPushSync = (req) async {
          expect(req.records, isEmpty);
          expect(req.finishedHouseholdIds, contains(houseId));
          return SyncPushResponse(
            results: const [],
            finishedHouseholds: [
              SyncHouseholdResult(id: houseId, status: 'ok'),
            ],
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        final success = await syncNotifier.sync();

        expect(success, isTrue);
        expect(fakeApi.pushCount, 1);
        expect(await db.getPendingFinishedHouseholdIds(), isEmpty);

        final house = await db.getHouseholdById(houseId);
        expect(house!['status'], 'completed');
      },
    );

    test(
      'Finished house rejected or forbidden by server reverts local status to in_progress',
      () async {
        const houseId = 'house-finish-forbidden';
        await db.upsertHousehold(
          Household(
            id: houseId,
            districtId: 'd-1',
            dsId: 'ds-1',
            gnId: 'gn-1',
            serialNo: 802,
            houseNo: 'H-802',
            houseLeaderName: 'Leader 802',
            visitStatus: 'in_progress',
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
        );

        await db.markHouseholdCompletedLocally(houseId);
        expect(await db.getPendingFinishedHouseholdIds(), contains(houseId));

        fakeApi.pushCount = 0;
        fakeApi.pushedRequests.clear();
        fakeApi.onPushSync = (req) async {
          return SyncPushResponse(
            results: const [],
            finishedHouseholds: [
              SyncHouseholdResult(
                id: houseId,
                status: 'forbidden',
                code: 'OUT_OF_SCOPE_TEAM',
              ),
            ],
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        await syncNotifier.sync();

        // Local status should be reverted back to in_progress
        final house = await db.getHouseholdById(houseId);
        expect(house!['status'], 'in_progress');
        expect(await db.getPendingFinishedHouseholdIds(), isEmpty);
      },
    );

    test(
      'Server omitting finishedHouseholds preserves pending finished IDs',
      () async {
        const houseId = 'house-finish-omitted';
        await db.upsertHousehold(
          Household(
            id: houseId,
            districtId: 'd-1',
            dsId: 'ds-1',
            gnId: 'gn-1',
            serialNo: 803,
            houseNo: 'H-803',
            houseLeaderName: 'Leader 803',
            visitStatus: 'in_progress',
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
        );

        await db.markHouseholdCompletedLocally(houseId);
        expect(await db.getPendingFinishedHouseholdIds(), contains(houseId));

        fakeApi.pushCount = 0;
        fakeApi.pushedRequests.clear();
        fakeApi.onPushSync = (req) async {
          // Server omits finishedHouseholds field completely
          return const SyncPushResponse(
            results: [],
            finishedHouseholds: null,
          );
        };

        final syncNotifier = container.read(syncProvider.notifier);
        await syncNotifier.sync();

        // Pending flag should NOT be removed because server never confirmed it
        expect(await db.getPendingFinishedHouseholdIds(), contains(houseId));
      },
    );
  });
}
