import 'dart:convert';
import 'dart:io';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:grs_core/grs_core.dart';
import 'package:sqlite3/open.dart' as sqlite_open;
import 'package:sqlcipher_flutter_libs/sqlcipher_flutter_libs.dart';

class InvalidDatabaseKeyException implements Exception {
  final String message;
  const InvalidDatabaseKeyException(this.message);

  @override
  String toString() => 'InvalidDatabaseKeyException: $message';
}

// --- DRIFT TABLE DEFINITIONS (M2.4) ---

class HouseholdsTable extends Table {
  TextColumn get id => text()();
  TextColumn get districtId => text().nullable()();
  TextColumn get dsId => text().nullable()();
  TextColumn get gnId => text().nullable()();
  TextColumn get teamId => text().nullable()();
  IntColumn get serialNo => integer()();
  TextColumn get houseNo => text()();
  TextColumn get houseLeaderName => text()();
  TextColumn get villageName => text().nullable()();
  TextColumn get address => text().nullable()();
  IntColumn get isEpf => integer().withDefault(const Constant(0))();
  IntColumn get isEtf => integer().withDefault(const Constant(0))();
  IntColumn get isAswesuma => integer().withDefault(const Constant(0))();
  IntColumn get isSamurdhi => integer().withDefault(const Constant(0))();
  IntColumn get hasSpecialNeeds => integer().withDefault(const Constant(0))();
  IntColumn get targetFemale => integer().nullable()();
  IntColumn get targetMale => integer().nullable()();
  IntColumn get ageGroupMin => integer().nullable()();
  IntColumn get ageGroupMax => integer().nullable()();
  IntColumn get langSinhala => integer().withDefault(const Constant(0))();
  IntColumn get langTamil => integer().withDefault(const Constant(0))();
  IntColumn get langEnglish => integer().withDefault(const Constant(0))();
  TextColumn get status => text().withDefault(const Constant('not_started'))();
  TextColumn get updatedAt => text()();
  TextColumn get notes => text().nullable()(); // Added in schema version 2

  @override
  Set<Column> get primaryKey => {id};
  @override
  String get tableName => 'households';
}

class ClientsTable extends Table {
  TextColumn get id => text()();
  TextColumn get householdId => text()();
  TextColumn get name => text()();
  IntColumn get age => integer()();
  TextColumn get gender => text()();
  TextColumn get address => text().nullable()();
  TextColumn get phoneRaw => text().nullable()();
  TextColumn get phoneE164 => text().nullable()();
  TextColumn get whatsappRaw => text().nullable()();
  TextColumn get whatsappE164 => text().nullable()();
  TextColumn get highestEducation => text().nullable()();
  TextColumn get highestVocational => text().nullable()();
  TextColumn get interestedVocationalStream => text().nullable()();
  TextColumn get interestedJob => text().nullable()();
  IntColumn get isEpf => integer().withDefault(const Constant(0))();
  IntColumn get isEtf => integer().withDefault(const Constant(0))();
  IntColumn get isAswesuma => integer().withDefault(const Constant(0))();
  IntColumn get isSamurdhi => integer().withDefault(const Constant(0))();
  IntColumn get hasSpecialNeeds => integer().withDefault(const Constant(0))();
  TextColumn get futureHopes => text().withDefault(const Constant('[]'))();
  TextColumn get infoProvidedBy => text()();
  TextColumn get infoProvidedByOther => text().nullable()();
  IntColumn get consentGiven => integer()();
  TextColumn get consentAt => text().nullable()();
  TextColumn get consentVersion => text()();
  TextColumn get syncStatus => text().withDefault(const Constant('draft'))();
  IntColumn get localRevision => integer().withDefault(const Constant(1))();
  IntColumn get baseVersion => integer().withDefault(const Constant(0))();
  IntColumn get retryCount => integer().withDefault(const Constant(0))();
  TextColumn get lastErrorCode => text().nullable()();
  TextColumn get clientUpdatedAt => text()();
  TextColumn get createdAt => text()();

  @override
  Set<Column> get primaryKey => {id};
  @override
  String get tableName => 'clients';
}

class LookupsTable extends Table {
  TextColumn get category => text()();
  TextColumn get code => text()();
  TextColumn get labelEn => text()();
  TextColumn get labelSi => text()();
  TextColumn get labelTa => text()();
  IntColumn get sort => integer().withDefault(const Constant(0))();
  IntColumn get isActive => integer().withDefault(const Constant(1))();

  @override
  Set<Column> get primaryKey => {category, code};
  @override
  String get tableName => 'lookups';
}

class MetaTable extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
  @override
  String get tableName => 'meta';
}

/// Thrown when SQLCipher is required but unencrypted plain SQLite was detected.
class SqlCipherNotAvailableException implements Exception {
  final String message;
  const SqlCipherNotAvailableException([
    this.message =
        'SQLCipher is not compiled/linked. PRAGMA cipher_version returned empty. Refusing to open unencrypted database.',
  ]);

  @override
  String toString() => 'SqlCipherNotAvailableException: $message';
}

/// Offline-first encrypted SQLite database (Drift + SQLCipher).
/// Stores households, client surveys, lookups, sync metadata per Build Plan §8.1.
class AppDatabase {
  final QueryExecutor _executor;
  final String _cipherKey;
  String? _cipherVersion;

  /// Returns the encryption key used to open this database.
  String get cipherKey => _cipherKey;

  /// Returns the SQLCipher library version if encrypted, or null if plain SQLite.
  String? get cipherVersion => _cipherVersion;

  /// Whether this database instance is backed by verified native SQLCipher encryption.
  bool get isEncrypted => _cipherVersion != null && _cipherVersion!.isNotEmpty;

  static const int currentSchemaVersion = 2;
  static bool _sqlCipherInitialized = false;

  /// Ensures SQLCipher native dynamic library binding is configured on Android
  static void initSqlCipher() {
    if (_sqlCipherInitialized) return;
    if (Platform.isAndroid) {
      try {
        sqlite_open.open.overrideFor(
          sqlite_open.OperatingSystem.android,
          openCipherOnAndroid,
        );
      } catch (_) {}
    }
    _sqlCipherInitialized = true;
  }

  AppDatabase._(this._executor, this._cipherKey);

  static Future<AppDatabase> open({
    required File file,
    required String cipherKey,
    int targetSchemaVersion = currentSchemaVersion,
    bool requireCipher = true,
  }) async {
    initSqlCipher();
    if (cipherKey.length < 16) {
      throw const InvalidDatabaseKeyException(
        'Cipher key must be at least 16 characters.',
      );
    }

    final executor = NativeDatabase(
      file,
      setup: (rawDb) {
        rawDb.execute("PRAGMA key = '$cipherKey';");
      },
    );

    final db = AppDatabase._(executor, cipherKey);
    try {
      await executor.ensureOpen(
        _AppDatabaseUser(targetVersion: targetSchemaVersion),
      );

      // Startup check: Query PRAGMA cipher_version to verify SQLCipher linkage
      final cipherVersionRows = await executor.runSelect(
        'PRAGMA cipher_version;',
        [],
      );
      final cipherVersion =
          cipherVersionRows.isNotEmpty &&
              cipherVersionRows.first.values.isNotEmpty
          ? cipherVersionRows.first.values.first?.toString()
          : null;

      if (requireCipher &&
          (cipherVersion == null || cipherVersion.trim().isEmpty)) {
        await executor.close();
        throw const SqlCipherNotAvailableException(
          'SQLCipher is not compiled/linked. PRAGMA cipher_version returned empty. Refusing to open unencrypted database.',
        );
      }

      db._cipherVersion = cipherVersion;

      await db._init(targetSchemaVersion: targetSchemaVersion);
      // Read verification to trigger SQLCipher key validation
      await executor.runSelect('SELECT count(*) FROM sqlite_master;', []);
    } catch (e) {
      try {
        await executor.close();
      } catch (_) {}
      final errStr = e.toString().toLowerCase();
      if (e is SqliteException ||
          e is InvalidDatabaseKeyException ||
          errStr.contains('not a database') ||
          errStr.contains('file is encrypted') ||
          errStr.contains('file is not a database') ||
          errStr.contains('code 26')) {
        throw InvalidDatabaseKeyException(
          'Database encryption key mismatch or invalid cipher. Access safely denied: $e',
        );
      }
      rethrow;
    }
    return db;
  }

  static Future<AppDatabase> openInMemory({
    required String cipherKey,
    int targetSchemaVersion = currentSchemaVersion,
  }) async {
    initSqlCipher();
    if (cipherKey.length < 16) {
      throw const InvalidDatabaseKeyException(
        'Cipher key must be at least 16 characters.',
      );
    }
    final executor = NativeDatabase.memory(
      setup: (rawDb) {
        rawDb.execute("PRAGMA key = '$cipherKey';");
      },
    );
    final db = AppDatabase._(executor, cipherKey);
    await executor.ensureOpen(
      _AppDatabaseUser(targetVersion: targetSchemaVersion),
    );
    await db._init(targetSchemaVersion: targetSchemaVersion);
    return db;
  }

  Future<void> _init({int targetSchemaVersion = currentSchemaVersion}) async {
    final tables = await _executor.runSelect(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='meta';",
      [],
    );
    if (tables.isEmpty) {
      // Fresh database: create all tables at target schema version
      await _createSchema(version: targetSchemaVersion);
      await _executor.runCustom('PRAGMA user_version = $targetSchemaVersion;');
    } else {
      // Check if households table needs migration to v2 (missing 'notes' column)
      final cols = await _executor.runSelect(
        'PRAGMA table_info(households);',
        [],
      );
      final hasNotesCol = cols.any((c) => c['name'] == 'notes');
      if (!hasNotesCol && targetSchemaVersion >= 2) {
        await runDefaultMigration(_executor, 1, targetSchemaVersion);
      }
      await _executor.runCustom('PRAGMA user_version = $targetSchemaVersion;');
    }
  }

  Future<void> _createSchema({required int version}) async {
    await _executor.runCustom('''
      CREATE TABLE IF NOT EXISTS households (
        id TEXT PRIMARY KEY,
        district_id TEXT,
        ds_id TEXT,
        gn_id TEXT,
        team_id TEXT,
        serial_no INTEGER NOT NULL,
        house_no TEXT NOT NULL,
        house_leader_name TEXT NOT NULL,
        village_name TEXT,
        address TEXT,
        is_epf INTEGER NOT NULL DEFAULT 0,
        is_etf INTEGER NOT NULL DEFAULT 0,
        is_aswesuma INTEGER NOT NULL DEFAULT 0,
        is_samurdhi INTEGER NOT NULL DEFAULT 0,
        has_special_needs INTEGER NOT NULL DEFAULT 0,
        target_female INTEGER,
        target_male INTEGER,
        age_group_min INTEGER,
        age_group_max INTEGER,
        lang_sinhala INTEGER NOT NULL DEFAULT 0,
        lang_tamil INTEGER NOT NULL DEFAULT 0,
        lang_english INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'not_started',
        updated_at TEXT NOT NULL${version >= 2 ? ',\n        notes TEXT' : ''}
      );
    ''');

    await _executor.runCustom('''
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        gender TEXT NOT NULL,
        address TEXT,
        phone_raw TEXT,
        phone_e164 TEXT,
        whatsapp_raw TEXT,
        whatsapp_e164 TEXT,
        highest_education TEXT,
        highest_vocational TEXT,
        interested_vocational_stream TEXT,
        interested_job TEXT,
        is_epf INTEGER NOT NULL DEFAULT 0,
        is_etf INTEGER NOT NULL DEFAULT 0,
        is_aswesuma INTEGER NOT NULL DEFAULT 0,
        is_samurdhi INTEGER NOT NULL DEFAULT 0,
        has_special_needs INTEGER NOT NULL DEFAULT 0,
        future_hopes TEXT NOT NULL DEFAULT '[]',
        info_provided_by TEXT NOT NULL,
        info_provided_by_other TEXT,
        consent_given INTEGER NOT NULL,
        consent_at TEXT,
        consent_version TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'draft',
        local_revision INTEGER NOT NULL DEFAULT 1,
        base_version INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT,
        client_updated_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    ''');

    await _executor.runCustom('''
      CREATE TABLE IF NOT EXISTS lookups (
        category TEXT NOT NULL,
        code TEXT NOT NULL,
        label_en TEXT NOT NULL,
        label_si TEXT NOT NULL,
        label_ta TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (category, code)
      );
    ''');

    await _executor.runCustom('''
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    ''');
  }

  static Future<void> runDefaultMigration(
    QueryExecutor executor,
    int fromVersion,
    int toVersion,
  ) async {
    if (fromVersion < 2 && toVersion >= 2) {
      // Version 2 adds optional 'notes' column to households table
      await executor.runCustom('ALTER TABLE households ADD COLUMN notes TEXT;');
    }
  }

  Future<int> getSchemaVersion() async {
    final rows = await _executor.runSelect('PRAGMA user_version;', []);
    if (rows.isEmpty) return 1;
    return rows.first.values.first as int;
  }

  // --- HOUSEHOLDS CRUD ---

  Future<void> upsertHousehold(
    Household h, {
    String status = 'not_started',
    String? notes,
  }) async {
    final version = await getSchemaVersion();
    final hasNotes = version >= 2;

    if (hasNotes) {
      await _executor.runInsert(
        '''
        INSERT INTO households (
          id, district_id, ds_id, gn_id, team_id, serial_no, house_no, house_leader_name,
          village_name, address, is_epf, is_etf, is_aswesuma, is_samurdhi, has_special_needs,
          target_female, target_male, age_group_min, age_group_max, lang_sinhala, lang_tamil, lang_english,
          status, updated_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          serial_no = excluded.serial_no,
          house_no = excluded.house_no,
          house_leader_name = excluded.house_leader_name,
          village_name = excluded.village_name,
          address = excluded.address,
          is_epf = excluded.is_epf,
          is_etf = excluded.is_etf,
          is_aswesuma = excluded.is_aswesuma,
          is_samurdhi = excluded.is_samurdhi,
          has_special_needs = excluded.has_special_needs,
          target_female = excluded.target_female,
          target_male = excluded.target_male,
          age_group_min = excluded.age_group_min,
          age_group_max = excluded.age_group_max,
          lang_sinhala = excluded.lang_sinhala,
          lang_tamil = excluded.lang_tamil,
          lang_english = excluded.lang_english,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      ''',
        [
          h.id,
          h.districtId,
          h.dsId,
          h.gnId,
          h.teamId,
          h.serialNo,
          h.houseNo,
          h.houseLeaderName,
          h.villageName,
          h.address,
          h.isEpf ? 1 : 0,
          h.isEtf ? 1 : 0,
          h.isAswesuma ? 1 : 0,
          h.isSamurdhi ? 1 : 0,
          h.hasSpecialNeeds ? 1 : 0,
          h.targetFemale,
          h.targetMale,
          h.ageGroupMin,
          h.ageGroupMax,
          h.langSinhala ? 1 : 0,
          h.langTamil ? 1 : 0,
          h.langEnglish ? 1 : 0,
          status,
          h.updatedAt.toIso8601String(),
          notes,
        ],
      );
    } else {
      await _executor.runInsert(
        '''
        INSERT INTO households (
          id, district_id, ds_id, gn_id, team_id, serial_no, house_no, house_leader_name,
          village_name, address, is_epf, is_etf, is_aswesuma, is_samurdhi, has_special_needs,
          target_female, target_male, age_group_min, age_group_max, lang_sinhala, lang_tamil, lang_english,
          status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          serial_no = excluded.serial_no,
          house_no = excluded.house_no,
          house_leader_name = excluded.house_leader_name,
          village_name = excluded.village_name,
          address = excluded.address,
          is_epf = excluded.is_epf,
          is_etf = excluded.is_etf,
          is_aswesuma = excluded.is_aswesuma,
          is_samurdhi = excluded.is_samurdhi,
          has_special_needs = excluded.has_special_needs,
          target_female = excluded.target_female,
          target_male = excluded.target_male,
          age_group_min = excluded.age_group_min,
          age_group_max = excluded.age_group_max,
          lang_sinhala = excluded.lang_sinhala,
          lang_tamil = excluded.lang_tamil,
          lang_english = excluded.lang_english,
          updated_at = excluded.updated_at
      ''',
        [
          h.id,
          h.districtId,
          h.dsId,
          h.gnId,
          h.teamId,
          h.serialNo,
          h.houseNo,
          h.houseLeaderName,
          h.villageName,
          h.address,
          h.isEpf ? 1 : 0,
          h.isEtf ? 1 : 0,
          h.isAswesuma ? 1 : 0,
          h.isSamurdhi ? 1 : 0,
          h.hasSpecialNeeds ? 1 : 0,
          h.targetFemale,
          h.targetMale,
          h.ageGroupMin,
          h.ageGroupMax,
          h.langSinhala ? 1 : 0,
          h.langTamil ? 1 : 0,
          h.langEnglish ? 1 : 0,
          status,
          h.updatedAt.toIso8601String(),
        ],
      );
    }
  }

  Future<List<Map<String, dynamic>>> getHouseholds({
    String? search,
    String? statusFilter,
  }) async {
    var query = 'SELECT * FROM households';
    final conditions = <String>[];
    final args = <dynamic>[];

    if (search != null && search.trim().isNotEmpty) {
      final term = '%${search.trim()}%';
      conditions.add('(house_no LIKE ? OR house_leader_name LIKE ?)');
      args.addAll([term, term]);
    }

    if (statusFilter != null && statusFilter != 'all') {
      conditions.add('status = ?');
      args.add(statusFilter);
    }

    if (conditions.isNotEmpty) {
      query += ' WHERE ${conditions.join(' AND ')}';
    }

    query += ' ORDER BY serial_no ASC';
    final rows = await _executor.runSelect(query, args);
    return rows;
  }

  Future<Map<String, dynamic>?> getHouseholdById(String id) async {
    final rows = await _executor.runSelect(
      'SELECT * FROM households WHERE id = ?',
      [id],
    );
    return rows.isEmpty ? null : rows.first;
  }

  Future<void> updateHouseholdStatus(String id, String status) async {
    await _executor.runUpdate(
      'UPDATE households SET status = ?, updated_at = ? WHERE id = ?',
      [status, DateTime.now().toUtc().toIso8601String(), id],
    );
  }

  // --- CLIENTS (SURVEYS) CRUD ---

  /// Atomically saves a client survey (Invariant 1).
  Future<void> saveClient({
    required Client client,
    SyncStatus status = SyncStatus.pending,
    int baseVersion = 0,
  }) async {
    final now = DateTime.now().toUtc().toIso8601String();
    final futureHopesJson = jsonEncode(client.futureHopes);

    await _executor.runInsert(
      '''
      INSERT INTO clients (
        id, household_id, name, age, gender, address, phone_raw, phone_e164, whatsapp_raw, whatsapp_e164,
        highest_education, highest_vocational, interested_vocational_stream, interested_job,
        is_epf, is_etf, is_aswesuma, is_samurdhi, has_special_needs, future_hopes,
        info_provided_by, info_provided_by_other, consent_given, consent_at, consent_version,
        sync_status, local_revision, base_version, retry_count, last_error_code, client_updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        age = excluded.age,
        gender = excluded.gender,
        address = excluded.address,
        phone_raw = excluded.phone_raw,
        phone_e164 = excluded.phone_e164,
        whatsapp_raw = excluded.whatsapp_raw,
        whatsapp_e164 = excluded.whatsapp_e164,
        highest_education = excluded.highest_education,
        highest_vocational = excluded.highest_vocational,
        interested_vocational_stream = excluded.interested_vocational_stream,
        interested_job = excluded.interested_job,
        is_epf = excluded.is_epf,
        is_etf = excluded.is_etf,
        is_aswesuma = excluded.is_aswesuma,
        is_samurdhi = excluded.is_samurdhi,
        has_special_needs = excluded.has_special_needs,
        future_hopes = excluded.future_hopes,
        info_provided_by = excluded.info_provided_by,
        info_provided_by_other = excluded.info_provided_by_other,
        consent_given = excluded.consent_given,
        consent_at = excluded.consent_at,
        consent_version = excluded.consent_version,
        sync_status = excluded.sync_status,
        local_revision = clients.local_revision + 1,
        client_updated_at = excluded.client_updated_at
    ''',
      [
        client.id,
        client.householdId,
        client.name,
        client.age,
        client.gender,
        client.address,
        client.phoneRaw,
        client.phoneE164,
        client.whatsappRaw,
        client.whatsappE164,
        client.highestEducation,
        client.highestVocational,
        client.interestedVocationalStream,
        client.interestedJob,
        client.isEpf ? 1 : 0,
        client.isEtf ? 1 : 0,
        client.isAswesuma ? 1 : 0,
        client.isSamurdhi ? 1 : 0,
        client.hasSpecialNeeds ? 1 : 0,
        futureHopesJson,
        client.infoProvidedBy,
        client.infoProvidedByOther,
        client.consentGiven ? 1 : 0,
        client.consentAt?.toIso8601String() ?? now,
        client.consentGiven ? 'consent.v0' : '',
        status.name,
        1,
        baseVersion,
        0,
        null,
        now,
        now,
      ],
    );

    // Update household status to in_progress or completed
    await updateHouseholdStatus(client.householdId, 'in_progress');
  }

  Future<List<Map<String, dynamic>>> getClientsForHousehold(
    String householdId,
  ) async {
    return await _executor.runSelect(
      'SELECT * FROM clients WHERE household_id = ? ORDER BY created_at ASC',
      [householdId],
    );
  }

  Future<List<Map<String, dynamic>>> getAllClients({SyncStatus? status}) async {
    if (status != null) {
      return await _executor.runSelect(
        'SELECT * FROM clients WHERE sync_status = ? ORDER BY client_updated_at DESC',
        [status.name],
      );
    }
    return await _executor.runSelect(
      'SELECT * FROM clients ORDER BY client_updated_at DESC',
      [],
    );
  }

  Future<Map<String, dynamic>?> getClientById(String id) async {
    final rows = await _executor.runSelect(
      'SELECT * FROM clients WHERE id = ?',
      [id],
    );
    return rows.isEmpty ? null : rows.first;
  }

  Future<void> updateClientSyncStatus(
    String id, {
    required SyncStatus status,
    int? baseVersion,
    String? errorCode,
  }) async {
    final args = <dynamic>[status.name];
    var setClause = 'sync_status = ?';

    if (baseVersion != null) {
      setClause += ', base_version = ?';
      args.add(baseVersion);
    }
    if (errorCode != null) {
      setClause += ', last_error_code = ?';
      args.add(errorCode);
    }

    args.add(id);
    await _executor.runUpdate(
      'UPDATE clients SET $setClause WHERE id = ?',
      args,
    );
  }

  Future<bool> deleteDraftClient(String id) async {
    final deleted = await _executor.runDelete(
      'DELETE FROM clients WHERE id = ? AND sync_status = ?',
      [id, 'draft'],
    );
    return deleted > 0;
  }

  // --- LOOKUPS ---

  Future<void> saveLookups(List<LookupValueModel> lookups) async {
    for (final l in lookups) {
      await _executor.runInsert(
        '''
        INSERT INTO lookups (category, code, label_en, label_si, label_ta, sort, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(category, code) DO UPDATE SET
          label_en = excluded.label_en,
          label_si = excluded.label_si,
          label_ta = excluded.label_ta,
          sort = excluded.sort,
          is_active = excluded.is_active
      ''',
        [
          l.category,
          l.code,
          l.labelEn,
          l.labelSi,
          l.labelTa,
          l.sort,
          l.isActive ? 1 : 0,
        ],
      );
    }
  }

  Future<void> upsertLookups(List<LookupValueModel> lookups) =>
      saveLookups(lookups);

  Future<List<LookupValueModel>> getLookupsByCategory(String category) async {
    final rows = await _executor.runSelect(
      'SELECT * FROM lookups WHERE category = ? AND is_active = 1 ORDER BY sort ASC',
      [category],
    );
    return rows
        .map(
          (r) => LookupValueModel(
            category: r['category'] as String,
            code: r['code'] as String,
            labelEn: r['label_en'] as String,
            labelSi: r['label_si'] as String,
            labelTa: r['label_ta'] as String,
            sort: r['sort'] as int,
            isActive: (r['is_active'] as int) == 1,
          ),
        )
        .toList();
  }

  Future<List<LookupValueModel>> getLookups(String category) =>
      getLookupsByCategory(category);

  // --- META & PACE SETTINGS ---

  Future<void> setMeta(String key, String value) async {
    await _executor.runInsert(
      '''
      INSERT INTO meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    ''',
      [key, value],
    );
  }

  Future<String?> getMeta(String key) async {
    final rows = await _executor.runSelect(
      'SELECT value FROM meta WHERE key = ?',
      [key],
    );
    return rows.isEmpty ? null : rows.first['value'] as String;
  }

  // --- USER SWITCH WIPE (Invariant 8.2 #7) ---
  Future<void> wipeAllData() async {
    await _executor.runCustom('DELETE FROM clients;');
    await _executor.runCustom('DELETE FROM households;');
    await _executor.runCustom('DELETE FROM meta;');
  }

  Future<void> close() async {
    await _executor.close();
  }
}

class _AppDatabaseUser extends QueryExecutorUser {
  final int _targetVersion;

  _AppDatabaseUser({int targetVersion = 2}) : _targetVersion = targetVersion;

  @override
  int get schemaVersion => _targetVersion;

  @override
  Future<void> beforeOpen(
    QueryExecutor executor,
    OpeningDetails details,
  ) async {}
}
