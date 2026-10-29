import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import '../data/local/database.dart';
import '../data/local/secure_storage_service.dart';

final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService();
});

final databaseProvider = FutureProvider<AppDatabase>((ref) async {
  final storage = ref.watch(secureStorageProvider);
  final activeProfile = await storage.getActiveProfile();
  final userId = activeProfile?.id;

  final cipherKey = await storage.getOrCreateDatabaseKey(userId: userId);

  final appDocDir = await getApplicationDocumentsDirectory();
  final fileName = userId != null && userId.isNotEmpty
      ? 'grs_offline_$userId.db'
      : 'grs_offline_v1.db';
  final dbFile = File('${appDocDir.path}/$fileName');

  final db = await AppDatabase.open(file: dbFile, cipherKey: cipherKey);
  ref.onDispose(() async {
    await db.close();
  });
  return db;
});

/// Safely removes SQLite file, WAL, SHM, and encryption key on logout
Future<void> wipeUserDatabase({
  String? userId,
  required SecureStorageService storage,
}) async {
  try {
    final appDocDir = await getApplicationDocumentsDirectory();
    final fileNames = [
      if (userId != null && userId.isNotEmpty) 'grs_offline_$userId.db',
      'grs_offline_v1.db',
    ];

    for (final name in fileNames) {
      final dbFile = File('${appDocDir.path}/$name');
      if (await dbFile.exists()) {
        await dbFile.delete();
      }
      final walFile = File('${appDocDir.path}/$name-wal');
      if (await walFile.exists()) {
        await walFile.delete();
      }
      final shmFile = File('${appDocDir.path}/$name-shm');
      if (await shmFile.exists()) {
        await shmFile.delete();
      }
    }
  } catch (_) {}

  await storage.clearDatabaseKey(userId: userId);
}
