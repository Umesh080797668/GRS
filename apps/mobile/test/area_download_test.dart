import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:grs_core/grs_core.dart';
import 'package:mobile/data/local/database.dart';
import 'package:mobile/data/sync/area_download_service.dart';

class MockGrsApiClient extends GrsApiClient {
  final List<AreaDownloadResponse> responses;
  final List<String?> receivedCursors = [];
  int callIndex = 0;
  bool shouldThrow = false;

  MockGrsApiClient({required this.responses})
    : super(baseUrl: 'http://mock.local');

  @override
  Future<AreaDownloadResponse> downloadArea({
    String? cursor,
    int limit = 500,
  }) async {
    receivedCursors.add(cursor);
    if (shouldThrow) {
      throw Exception('Network connection lost during download');
    }
    if (callIndex < responses.length) {
      final resp = responses[callIndex];
      callIndex++;
      return resp;
    }
    throw Exception('Simulated network interruption on subsequent page');
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AreaDownloadService Paged & Resumable Download Tests (M2.7)', () {
    late Directory tempDir;
    late File dbFile;
    late AppDatabase db;
    const cipherKey = '0123456789abcdef0123456789abcdef';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('area_download_test_');
      dbFile = File('${tempDir.path}/test_area.db');
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

    Household makeHousehold(int i) {
      return Household(
        id: 'house-$i',
        districtId: 'dist-1',
        dsId: 'ds-1',
        gnId: 'gn-1',
        serialNo: i,
        houseNo: 'HN-$i',
        houseLeaderName: 'Leader #$i',
        villageName: 'Village A',
        isEpf: false,
        isAswesuma: false,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
    }

    test(
      'Downloads multi-page area data and stores households & lookups',
      () async {
        final page1Houses = List.generate(5, (i) => makeHousehold(i + 1));
        final page2Houses = List.generate(5, (i) => makeHousehold(i + 6));

        final mockApi = MockGrsApiClient(
          responses: [
            AreaDownloadResponse(
              items: page1Houses,
              nextCursor: 'cursor-page-2',
              hasMore: true,
              total: 10,
              lookups: {
                'districts': [
                  {
                    'category': 'districts',
                    'code': 'colombo',
                    'nameEn': 'Colombo',
                    'nameSi': 'කොළඹ',
                    'nameTa': 'கொழும்பு',
                  },
                ],
              },
            ),
            AreaDownloadResponse(
              items: page2Houses,
              nextCursor: null,
              hasMore: false,
              total: 10,
            ),
          ],
        );

        final service = AreaDownloadService(apiClient: mockApi, db: db);
        final progressUpdates = <int>[];

        await service.downloadArea(
          onProgress: (downloaded, total) {
            progressUpdates.add(downloaded);
          },
        );

        // Verify pagination cursors sent
        expect(mockApi.receivedCursors, equals([null, 'cursor-page-2']));

        // Verify households inserted
        final houses = await db.getHouseholds();
        expect(houses.length, equals(10));
        expect(progressUpdates, equals([5, 10]));

        // Verify lookups stored
        final lookups = await db.getLookups('districts');
        expect(lookups.length, equals(1));
        expect(lookups.first.code, equals('colombo'));

        // Verify cursor is cleared on complete and completed_at is set
        final finalCursor = await db.getMeta('area_sync_cursor');
        expect(finalCursor, equals(''));

        final completedAt = await db.getMeta('area_sync_completed_at');
        expect(completedAt, isNotNull);
      },
    );

    test(
      'Resumes download from saved checkpoint if previous run failed',
      () async {
        final page1Houses = List.generate(3, (i) => makeHousehold(i + 1));
        final page2Houses = List.generate(3, (i) => makeHousehold(i + 4));

        // First run: return page 1, then simulate failure on page 2
        final mockApi1 = MockGrsApiClient(
          responses: [
            AreaDownloadResponse(
              items: page1Houses,
              nextCursor: 'cursor-checkpoint-1',
              hasMore: true,
              total: 6,
            ),
          ],
        );

        final service1 = AreaDownloadService(apiClient: mockApi1, db: db);
        // Run first page then simulate network cut off
        try {
          await service1.downloadArea();
        } catch (_) {
          // Expected network failure
        }

        // Checkpoint must be saved
        final savedCursor = await db.getMeta('area_sync_cursor');
        expect(savedCursor, equals('cursor-checkpoint-1'));
        final savedCount = await db.getMeta('area_sync_count');
        expect(savedCount, equals('3'));

        // Second run: resumes from checkpoint
        final mockApi2 = MockGrsApiClient(
          responses: [
            AreaDownloadResponse(
              items: page2Houses,
              nextCursor: null,
              hasMore: false,
              total: 6,
            ),
          ],
        );

        final service2 = AreaDownloadService(apiClient: mockApi2, db: db);
        await service2.downloadArea();

        // Ensure mockApi2 received the saved cursor
        expect(mockApi2.receivedCursors.first, equals('cursor-checkpoint-1'));

        // Database should now have all 6
        final allHouses = await db.getHouseholds();
        expect(allHouses.length, equals(6));

        // Cursor should be cleared after finishing
        expect(await db.getMeta('area_sync_cursor'), equals(''));
      },
    );
  });
}
