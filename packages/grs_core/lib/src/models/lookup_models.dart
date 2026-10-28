/// Lookup value domain model per DD-Campaign_Agent_Build_Plan.md §5.2.
class LookupValueModel {
  final String category;
  final String code;
  final String labelEn;
  final String labelSi;
  final String labelTa;
  final int sort;
  final bool isActive;

  const LookupValueModel({
    required this.category,
    required this.code,
    required this.labelEn,
    required this.labelSi,
    required this.labelTa,
    this.sort = 0,
    this.isActive = true,
  });

  String getLabel(String lang) {
    switch (lang.toLowerCase()) {
      case 'si':
        return labelSi.isNotEmpty ? labelSi : labelEn;
      case 'ta':
        return labelTa.isNotEmpty ? labelTa : labelEn;
      case 'en':
      default:
        return labelEn;
    }
  }

  factory LookupValueModel.fromJson(
    Map<String, dynamic> json,
  ) => LookupValueModel(
    category: json['category'] as String,
    code: json['code'] as String,
    labelEn: json['labelEn'] as String? ?? json['label_en'] as String? ?? '',
    labelSi: json['labelSi'] as String? ?? json['label_si'] as String? ?? '',
    labelTa: json['labelTa'] as String? ?? json['label_ta'] as String? ?? '',
    sort: json['sort'] as int? ?? 0,
    isActive: json['isActive'] as bool? ?? json['is_active'] as bool? ?? true,
  );

  Map<String, dynamic> toJson() => {
    'category': category,
    'code': code,
    'labelEn': labelEn,
    'labelSi': labelSi,
    'labelTa': labelTa,
    'sort': sort,
    'isActive': isActive,
  };
}
