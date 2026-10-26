/// Household domain entity representing Form DD/S/002/2026.
/// Traced against docs/traceability.csv.
class Household {
  final String id;
  final String districtId;
  final String dsId;
  final String gnId;
  final String? teamId;
  final int serialNo;
  final String houseNo;
  final String houseLeaderName;
  final String? address;
  final String? villageName;
  final bool isEpf;
  final bool isEtf;
  final bool isAswesuma;
  final bool isSamurdhi;
  final bool hasSpecialNeeds;
  final int? targetFemale;
  final int? targetMale;
  final int? ageGroupMin;
  final int? ageGroupMax;
  final bool langSinhala;
  final bool langTamil;
  final bool langEnglish;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Household({
    required this.id,
    required this.districtId,
    required this.dsId,
    required this.gnId,
    this.teamId,
    required this.serialNo,
    required this.houseNo,
    required this.houseLeaderName,
    this.address,
    this.villageName,
    this.isEpf = false,
    this.isEtf = false,
    this.isAswesuma = false,
    this.isSamurdhi = false,
    this.hasSpecialNeeds = false,
    this.targetFemale,
    this.targetMale,
    this.ageGroupMin,
    this.ageGroupMax,
    this.langSinhala = false,
    this.langTamil = false,
    this.langEnglish = false,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'districtId': districtId,
      'dsId': dsId,
      'gnId': gnId,
      'teamId': teamId,
      'serialNo': serialNo,
      'houseNo': houseNo,
      'houseLeaderName': houseLeaderName,
      'address': address,
      'villageName': villageName,
      'isEpf': isEpf,
      'isEtf': isEtf,
      'isAswesuma': isAswesuma,
      'isSamurdhi': isSamurdhi,
      'hasSpecialNeeds': hasSpecialNeeds,
      'targetFemale': targetFemale,
      'targetMale': targetMale,
      'ageGroupMin': ageGroupMin,
      'ageGroupMax': ageGroupMax,
      'langSinhala': langSinhala,
      'langTamil': langTamil,
      'langEnglish': langEnglish,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory Household.fromJson(Map<String, dynamic> json) {
    return Household(
      id: json['id'] as String,
      districtId: json['districtId'] as String,
      dsId: json['dsId'] as String,
      gnId: json['gnId'] as String,
      teamId: json['teamId'] as String?,
      serialNo: json['serialNo'] as int,
      houseNo: json['houseNo'] as String,
      houseLeaderName: json['houseLeaderName'] as String,
      address: json['address'] as String?,
      villageName: json['villageName'] as String?,
      isEpf: json['isEpf'] as bool? ?? false,
      isEtf: json['isEtf'] as bool? ?? false,
      isAswesuma: json['isAswesuma'] as bool? ?? false,
      isSamurdhi: json['isSamurdhi'] as bool? ?? false,
      hasSpecialNeeds: json['hasSpecialNeeds'] as bool? ?? false,
      targetFemale: json['targetFemale'] as int?,
      targetMale: json['targetMale'] as int?,
      ageGroupMin: json['ageGroupMin'] as int?,
      ageGroupMax: json['ageGroupMax'] as int?,
      langSinhala: json['langSinhala'] as bool? ?? false,
      langTamil: json['langTamil'] as bool? ?? false,
      langEnglish: json['langEnglish'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}
