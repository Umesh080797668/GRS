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

    test('Cipher key validation rejects short keys (< 16 chars)', () async {
      expect(
        () => AppDatabase.open(
          file: dbFile,
          cipherKey: 'short_key',
          requireCipher: false,
        ),
        throwsA(isA<InvalidDatabaseKeyException>()),
      );
    });

    test(
      'Startup security guard: PRAGMA cipher_version check refuses to open unencrypted database when SQLCipher is missing',
      () async {
        // Host SQLite lacks SQLCipher native binaries.
        // Opening with requireCipher: true MUST fail closed and throw SqlCipherNotAvailableException.
        expect(
          () => AppDatabase.open(
            file: dbFile,
            cipherKey: correctKey,
            requireCipher: true,
          ),
          throwsA(isA<SqlCipherNotAvailableException>()),
        );
      },
    );

    test(
      'Opening an unreadable or non-decryptable file throws InvalidDatabaseKeyException (M2.4 Done When)',
      () async {
        // Create a file containing ciphertext/garbage bytes simulating an encrypted database
        // where decryption with the wrong key yields invalid SQLite page headers
        final encryptedFile = File('${tempDir.path}/encrypted_sample.db');
        await encryptedFile.writeAsBytes(
          List.generate(4096, (i) => (i * 7 + 13) % 256),
        );

        expect(
          () async => await AppDatabase.open(
            file: encryptedFile,
            cipherKey: wrongKey,
            requireCipher: false,
          ),
          throwsA(isA<InvalidDatabaseKeyException>()),
        );
      },
    );

    test(
      'Database lifecycle: open, populate, close and re-open (M2.4)',
      () async {
        // 1. Initialize and populate database with correct key
        final db = await AppDatabase.open(
          file: dbFile,
          cipherKey: correctKey,
          requireCipher: false,
        );

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

        await db.upsertHousehold(household, notes: 'Field observation note');
        final initialRows = await db.getHouseholds();
        expect(initialRows.length, equals(1));
        expect(
          initialRows.first['house_leader_name'],
          equals('Wimal Rathnayake'),
        );
        expect(initialRows.first['notes'], equals('Field observation note'));

        await db.close();

        // 2. Re-opening with the valid key MUST succeed and verify zero data corruption
        final reOpenedDb = await AppDatabase.open(
          file: dbFile,
          cipherKey: correctKey,
          requireCipher: false,
        );
        final retrievedRows = await reOpenedDb.getHouseholds();
        expect(retrievedRows.length, equals(1));
        expect(
          retrievedRows.first['house_leader_name'],
          equals('Wimal Rathnayake'),
        );
        expect(retrievedRows.first['is_epf'], equals(1));
        expect(retrievedRows.first['notes'], equals('Field observation note'));

        await reOpenedDb.close();
      },
    );

    test('Client survey CRUD and revision guard', () async {
      final db = await AppDatabase.open(
        file: dbFile,
        cipherKey: correctKey,
        requireCipher: false,
      );

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
      final db = await AppDatabase.open(
        file: dbFile,
        cipherKey: correctKey,
        requireCipher: false,
      );

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
