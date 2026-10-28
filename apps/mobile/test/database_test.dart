import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:mobile/data/local/database.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Drift Encrypted Local DB & Key Security Tests (M2.4)', () {
    late Directory tempDir;
    late File dbFile;
    const correctKey = '0123456789abcdef0123456789abcdef';
    const wrongKey = 'fedcba9876543210fedcba9876543210';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('grs_db_test_');
      dbFile = File('${tempDir.path}/grs_test.db');
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('Opening with a wrong key fails safely (M2.4 Done When)', () async {
      // 1. Initialize and populate database with correct key
      final db = await AppDatabase.open(file: dbFile, cipherKey: correctKey);

      final household = Household(
        id: 'h-101',
        districtId: 'dist-1',
        dsId: 'ds-1',
        gnId: 'gn-1',
        serialNo: 101,
        houseNo: '24/B',
        houseLeaderName: 'Wimal Rathnayake',
        isEpf: true,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await db.upsertHousehold(household);
      final initialRows = await db.getHouseholds();
      expect(initialRows.length, equals(1));
      expect(
        initialRows.first['house_leader_name'],
        equals('Wimal Rathnayake'),
      );

      await db.close();

      // 2. Attempt to open the exact same file with an incorrect key
      // MUST throw InvalidDatabaseKeyException and refuse access
      expect(
        () async => await AppDatabase.open(file: dbFile, cipherKey: wrongKey),
        throwsA(isA<InvalidDatabaseKeyException>()),
      );

      // 3. Re-opening with the correct key MUST succeed and verify zero data corruption
      final reOpenedDb = await AppDatabase.open(
        file: dbFile,
        cipherKey: correctKey,
      );
      final retrievedRows = await reOpenedDb.getHouseholds();
      expect(retrievedRows.length, equals(1));
      expect(
        retrievedRows.first['house_leader_name'],
        equals('Wimal Rathnayake'),
      );
      expect(retrievedRows.first['is_epf'], equals(1));

      await reOpenedDb.close();
    });

    test('Client survey CRUD and revision guard', () async {
      final db = await AppDatabase.open(file: dbFile, cipherKey: correctKey);

      final client = Client(
        id: 'c-001',
        householdId: 'h-101',
        name: 'Nimal Rathnayake',
        age: 26,
        gender: 'M',
        phoneRaw: '0771234567',
        phoneE164: '+94771234567',
        highestEducation: 'al_passed',
        futureHopes: ['entrepreneur', 'local_job'],
        infoProvidedBy: 'self',
        consentGiven: true,
        consentAt: DateTime.now(),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      // Save as draft
      await db.saveClient(client: client, status: SyncStatus.draft);

      var saved = await db.getClientById('c-001');
      expect(saved, isNotNull);
      expect(saved!['name'], equals('Nimal Rathnayake'));
      expect(saved['sync_status'], equals('draft'));
      expect(saved['local_revision'], equals(1));

      // Update client to pending
      final updatedClient = Client(
        id: 'c-001',
        householdId: 'h-101',
        name: 'Nimal Rathnayake Updated',
        age: 26,
        gender: 'M',
        highestEducation: 'al_passed',
        futureHopes: ['entrepreneur'],
        infoProvidedBy: 'self',
        consentGiven: true,
        consentAt: DateTime.now(),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await db.saveClient(client: updatedClient, status: SyncStatus.pending);

      saved = await db.getClientById('c-001');
      expect(saved!['name'], equals('Nimal Rathnayake Updated'));
      expect(saved['sync_status'], equals('pending'));
      expect(saved['local_revision'], equals(2));

      // Status query
      final pendingClients = await db.getAllClients(status: SyncStatus.pending);
      expect(pendingClients.length, equals(1));

      final draftClients = await db.getAllClients(status: SyncStatus.draft);
      expect(draftClients.isEmpty, isTrue);

      await db.close();
    });

    test('Lookups storage and category query', () async {
      final db = await AppDatabase.open(file: dbFile, cipherKey: correctKey);

      final lookups = [
        const LookupValueModel(
          category: 'education',
          code: 'ol_passed',
          labelEn: 'O/L Passed',
          labelSi: 'සාමාන්‍ය පෙළ සමත්',
          labelTa: 'சா/த சித்தி',
          sort: 1,
        ),
        const LookupValueModel(
          category: 'education',
          code: 'al_passed',
          labelEn: 'A/L Passed',
          labelSi: 'උසස් පෙළ සමත්',
          labelTa: 'உ/த சித்தி',
          sort: 2,
        ),
      ];

      await db.saveLookups(lookups);

      final retrieved = await db.getLookupsByCategory('education');
      expect(retrieved.length, equals(2));
      expect(retrieved.first.code, equals('ol_passed'));
      expect(retrieved.last.code, equals('al_passed'));

      await db.close();
    });
  });
}
