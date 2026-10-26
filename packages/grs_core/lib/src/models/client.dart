/// Client domain entity representing Form DD/S/001/2026.
/// Traced against docs/traceability.csv.
class Client {
  final String id;
  final String householdId;
  final String name;
  final int age;
  final String gender;
  final String? address;
  final String? phoneRaw;
  final String? phoneE164;
  final String? whatsappRaw;
  final String? whatsappE164;
  final String? highestEducation;
  final String? highestVocational;
  final String? interestedVocationalStream;
  final String? interestedJob;
  final bool isEpf;
  final bool isEtf;
  final bool isAswesuma;
  final bool isSamurdhi;
  final bool hasSpecialNeeds;
  final List<String> futureHopes;
  final String infoProvidedBy;
  final String? infoProvidedByOther;
  final bool consentGiven;
  final DateTime? consentAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Client({
    required this.id,
    required this.householdId,
    required this.name,
    required this.age,
    required this.gender,
    this.address,
    this.phoneRaw,
    this.phoneE164,
    this.whatsappRaw,
    this.whatsappE164,
    this.highestEducation,
    this.highestVocational,
    this.interestedVocationalStream,
    this.interestedJob,
    this.isEpf = false,
    this.isEtf = false,
    this.isAswesuma = false,
    this.isSamurdhi = false,
    this.hasSpecialNeeds = false,
    this.futureHopes = const [],
    required this.infoProvidedBy,
    this.infoProvidedByOther,
    required this.consentGiven,
    this.consentAt,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'householdId': householdId,
      'name': name,
      'age': age,
      'gender': gender,
      'address': address,
      'phoneRaw': phoneRaw,
      'phoneE164': phoneE164,
      'whatsappRaw': whatsappRaw,
      'whatsappE164': whatsappE164,
      'highestEducation': highestEducation,
      'highestVocational': highestVocational,
      'interestedVocationalStream': interestedVocationalStream,
      'interestedJob': interestedJob,
      'isEpf': isEpf,
      'isEtf': isEtf,
      'isAswesuma': isAswesuma,
      'isSamurdhi': isSamurdhi,
      'hasSpecialNeeds': hasSpecialNeeds,
      'futureHopes': futureHopes,
      'infoProvidedBy': infoProvidedBy,
      'infoProvidedByOther': infoProvidedByOther,
      'consentGiven': consentGiven,
      'consentAt': consentAt?.toIso8601String(),
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory Client.fromJson(Map<String, dynamic> json) {
    return Client(
      id: json['id'] as String,
      householdId: json['householdId'] as String,
      name: json['name'] as String,
      age: json['age'] as int,
      gender: json['gender'] as String,
      address: json['address'] as String?,
      phoneRaw: json['phoneRaw'] as String?,
      phoneE164: json['phoneE164'] as String?,
      whatsappRaw: json['whatsappRaw'] as String?,
      whatsappE164: json['whatsappE164'] as String?,
      highestEducation: json['highestEducation'] as String?,
      highestVocational: json['highestVocational'] as String?,
      interestedVocationalStream: json['interestedVocationalStream'] as String?,
      interestedJob: json['interestedJob'] as String?,
      isEpf: json['isEpf'] as bool? ?? false,
      isEtf: json['isEtf'] as bool? ?? false,
      isAswesuma: json['isAswesuma'] as bool? ?? false,
      isSamurdhi: json['isSamurdhi'] as bool? ?? false,
      hasSpecialNeeds: json['hasSpecialNeeds'] as bool? ?? false,
      futureHopes:
          (json['futureHopes'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const [],
      infoProvidedBy: json['infoProvidedBy'] as String,
      infoProvidedByOther: json['infoProvidedByOther'] as String?,
      consentGiven: json['consentGiven'] as bool? ?? false,
      consentAt: json['consentAt'] != null
          ? DateTime.parse(json['consentAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}
