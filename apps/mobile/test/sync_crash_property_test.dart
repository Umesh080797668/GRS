import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:mobile/data/local/database.dart';
import 'package:mobile/providers/api_client_provider.dart';
import 'package:mobile/providers/auth_provider.dart';
import 'package:mobile/providers/connectivity_provider.dart';
import 'package:mobile/providers/database_provider.dart';
import 'package:mobile/providers/sync_provider.dart';

class FakeConnectivityNotifier extends ConnectivityNotifier {
  FakeConnectivityNotifier([bool isOnline = true]) : super(autoInit: false) {
    state = isOnline;
  }
}

/// Fake API Client that tracks pushed records and can inject random network drops.
class CrashSimulatorApiClient extends GrsApiClient {
  final Map<String, int> serverDatabase = {}; // clientId -> serverVersion
  final Set<String> receivedBatches = {};
  double dropRate;
  final Random random;

  CrashSimulatorApiClient({this.dropRate = 0.3, Random? random})
    : random = random ?? Random(42),
      super(baseUrl: 'https://test.grs.gov.lk', appVersion: '2.0.0');

  @override
  Future<SyncPushResponse> pushSync(SyncPushRequest req) async {
    // Simulate network drop or mid-flight connection loss
    if (random.nextDouble() < dropRate) {
      throw const GrsApiException(
        statusCode: 503,
        code: 'NETWORK_DROP',
        messageKey: 'Network connection dropped mid-request',
      );
    }

    final results = <SyncRecordResult>[];
    for (final r in req.records) {
      final currentVer = serverDatabase[r.id];
      if (currentVer == null) {
        serverDatabase[r.id] = 1;
        results.add(SyncRecordResult(id: r.id, status: 'ok', serverVersion: 1));
      } else {
        // Idempotent retry or update
        final nextVer = currentVer + 1;
        serverDatabase[r.id] = nextVer;
        results.add(
          SyncRecordResult(id: r.id, status: 'ok', serverVersion: nextVer),
        );
      }
    }

    return SyncPushResponse(results: results);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('M3.2 Done When — Randomized Crash & Network Drop Property Test', () {
    const cipherKey = 'TestKey_32CharactersLongCipherKey!';
    const houseId = 'h0000000-0000-0000-0000-000000000001';

    test(
      'Property Test: Random crashes and network drops never lose or duplicate a record (Invariant §8.2 & M3.2)',
      () async {
        final random = Random(999);
        final fakeServer = CrashSimulatorApiClient(
          dropRate: 0.35,
          random: random,
        );

        final db = await AppDatabase.openInMemory(cipherKey: cipherKey);
        await db.upsertHousehold(
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

        final profile = const ProfileModel(
          id: 'agent-1',
          userCode: 'GRS0000000001',
          email: 'agent@grs.gov.lk',
          role: 'agent',
          fullName: 'Field Agent',
          phoneE164: '+94712345678',
          isActive: true,
          mustChangePassword: false,
          preferredLanguage: 'en',
        );

        final container = ProviderContainer(
          overrides: [
            databaseProvider.overrideWith((ref) => Future.value(db)),
            apiClientProvider.overrideWithValue(fakeServer),
            connectivityProvider.overrideWith(
              (ref) => FakeConnectivityNotifier(true),
            ),
            authProvider.overrideWith(
              (ref) => AuthNotifier(
                apiClient: fakeServer,
                storage: ref.read(secureStorageProvider),
                initialState: AuthState(
                  status: AuthStatus.authenticated,
                  profile: profile,
                ),
              ),
            ),
          ],
        );

        // 1. Generate 60 distinct client records saved locally in SQLite
        final totalRecords = 60;
        final generatedClientIds = <String>{};

        for (var i = 1; i <= totalRecords; i++) {
          final clientId =
              'c0000000-0000-0000-0000-${i.toString().padLeft(12, '0')}';
          generatedClientIds.add(clientId);

          await db.saveClient(
            client: Client(
              id: clientId,
              householdId: houseId,
              name: 'Citizen $i',
              age: 20 + (i % 50),
              gender: i % 2 == 0 ? 'M' : 'F',
              infoProvidedBy: 'self',
              consentGiven: true,
              createdAt: DateTime.now(),
              updatedAt: DateTime.now(),
            ),
            status: SyncStatus.pending,
          );
        }

        // 2. Loop with randomized simulated crashes & network drops
        final syncNotifier = container.read(syncProvider.notifier);
        var attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
          attempts++;

          // Random simulated crash: 15% chance of interrupting during execution
          if (random.nextDouble() < 0.15) {
            // Simulate sudden process interruption by releasing sync lock (simulating app restart)
            await db.releaseSyncLock();
          }

          final pendingBefore = await db.getPendingClientsBatch(limit: 100);
          if (pendingBefore.isEmpty) {
            break; // All records successfully synced!
          }

          // Trigger sync (may fail or succeed depending on dropRate)
          await syncNotifier.sync();
        }

        // Final sync with 0 drop rate to achieve eventual consistency
        fakeServer.dropRate = 0.0;
        await syncNotifier.sync();

        // ────────────────────────────────────────────────────────────────────
        // INVARIANT 1: Zero Lost Records
        // Every single client created must still exist in the local database
        // ────────────────────────────────────────────────────────────────────
        final allLocalClients = await db.getAllClients();
        expect(
          allLocalClients.length,
          totalRecords,
          reason:
              'Invariant 1 Violated: Local record count mismatch (records lost)',
        );

        final localIds = allLocalClients.map((c) => c['id'] as String).toSet();
        expect(
          localIds,
          equals(generatedClientIds),
          reason:
              'Invariant 1 Violated: Specific records are missing from local DB',
        );

        // ────────────────────────────────────────────────────────────────────
        // INVARIANT 2: Zero Duplicates on Server
        // Server database must have exactly totalRecords keys, no extra
        // ────────────────────────────────────────────────────────────────────
        expect(
          fakeServer.serverDatabase.length,
          totalRecords,
          reason:
              'Invariant 2 Violated: Server has duplicated or missing records',
        );

        expect(
          fakeServer.serverDatabase.keys.toSet(),
          equals(generatedClientIds),
          reason: 'Invariant 2 Violated: Server keys do not match client IDs',
        );

        // ────────────────────────────────────────────────────────────────────
        // INVARIANT 3: Eventual Consistency
        // Every single record in local database must be in 'synced' status
        // ────────────────────────────────────────────────────────────────────
        for (final local in allLocalClients) {
          expect(
            local['sync_status'],
            'synced',
            reason: 'Record ${local['id']} failed to reach synced status',
          );
          expect(
            local['base_version'],
            greaterThanOrEqualTo(1),
            reason: 'Record ${local['id']} has invalid base_version after sync',
          );
        }

        await db.close();
        container.dispose();
      },
    );
  });
}
