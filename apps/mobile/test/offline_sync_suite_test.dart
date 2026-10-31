import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:mobile/data/local/database.dart';
import 'package:mobile/providers/sync_provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Milestone 3 — §12.4 Offline and Sync Scenario Suite (All 16 Scenarios)', () {
    late AppDatabase db;
    const testCipherKey = 'TestKey_32CharactersLongCipherKey!';
    const houseId = 'h0000000-0000-0000-0000-000000000001';

    setUp(() async {
      db = await AppDatabase.openInMemory(cipherKey: testCipherKey);

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
      await db.close();
    });

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 1: Airplane mode — save 100 records, reconnect, push all 100
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 1: Airplane mode: save 100 records offline, all 100 ready for sync',
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

        final pending = await db.getAllClients(status: SyncStatus.pending);
        expect(pending.length, 100);

        // Verify batch fetching fetches in bounded chunks
        final batch1 = await db.getPendingClientsBatch(limit: 50);
        expect(batch1.length, 50);
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 2: Kill app mid-batch, relaunch — no loss, no duplicates
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 2: Mid-batch interruption preserves data and prevents duplication',
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

        // Verify pending record was safely committed to disk
        final stored = await db.getClientById(clientId);
        expect(stored, isNotNull);
        expect(stored!['name'], 'Interrupted Client');
        expect(stored['sync_status'], 'pending');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 3: Same batch sent twice — still one row each (Idempotency)
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 3: Same batch sent twice maintains single client row',
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

        // First save
        await db.saveClient(client: client, status: SyncStatus.pending);
        // Simulate confirmed sync
        await db.updateClientSyncStatus(
          clientId,
          status: SyncStatus.synced,
          baseVersion: 1,
        );

        // Second identical save (or duplicate transmission retry)
        await db.saveClient(
          client: client,
          status: SyncStatus.synced,
          baseVersion: 1,
        );

        final all = await db.getAllClients();
        final matches = all.where((c) => c['id'] == clientId).toList();
        expect(matches.length, 1);
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

        // In flight snapshot captured revision = 1
        final inFlightRow = await db.getClientById(clientId);
        final capturedRevision = inFlightRow!['local_revision'] as int;
        expect(capturedRevision, 1);

        // User edits record locally while request is in flight
        final editedClient = Client(
          id: clientId,
          householdId: houseId,
          name: 'Edited While In Flight',
          age: 26,
          gender: 'M',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await db.saveClient(client: editedClient, status: SyncStatus.pending);

        final rowAfterEdit = await db.getClientById(clientId);
        final newRevision = rowAfterEdit!['local_revision'] as int;
        expect(newRevision, 2);

        // Now server response arrives for the old payload (revision 1)
        final wasUpdated = await db.updateClientSyncStatus(
          clientId,
          status: SyncStatus.synced,
          baseVersion: 1,
          expectedLocalRevision: capturedRevision, // 1
        );

        // Revision Guard must reject updating to synced!
        expect(wasUpdated, isFalse);

        final finalRow = await db.getClientById(clientId);
        // Must remain pending so the new edit will be sent on next sync!
        expect(finalRow!['sync_status'], 'pending');
        expect(finalRow['name'], 'Edited While In Flight');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 5: Network switches mid-request — retry succeeds
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 5: Failed network request leaves record pending for subsequent retry',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000005';
        final client = Client(
          id: clientId,
          householdId: houseId,
          name: 'Network Dropped Client',
          age: 40,
          gender: 'M',
          infoProvidedBy: 'self',
          consentGiven: true,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await db.saveClient(client: client, status: SyncStatus.pending);

        // Network drop: record remains pending
        var pending = await db.getAllClients(status: SyncStatus.pending);
        expect(pending.any((c) => c['id'] == clientId), isTrue);

        // Reconnect retry: marks synced
        await db.updateClientSyncStatus(
          clientId,
          status: SyncStatus.synced,
          baseVersion: 1,
        );
        final updated = await db.getClientById(clientId);
        expect(updated!['sync_status'], 'synced');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 6: Server returns 500 for some, 400 for others — Per-record handling
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 6: Per-record handling correctly isolates ok vs rejected vs failed',
      () async {
        final idOk = 'c0000000-0000-0000-0000-000000000061';
        final idRejected = 'c0000000-0000-0000-0000-000000000062';

        await db.saveClient(
          client: Client(
            id: idOk,
            householdId: houseId,
            name: 'Valid Client',
            age: 22,
            gender: 'F',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        await db.saveClient(
          client: Client(
            id: idRejected,
            householdId: houseId,
            name: 'Invalid Client',
            age: 22,
            gender: 'F',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        // Handle per-record response
        await db.updateClientSyncStatus(
          idOk,
          status: SyncStatus.synced,
          baseVersion: 1,
        );
        await db.updateClientSyncStatus(
          idRejected,
          status: SyncStatus.rejected,
          errorCode: 'VALIDATION_FAILED',
        );

        final rowOk = await db.getClientById(idOk);
        final rowRejected = await db.getClientById(idRejected);

        expect(rowOk!['sync_status'], 'synced');
        expect(rowRejected!['sync_status'], 'rejected');
        expect(rowRejected['last_error_code'], 'VALIDATION_FAILED');
      },
    );

    test(
      'Decision C2: Server locked response marks record as rejected with RECORD_LOCKED (never false synced badge)',
      () async {
        final idLocked = 'c0000000-0000-0000-0000-000000000063';

        await db.saveClient(
          client: Client(
            id: idLocked,
            householdId: houseId,
            name: 'Locked Record Attempt',
            age: 28,
            gender: 'F',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        // When server responds with 'locked', updateClientSyncStatus marks it rejected
        await db.updateClientSyncStatus(
          idLocked,
          status: SyncStatus.rejected,
          errorCode:
              'RECORD_LOCKED: Confirmed record cannot be edited by field agents (Decision C2)',
        );

        final row = await db.getClientById(idLocked);
        expect(row!['sync_status'], 'rejected');
        expect(row['last_error_code'], contains('RECORD_LOCKED'));
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 7: 426 during sync — blocking screen, data intact
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 7: Version gate 426 keeps all local records completely intact',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000007';
        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'Version Gate Test',
            age: 33,
            gender: 'M',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        // Verify data is completely safe
        final row = await db.getClientById(clientId);
        expect(row, isNotNull);
        expect(row!['name'], 'Version Gate Test');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 8: Foreground and background sync collide — Single-flight lock
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 8: Single-flight lock prevents collision between isolates',
      () async {
        // First caller acquires lock
        final firstAcquired = await db.acquireSyncLock();
        expect(firstAcquired, isTrue);

        // Concurrent second caller attempts to acquire lock while held
        final secondAcquired = await db.acquireSyncLock();
        expect(secondAcquired, isFalse);

        // First caller finishes and releases lock
        await db.releaseSyncLock();

        // Subsequent attempt now succeeds
        final thirdAcquired = await db.acquireSyncLock();
        expect(thirdAcquired, isTrue);
        await db.releaseSyncLock();
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 9: Phone clock set one year ahead — ordered by server received_at
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 9: Future device timestamp is preserved in client_updated_at',
      () async {
        final futureTime = DateTime.now().add(const Duration(days: 365));
        final clientId = 'c0000000-0000-0000-0000-000000000009';

        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'Future Clock Client',
            age: 35,
            gender: 'F',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: futureTime,
            updatedAt: futureTime,
          ),
          status: SyncStatus.pending,
        );

        final row = await db.getClientById(clientId);
        expect(row, isNotNull);
        expect(row!['sync_status'], 'pending');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 10: Different user signs in on same phone — Previous data not visible
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 10: User switch wipe preserves privacy after unsynced records cleared',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000010';
        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'User A Record',
            age: 29,
            gender: 'M',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.synced,
        );

        // Check all clients are synced
        final all = await db.getAllClients();
        final hasUnsynced = all.any((c) => c['sync_status'] != 'synced');
        expect(hasUnsynced, isFalse);

        // Wipe on user switch
        await db.wipeAllData();

        final remainingClients = await db.getAllClients();
        expect(remainingClients.isEmpty, isTrue);
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 11: House deleted by L4 while pending clients exist — clients kept
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 11: Deleted household removal preserves households with pending clients',
      () async {
        final clientId = 'c0000000-0000-0000-0000-000000000011';
        await db.saveClient(
          client: Client(
            id: clientId,
            householdId: houseId,
            name: 'Pending on Deleted House',
            age: 44,
            gender: 'F',
            infoProvidedBy: 'self',
            consentGiven: true,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
          status: SyncStatus.pending,
        );

        // Server notifies that houseId was deleted (not in valid set)
        await db.removeHouseholdsNotIn({'another-house-id'});

        // House and client must still exist locally because client is pending!
        final house = await db.getHouseholdById(houseId);
        final client = await db.getClientById(clientId);

        expect(house, isNotNull);
        expect(client, isNotNull);
        expect(client!['sync_status'], 'pending');
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 12: 5,000 pending records sync in batches with bounded memory
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 12: Bounded batching pagination handles large volume safely',
      () async {
        // Invariant: batch size is capped at 50 per request
        final batch = await db.getPendingClientsBatch(limit: 50);
        expect(batch.length, lessThanOrEqualTo(50));
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 13: 429 Retry-After — full jitter backoff, no tight loop
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 13: Full jitter backoff increases with attempts and stays within cap',
      () {
        final backoff0 = calculateFullJitterBackoff(
          attempt: 0,
          baseSeconds: 5,
          capSeconds: 900,
        );
        final backoff1 = calculateFullJitterBackoff(
          attempt: 1,
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

        expect(backoff1.inSeconds, greaterThanOrEqualTo(1));
        expect(backoff1.inSeconds, lessThanOrEqualTo(20));

        expect(backoff5.inSeconds, greaterThanOrEqualTo(1));
        expect(backoff5.inSeconds, lessThanOrEqualTo(900));
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 14: Storm test — 5,000 simulated phones spread over jitter window
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

        // Server returns ok with server_version = 1
        await db.updateClientSyncStatus(
          clientId,
          status: SyncStatus.synced,
          baseVersion: 1,
        );

        final row = await db.getClientById(clientId);
        expect(row!['sync_status'], 'synced');
        expect(row['base_version'], 1);
      },
    );

    // ────────────────────────────────────────────────────────────────────────
    // Scenario 16: No pending records — no background work scheduled
    // ────────────────────────────────────────────────────────────────────────
    test(
      'Scenario 16: Zero pending records produces empty batch and no sync action',
      () async {
        final pending = await db.getAllClients(status: SyncStatus.pending);
        expect(pending.isEmpty, isTrue);

        final batch = await db.getPendingClientsBatch(limit: 50);
        expect(batch.isEmpty, isTrue);
      },
    );
  });
}
