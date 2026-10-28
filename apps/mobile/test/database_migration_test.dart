import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:mobile/data/local/database.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Drift Versioned Schema Migration Tests (M2.4)', () {
    late Directory tempDir;
    late File dbFile;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('db_migration_test_');
      dbFile = File('${tempDir.path}/migration_test.db');
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test(
      'Migrates from Schema v1 to Schema v2 with full data preservation',
      () async {
        // 1. Initialize database with Schema Version 1
        final dbV1 = await AppDatabase.open(
          file: dbFile,
          cipherKey: cipherKey,
          targetSchemaVersion: 1,
          requireCipher: false,
        );

        final v1Version = await dbV1.getSchemaVersion();
        expect(v1Version, equals(1));

        // Insert test household and client under Schema v1
        final household = Household(
          id: 'h-v1-001',
          districtId: 'dist-colombo',
          dsId: 'ds-colombo',
          gnId: 'gn-01',
          serialNo: 1,
          houseNo: '10A',
          houseLeaderName: 'Kamal Perera',
          isEpf: true,
          isAswesuma: false,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await dbV1.upsertHousehold(household);

        final client = Client(
          id: 'c-v1-001',
          householdId: 'h-v1-001',
          name: 'Sunil Perera',
          age: 30,
          gender: 'M',
          highestEducation: 'degree',
          futureHopes: ['entrepreneur'],
          infoProvidedBy: 'self',
          consentGiven: true,
          consentAt: DateTime.now(),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await dbV1.saveClient(client: client, status: SyncStatus.pending);

        await dbV1.setMeta('pilot_area', 'Colombo-05');

        final v1Houses = await dbV1.getHouseholds();
        expect(v1Houses.length, equals(1));
        expect(v1Houses.first['house_leader_name'], equals('Kamal Perera'));

        // Close v1 database
        await dbV1.close();

        // 2. Open database with Schema Version 2 (triggers migration adding 'notes' column)
        final dbV2 = await AppDatabase.open(
          file: dbFile,
          cipherKey: cipherKey,
          targetSchemaVersion: 2,
          requireCipher: false,
        );

        final v2Version = await dbV2.getSchemaVersion();
        expect(v2Version, equals(2));

        // Verify pre-existing v1 data is 100% preserved
        final v2Houses = await dbV2.getHouseholds();
        expect(v2Houses.length, equals(1));
        expect(v2Houses.first['id'], equals('h-v1-001'));
        expect(v2Houses.first['house_leader_name'], equals('Kamal Perera'));
        // In migrated row, new column notes defaults to null
        expect(v2Houses.first['notes'], isNull);

        final v2Clients = await dbV2.getAllClients();
        expect(v2Clients.length, equals(1));
        expect(v2Clients.first['name'], equals('Sunil Perera'));

        final metaValue = await dbV2.getMeta('pilot_area');
        expect(metaValue, equals('Colombo-05'));

        // Verify that the new Schema v2 'notes' column is fully operational
        await dbV2.upsertHousehold(
          household,
          notes: 'Follow up required during afternoon visit',
        );

        final updatedHouses = await dbV2.getHouseholds();
        expect(
          updatedHouses.first['notes'],
          equals('Follow up required during afternoon visit'),
        );

        await dbV2.close();
      },
    );
  });
}
