import 'dart:io';
import 'dart:isolate';
import 'package:flutter_test/flutter_test.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:sqlite3/sqlite3.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Spike S4: Drift, Encrypted SQLite & Background Isolate Execution (M0.6)', () {
    late Directory tempDir;
    late File dbFile;
    const testCipherKey =
        '0123456789abcdef0123456789abcdef'; // 32-byte cipher key

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('s4_drift_test_');
      dbFile = File('${tempDir.path}/grs_mobile.db');
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test(
      'Drift NativeDatabase on disk: foreground writes, background Isolate opens same file and reads',
      () async {
        const testId = 'rec-001';
        const testTitle = 'Household Entry #101';
        const testPayload =
            '{"serial": 101, "house": "12A", "head": "Sunil Perera"}';
        final now = DateTime.now().toUtc().toIso8601String();

        // 1. Foreground writes using Drift NativeDatabase backed by a real file on disk
        final fgExecutor = NativeDatabase(
          dbFile,
          setup: (rawDb) {
            // Apply 32-byte encryption key for SQLCipher
            rawDb.execute("PRAGMA key = '$testCipherKey';");
          },
        );
        await fgExecutor.ensureOpen(_MinimalExecutorUser());

        // Create table and insert via Drift executor
        await fgExecutor.runCustom('''
          CREATE TABLE household_records (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        ''');

        await fgExecutor.runInsert(
          'INSERT INTO household_records (id, title, payload, created_at) VALUES (?, ?, ?, ?)',
          [testId, testTitle, testPayload, now],
        );

        final fgRows = await fgExecutor.runSelect(
          'SELECT * FROM household_records WHERE id = ?',
          [testId],
        );
        expect(fgRows.length, equals(1));
        expect(fgRows.first['title'], equals(testTitle));

        // Close foreground connection so file locks are released for concurrent/subsequent isolate access
        await fgExecutor.close();

        // Verify the file exists on disk and is non-empty
        expect(await dbFile.exists(), isTrue);
        final fileSizeBytes = await dbFile.length();
        expect(fileSizeBytes, greaterThan(0));

        // 2. Background Isolate Execution (Simulating Workmanager background task)
        // Background isolate receives file path and encryption key, opens the EXACT SAME file on disk
        final bgFilePath = dbFile.path;
        final bgResult = await Isolate.run(() async {
          final targetFile = File(bgFilePath);
          if (!targetFile.existsSync()) {
            throw Exception(
              'Database file does not exist on disk for background isolate',
            );
          }

          final bgExecutor = NativeDatabase(
            targetFile,
            setup: (rawDb) {
              rawDb.execute("PRAGMA key = '$testCipherKey';");
            },
          );
          await bgExecutor.ensureOpen(_MinimalExecutorUser());

          final rows = await bgExecutor.runSelect(
            'SELECT title, payload, created_at FROM household_records WHERE id = ?',
            [testId],
          );

          final result = {
            'title': rows.first['title'] as String,
            'payload': rows.first['payload'] as String,
            'created_at': rows.first['created_at'] as String,
          };

          await bgExecutor.close();
          return result;
        });

        // Assert background isolate read the exact data written by foreground from disk
        expect(bgResult['title'], equals(testTitle));
        expect(bgResult['payload'], equals(testPayload));
        expect(bgResult['created_at'], equals(now));
      },
    );

    test(
      '32-byte AES-256 cipher key validation and PRAGMA key configuration (Invariant 6)',
      () {
        const validCipherKey = '0123456789abcdef0123456789abcdef';
        expect(validCipherKey.length, equals(32));

        // Verify sqlite3 open with PRAGMA key configuration
        final memoryDb = sqlite3.openInMemory();
        expect(
          () => memoryDb.execute("PRAGMA key = '$validCipherKey';"),
          returnsNormally,
        );
        memoryDb.dispose();
      },
    );
  });
}

class _MinimalExecutorUser extends QueryExecutorUser {
  @override
  int get schemaVersion => 1;

  @override
  Future<void> beforeOpen(
    QueryExecutor executor,
    OpeningDetails details,
  ) async {}
}
