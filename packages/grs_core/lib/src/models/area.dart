/// Area hierarchy models in grs_core, traced against docs/traceability.csv.
class DivisionalSecretariatModel {
  final String id;
  final String districtId;
  final String nameEn;
  final String nameSi;
  final String nameTa;
  final String? sdoName;

  const DivisionalSecretariatModel({
    required this.id,
    required this.districtId,
    required this.nameEn,
    required this.nameSi,
    required this.nameTa,
    this.sdoName,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'districtId': districtId,
    'nameEn': nameEn,
    'nameSi': nameSi,
    'nameTa': nameTa,
    'sdoName': sdoName,
  };

  factory DivisionalSecretariatModel.fromJson(Map<String, dynamic> json) =>
      DivisionalSecretariatModel(
        id: json['id'] as String,
        districtId: json['districtId'] as String,
        nameEn: json['nameEn'] as String,
        nameSi: json['nameSi'] as String,
        nameTa: json['nameTa'] as String,
        sdoName: json['sdoName'] as String?,
      );
}

class GnDivisionModel {
  final String id;
  final String dsId;
  final String gnNumber;
  final String gnName;
  final String? secretaryName;
  final String? secretaryContact;
  final String? secretaryEmail;

  const GnDivisionModel({
    required this.id,
    required this.dsId,
    required this.gnNumber,
    required this.gnName,
    this.secretaryName,
    this.secretaryContact,
    this.secretaryEmail,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'dsId': dsId,
    'gnNumber': gnNumber,
    'gnName': gnName,
    'secretaryName': secretaryName,
    'secretaryContact': secretaryContact,
    'secretaryEmail': secretaryEmail,
  };

  factory GnDivisionModel.fromJson(Map<String, dynamic> json) =>
      GnDivisionModel(
        id: json['id'] as String,
        dsId: json['dsId'] as String,
        gnNumber: json['gnNumber'] as String,
        gnName: json['gnName'] as String,
        secretaryName: json['secretaryName'] as String?,
        secretaryContact: json['secretaryContact'] as String?,
        secretaryEmail: json['secretaryEmail'] as String?,
      );
}
