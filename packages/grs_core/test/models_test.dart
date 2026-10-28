import 'package:grs_core/grs_core.dart';
import 'package:test/test.dart';

void main() {
  group('GRS Models Serialization Tests', () {
    test('ProfileModel JSON roundtrip', () {
      final model = const ProfileModel(
        id: 'prof-1',
        userCode: 'GRS1234567890',
        email: 'test@example.com',
        pendingEmail: 'new@example.com',
        role: 'cdc_secretary',
        fullName: 'Sunil Silva',
        phoneE164: '+94771234567',
        preferredLanguage: 'si',
        districtId: 'dist-1',
        dsId: 'ds-1',
        gnId: 'gn-1',
        teamId: 'team-1',
        isActive: true,
        mustChangePassword: false,
      );

      final json = model.toJson();
      final revived = ProfileModel.fromJson(json);

      expect(revived.id, equals(model.id));
      expect(revived.userCode, equals(model.userCode));
      expect(revived.email, equals(model.email));
      expect(revived.role, equals(model.role));
      expect(revived.preferredLanguage, equals(model.preferredLanguage));
      expect(revived.isActive, isTrue);
    });

    test('SyncPushRequest and SyncRecordPayload roundtrip', () {
      final now = DateTime.now().toUtc();
      final req = SyncPushRequest(
        deviceId: 'device-abc',
        appVersion: '1.0.0',
        schemaVersion: 1,
        records: [
          SyncRecordPayload(
            type: 'client',
            id: 'client-1',
            baseVersion: 2,
            clientUpdatedAt: now,
            data: {'name': 'Amara Dias', 'age': 25},
          ),
        ],
      );

      final json = req.toJson();
      final revived = SyncPushRequest.fromJson(json);

      expect(revived.deviceId, equals('device-abc'));
      expect(revived.records.length, equals(1));
      expect(revived.records.first.id, equals('client-1'));
      expect(revived.records.first.data['name'], equals('Amara Dias'));
    });

    test('LookupValueModel trilingual label lookup', () {
      final lookup = const LookupValueModel(
        category: 'education',
        code: 'al_passed',
        labelEn: 'G.C.E. A/L Passed',
        labelSi: 'උසස් පෙළ සමත්',
        labelTa: 'உயர் தரம் சித்தி',
        sort: 1,
        isActive: true,
      );

      expect(lookup.getLabel('en'), equals('G.C.E. A/L Passed'));
      expect(lookup.getLabel('si'), equals('උසස් පෙළ සමත්'));
      expect(lookup.getLabel('ta'), equals('உயர் தரம் சித்தி'));
      expect(lookup.getLabel('unknown'), equals('G.C.E. A/L Passed'));
    });

    test('AppConfigModel serialization', () {
      final config = const AppConfigModel(
        minSupportedVersion: '1.0.0',
        agentCanEditSynced: false,
        consentVersion: 'consent.v0',
        lookupVersion: 'v1.0',
        syncJitterMaxS: 20,
        syncBatchMax: 50,
      );

      final json = config.toJson();
      final revived = AppConfigModel.fromJson(json);

      expect(revived.minSupportedVersion, equals('1.0.0'));
      expect(revived.agentCanEditSynced, isFalse);
      expect(revived.syncJitterMaxS, equals(20));
    });
  });
}
