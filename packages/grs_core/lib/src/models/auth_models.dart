/// Authentication domain models for GRS Mobile & Web.
/// Strictly follows API contract in DD-Campaign_Agent_Build_Plan.md §6.2.
class LoginRequest {
  final String identifier;
  final String password;
  final String deviceId;

  const LoginRequest({
    required this.identifier,
    required this.password,
    required this.deviceId,
  });

  Map<String, dynamic> toJson() => {
    'identifier': identifier.trim(),
    'password': password,
    'deviceId': deviceId,
  };
}

class ProfileAssignmentModel {
  final String gnId;
  final String? gnName;
  final String? gnCode;
  final String? teamId;
  final String? teamNo;
  final String? validFrom;

  const ProfileAssignmentModel({
    required this.gnId,
    this.gnName,
    this.gnCode,
    this.teamId,
    this.teamNo,
    this.validFrom,
  });

  factory ProfileAssignmentModel.fromJson(Map<String, dynamic> json) =>
      ProfileAssignmentModel(
        gnId: json['gnId'] as String? ?? json['gn_id'] as String? ?? '',
        gnName: json['gnName'] as String? ?? json['gn_name'] as String?,
        gnCode:
            json['gnCode'] as String? ??
            json['gn_code'] as String? ??
            json['gnNumber'] as String? ??
            json['gn_number'] as String?,
        teamId: json['teamId'] as String? ?? json['team_id'] as String?,
        teamNo: json['teamNo']?.toString() ?? json['team_no']?.toString(),
        validFrom:
            json['validFrom'] as String? ?? json['valid_from'] as String?,
      );

  Map<String, dynamic> toJson() => {
    'gnId': gnId,
    'gnName': gnName,
    'gnCode': gnCode,
    'teamId': teamId,
    'teamNo': teamNo,
    'validFrom': validFrom,
  };
}

class ProfileModel {
  final String id;
  final String userCode;
  final String? email;
  final String? pendingEmail;
  final String role;
  final String fullName;
  final String? phoneE164;
  final String preferredLanguage;
  final String? districtId;
  final String? dsId;
  final String? gnId;
  final String? teamId;
  final bool isActive;
  final bool mustChangePassword;
  final List<ProfileAssignmentModel>? assignments;
  final String? gnName;
  final String? gnCode;
  final String? dsName;
  final String? districtName;

  const ProfileModel({
    required this.id,
    required this.userCode,
    this.email,
    this.pendingEmail,
    required this.role,
    required this.fullName,
    this.phoneE164,
    required this.preferredLanguage,
    this.districtId,
    this.dsId,
    this.gnId,
    this.teamId,
    required this.isActive,
    required this.mustChangePassword,
    this.assignments,
    this.gnName,
    this.gnCode,
    this.dsName,
    this.districtName,
  });

  factory ProfileModel.fromJson(Map<String, dynamic> json) {
    final parsedAssignments = json['assignments'] != null
        ? (json['assignments'] as List<dynamic>)
              .map(
                (e) =>
                    ProfileAssignmentModel.fromJson(e as Map<String, dynamic>),
              )
              .toList()
        : null;

    final gnIdVal = json['gnId'] as String? ?? json['gn_id'] as String?;
    final activeAssignment =
        parsedAssignments != null && parsedAssignments.isNotEmpty
        ? (parsedAssignments.where((a) => a.gnId == gnIdVal).firstOrNull ??
              parsedAssignments.first)
        : null;

    final gnNameVal =
        json['gnName'] as String? ??
        json['gn_name'] as String? ??
        activeAssignment?.gnName;

    final gnCodeVal =
        json['gnCode'] as String? ??
        json['gn_code'] as String? ??
        json['gnNumber'] as String? ??
        json['gn_number'] as String? ??
        activeAssignment?.gnCode;

    final dsNameVal = json['dsName'] as String? ?? json['ds_name'] as String?;
    final districtNameVal =
        json['districtName'] as String? ?? json['district_name'] as String?;

    return ProfileModel(
      id: json['id'] as String,
      userCode:
          json['userCode'] as String? ?? json['user_code'] as String? ?? '',
      email: json['email'] as String?,
      pendingEmail:
          json['pendingEmail'] as String? ?? json['pending_email'] as String?,
      role: json['role'] as String,
      fullName:
          json['fullName'] as String? ?? json['full_name'] as String? ?? '',
      phoneE164: json['phoneE164'] as String? ?? json['phone_e164'] as String?,
      preferredLanguage:
          json['preferredLanguage'] as String? ??
          json['preferred_language'] as String? ??
          'en',
      districtId:
          json['districtId'] as String? ?? json['district_id'] as String?,
      dsId: json['dsId'] as String? ?? json['ds_id'] as String?,
      gnId: gnIdVal,
      teamId: json['teamId'] as String? ?? json['team_id'] as String?,
      isActive: json['isActive'] as bool? ?? json['is_active'] as bool? ?? true,
      mustChangePassword:
          json['mustChangePassword'] as bool? ??
          json['must_change_password'] as bool? ??
          false,
      assignments: parsedAssignments,
      gnName: gnNameVal,
      gnCode: gnCodeVal,
      dsName: dsNameVal,
      districtName: districtNameVal,
    );
  }

  ProfileModel copyWith({
    String? id,
    String? userCode,
    String? email,
    String? pendingEmail,
    String? role,
    String? fullName,
    String? phoneE164,
    String? preferredLanguage,
    String? districtId,
    String? dsId,
    String? gnId,
    String? teamId,
    bool? isActive,
    bool? mustChangePassword,
    List<ProfileAssignmentModel>? assignments,
    String? gnName,
    String? gnCode,
    String? dsName,
    String? districtName,
  }) {
    return ProfileModel(
      id: id ?? this.id,
      userCode: userCode ?? this.userCode,
      email: email ?? this.email,
      pendingEmail: pendingEmail ?? this.pendingEmail,
      role: role ?? this.role,
      fullName: fullName ?? this.fullName,
      phoneE164: phoneE164 ?? this.phoneE164,
      preferredLanguage: preferredLanguage ?? this.preferredLanguage,
      districtId: districtId ?? this.districtId,
      dsId: dsId ?? this.dsId,
      gnId: gnId ?? this.gnId,
      teamId: teamId ?? this.teamId,
      isActive: isActive ?? this.isActive,
      mustChangePassword: mustChangePassword ?? this.mustChangePassword,
      assignments: assignments ?? this.assignments,
      gnName: gnName ?? this.gnName,
      gnCode: gnCode ?? this.gnCode,
      dsName: dsName ?? this.dsName,
      districtName: districtName ?? this.districtName,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'userCode': userCode,
    'email': email,
    'pendingEmail': pendingEmail,
    'role': role,
    'fullName': fullName,
    'phoneE164': phoneE164,
    'preferredLanguage': preferredLanguage,
    'districtId': districtId,
    'dsId': dsId,
    'gnId': gnId,
    'teamId': teamId,
    'isActive': isActive,
    'mustChangePassword': mustChangePassword,
    'assignments': assignments?.map((e) => e.toJson()).toList(),
    if (gnName != null) 'gnName': gnName,
    if (gnCode != null) 'gnCode': gnCode,
    if (dsName != null) 'dsName': dsName,
    if (districtName != null) 'districtName': districtName,
  };
}

class LoginResponse {
  final String accessToken;
  final String refreshToken;
  final int expiresIn;
  final bool mustChangePassword;
  final ProfileModel profile;

  const LoginResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.mustChangePassword,
    required this.profile,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) => LoginResponse(
    accessToken:
        json['accessToken'] as String? ?? json['access_token'] as String? ?? '',
    refreshToken:
        json['refreshToken'] as String? ??
        json['refresh_token'] as String? ??
        '',
    expiresIn: json['expiresIn'] as int? ?? json['expires_in'] as int? ?? 900,
    mustChangePassword:
        json['mustChangePassword'] as bool? ??
        json['must_change_password'] as bool? ??
        false,
    profile: (json['profile'] != null || json['user'] != null)
        ? ProfileModel.fromJson(
            (json['profile'] ?? json['user']) as Map<String, dynamic>,
          )
        : const ProfileModel(
            id: '',
            userCode: '',
            role: '',
            fullName: '',
            preferredLanguage: 'en',
            isActive: true,
            mustChangePassword: false,
          ),
  );

  Map<String, dynamic> toJson() => {
    'accessToken': accessToken,
    'refreshToken': refreshToken,
    'expiresIn': expiresIn,
    'mustChangePassword': mustChangePassword,
    'profile': profile.toJson(),
  };
}

class ChangePasswordRequest {
  final String currentPassword;
  final String newPassword;

  const ChangePasswordRequest({
    required this.currentPassword,
    required this.newPassword,
  });

  Map<String, dynamic> toJson() => {
    'currentPassword': currentPassword,
    'newPassword': newPassword,
  };
}

class EmailAddRequest {
  final String email;

  const EmailAddRequest({required this.email});

  Map<String, dynamic> toJson() => {'email': email.trim().toLowerCase()};
}

class EmailVerifyRequest {
  final String email;
  final String code;

  const EmailVerifyRequest({required this.email, required this.code});

  Map<String, dynamic> toJson() => {
    'email': email.trim().toLowerCase(),
    'code': code.trim(),
  };
}

class ForgotPasswordRequest {
  final String email;

  const ForgotPasswordRequest({required this.email});

  Map<String, dynamic> toJson() => {'email': email.trim().toLowerCase()};
}

class ResetPasswordRequest {
  final String email;
  final String code;
  final String newPassword;

  const ResetPasswordRequest({
    required this.email,
    required this.code,
    required this.newPassword,
  });

  Map<String, dynamic> toJson() => {
    'email': email.trim().toLowerCase(),
    'code': code.trim(),
    'newPassword': newPassword,
  };
}
