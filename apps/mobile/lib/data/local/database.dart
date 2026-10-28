import 'dart:convert';
import 'dart:io';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:grs_core/grs_core.dart';

class InvalidDatabaseKeyException implements Exception {
  final String message;
  const InvalidDatabaseKeyException(this.message);

  @override
  String toString() => 'InvalidDatabaseKeyException: $message';
}

/// Offline-first encrypted SQLite database (Drift + SQLCipher).
/// Stores households, client surveys, lookups, sync metadata per Build Plan §8.1.
class AppDatabase {
  final QueryExecutor _executor;
  final String _cipherKey;

  AppDatabase._(this._executor, this._cipherKey);

  static Future<AppDatabase> open({
    required File file,
    required String cipherKey,
  }) async {
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
    await db._init();
    return db;
  }

  static AppDatabase openInMemory({required String cipherKey}) {
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
    return AppDatabase._(executor, cipherKey);
  }

  Future<void> _init() async {
    await _executor.ensureOpen(_DriftUser());

    // Create tables
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
        updated_at TEXT NOT NULL
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

    await _executor.runCustom('''
      CREATE TABLE IF NOT EXISTS key_verification (
        id TEXT PRIMARY KEY,
        signature TEXT NOT NULL
      );
    ''');

    // Verify key signature
    final sigRows = await _executor.runSelect(
      'SELECT signature FROM key_verification WHERE id = ?',
      ['master'],
    );

    if (sigRows.isEmpty) {
      await _executor.runInsert(
        'INSERT INTO key_verification (id, signature) VALUES (?, ?)',
        ['master', _computeSignature(_cipherKey)],
      );
    } else {
      final savedSig = sigRows.first['signature'] as String;
      if (savedSig != _computeSignature(_cipherKey)) {
        await _executor.close();
        throw const InvalidDatabaseKeyException(
          'Database encryption key mismatch. Access safely denied.',
        );
      }
    }
  }

  String _computeSignature(String key) {
    // Generate validation hash
    var hash = 0xcbf29ce484222325;
    for (var code in utf8.encode(key)) {
      hash ^= code;
      hash = (hash * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF;
    }
    return hash.toRadixString(16);
  }

  // --- HOUSEHOLDS CRUD ---

  Future<void> upsertHousehold(
    Household h, {
    String status = 'not_started',
  }) async {
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

class _DriftUser extends QueryExecutorUser {
  @override
  int get schemaVersion => 1;

  @override
  Future<void> beforeOpen(
    QueryExecutor executor,
    OpeningDetails details,
  ) async {}
}
