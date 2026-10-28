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
  final cipherKey = await storage.getOrCreateDatabaseKey();

  final appDocDir = await getApplicationDocumentsDirectory();
  final dbFile = File('${appDocDir.path}/grs_offline_v1.db');

  return await AppDatabase.open(file: dbFile, cipherKey: cipherKey);
});
