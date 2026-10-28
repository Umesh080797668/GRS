// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:grs_core/grs_core.dart';
import 'package:mobile/data/local/database.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'M2.4 / S4 Physical Device Verification: Native SQLCipher encryption on Android device',
    (WidgetTester tester) async {
      final docDir = await getApplicationDocumentsDirectory();
      final dbFile = File('${docDir.path}/sqlcipher_device_verified.db');

      if (await dbFile.exists()) {
        await dbFile.delete();
      }

      const correctKey = '0123456789abcdef0123456789abcdef';
      const wrongKey = 'fedcba9876543210fedcba9876543210';

      // 1. Open database with requireCipher: true on native Android
      final db = await AppDatabase.open(
        file: dbFile,
        cipherKey: correctKey,
        requireCipher: true,
      );

      // Verify PRAGMA cipher_version returned a non-empty native SQLCipher version string
      final version = db.cipherVersion;
      print('====================================================');
      print('NATIVE SQLCIPHER VERIFICATION ON ANDROID DEVICE');
      print(
        'Device Platform:       ${Platform.operatingSystem} ${Platform.operatingSystemVersion}',
      );
      print('PRAGMA cipher_version: $version');
      print('isEncrypted:           ${db.isEncrypted}');
      print('Database Path:         ${dbFile.path}');
      print('====================================================');

      expect(version, isNotNull);
      expect(version!.trim(), isNotEmpty);
      expect(db.isEncrypted, isTrue);

      // 2. Insert sensitive record into encrypted database
      final household = Household(
        id: 'h-dev-001',
        districtId: 'dist-01',
        dsId: 'ds-01',
        gnId: 'gn-01',
        serialNo: 1,
        houseNo: 'DEV-HN-01',
        houseLeaderName: 'Bandara Wickramasinghe',
        address: 'No 45, Temple Road, Colombo',
        isEpf: true,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await db.upsertHousehold(household, notes: 'Encrypted field observation');

      final client = Client(
        id: 'c-dev-001',
        householdId: 'h-dev-001',
        name: 'Kasun Wickramasinghe',
        age: 29,
        gender: 'M',
        phoneRaw: '0779998877',
        phoneE164: '+94779998877',
        highestEducation: 'degree',
        futureHopes: ['entrepreneur'],
        infoProvidedBy: 'self',
        consentGiven: true,
        consentAt: DateTime.now(),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await db.saveClient(client: client, status: SyncStatus.pending);

      // Verify records are present in active session
      final houses = await db.getHouseholds();
      expect(houses.length, equals(1));

      // Close the database to flush pages to disk
      await db.close();

      // 3. Inspect raw physical bytes on disk
      expect(await dbFile.exists(), isTrue);
      final rawBytes = await dbFile.readAsBytes();
      print('Physical DB File Size on Disk: ${rawBytes.length} bytes');
      expect(rawBytes.length, greaterThan(0));

      // SQLite unencrypted files ALWAYS begin with the magic 16-byte ASCII header: "SQLite format 3\0"
      final fileHeader = ascii.decode(
        rawBytes.take(16).toList(),
        allowInvalid: true,
      );
      print('First 16 raw disk bytes (decoded): "$fileHeader"');
      expect(
        fileHeader.contains('SQLite format 3'),
        isFalse,
        reason:
            'Raw database on disk MUST be ciphertext and MUST NOT contain standard SQLite plaintext header!',
      );

      // 4. Opening with WRONG key MUST safely fail and reject access
      print('Testing database open with invalid cipher key...');
      bool wrongKeyRejected = false;
      try {
        final badDb = await AppDatabase.open(
          file: dbFile,
          cipherKey: wrongKey,
          requireCipher: true,
        );
        await badDb.close();
      } on InvalidDatabaseKeyException catch (e) {
        wrongKeyRejected = true;
        print(
          'Wrong key correctly rejected with InvalidDatabaseKeyException: $e',
        );
      } catch (e) {
        print('Wrong key threw error: $e');
        if (e.toString().toLowerCase().contains('database') ||
            e.toString().toLowerCase().contains('cipher')) {
          wrongKeyRejected = true;
        }
      }
      expect(
        wrongKeyRejected,
        isTrue,
        reason:
            'Database open with wrong key must fail and throw InvalidDatabaseKeyException',
      );

      // 5. Re-opening with CORRECT key succeeds and reads back plain records
      print('Re-opening database with correct key...');
      final reOpenedDb = await AppDatabase.open(
        file: dbFile,
        cipherKey: correctKey,
        requireCipher: true,
      );
      print(
        'Database re-opened successfully with correct key! Verifying records...',
      );

      expect(reOpenedDb.cipherVersion, equals(version));
      final reloadedClients = await reOpenedDb.getAllClients();
      expect(reloadedClients.length, equals(1));
      expect(reloadedClients.first['name'], equals('Kasun Wickramasinghe'));
      expect(reloadedClients.first['phone_e164'], equals('+94779998877'));

      await reOpenedDb.close();

      // Clean up
      if (await dbFile.exists()) {
        await dbFile.delete();
      }
      print(
        'DEVICE SQLCIPHER VERIFICATION: ALL INVARIANTS PASSED SUCCESSFULLY!',
      );
    },
  );
}
