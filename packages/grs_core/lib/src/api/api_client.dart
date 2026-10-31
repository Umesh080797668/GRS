import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/auth_models.dart';
import '../models/config_models.dart';
import '../models/lookup_models.dart';
import '../models/sync_models.dart';
import 'api_exception.dart';

/// Official GRS HTTP API Client.
/// Communicates with NestJS API endpoints under /v1 prefix.
class GrsApiClient {
  final String baseUrl;
  final http.Client _client;
  final String appVersion;
  String? _accessToken;
  String? _refreshToken;
  final Future<void> Function(String newAccess, String newRefresh)?
  onTokenRefreshed;

  Future<LoginResponse>? _ongoingRefresh;

  GrsApiClient({
    required this.baseUrl,
    http.Client? client,
    String? accessToken,
    String? refreshToken,
    this.appVersion = '1.0.0',
    this.onTokenRefreshed,
  }) : _client = client ?? http.Client(),
       _accessToken = accessToken,
       _refreshToken = refreshToken;

  void setTokens({String? accessToken, String? refreshToken}) {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
  }

  void clearTokens() {
    _accessToken = null;
    _refreshToken = null;
  }

  String? get accessToken => _accessToken;
  String? get refreshToken => _refreshToken;

  Map<String, String> _headers({bool authenticated = true}) {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-App-Version': appVersion,
    };
    if (authenticated && _accessToken != null && _accessToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_accessToken';
    }
    return headers;
  }

  Never _handleError(http.Response response) {
    int? retryAfter;
    final retryHeader = response.headers['retry-after'];
    if (retryHeader != null) {
      retryAfter = int.tryParse(retryHeader);
    }

    String code = 'UNKNOWN_ERROR';
    String messageKey = 'error.server';
    Map<String, dynamic> details = {};

    try {
      final body = jsonDecode(response.body);
      if (body is Map<String, dynamic>) {
        code = body['code'] as String? ?? body['error'] as String? ?? code;
        messageKey =
            body['message_key'] as String? ??
            body['message'] as String? ??
            messageKey;
        if (body['details'] is Map<String, dynamic>) {
          details = body['details'] as Map<String, dynamic>;
        }
      }
    } catch (_) {
      // Body not JSON
    }

    throw GrsApiException(
      statusCode: response.statusCode,
      code: code,
      messageKey: messageKey,
      details: details,
      retryAfterSeconds: retryAfter,
    );
  }

  /// POST /v1/auth/login
  Future<LoginResponse> login(LoginRequest req) async {
    final uri = Uri.parse('$baseUrl/v1/auth/login');
    final response = await _client.post(
      uri,
      headers: _headers(authenticated: false),
      body: jsonEncode(req.toJson()),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      final res = LoginResponse.fromJson(json);
      _accessToken = res.accessToken;
      _refreshToken = res.refreshToken;
      return res;
    }

    _handleError(response);
  }

  /// Helper to send an authenticated request and automatically retry once with refreshed token on 401
  Future<http.Response> _sendWithAuthRetry(
    Future<http.Response> Function() requestFn,
  ) async {
    final tokenBefore = _accessToken;
    final response = await requestFn();
    if (response.statusCode == 401 &&
        _refreshToken != null &&
        _refreshToken!.isNotEmpty) {
      try {
        // If another concurrent request already refreshed the access token, retry immediately
        if (_accessToken != null && _accessToken != tokenBefore) {
          return await requestFn();
        }
        await refreshSession();
        return await requestFn();
      } catch (_) {
        return response;
      }
    }
    return response;
  }

  /// POST /v1/auth/change-password
  Future<LoginResponse> changePassword(ChangePasswordRequest req) async {
    final uri = Uri.parse('$baseUrl/v1/auth/change-password');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(req.toJson()),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      final res = LoginResponse.fromJson(json);
      _accessToken = res.accessToken;
      _refreshToken = res.refreshToken;
      return res;
    }

    _handleError(response);
  }

  /// POST /v1/auth/refresh (Single-flight deduplicated)
  Future<LoginResponse> refreshSession() {
    if (_ongoingRefresh != null) {
      return _ongoingRefresh!;
    }
    return _ongoingRefresh = _doRefreshSession().whenComplete(() {
      _ongoingRefresh = null;
    });
  }

  Future<LoginResponse> _doRefreshSession() async {
    final uri = Uri.parse('$baseUrl/v1/auth/refresh');
    final response = await _client.post(
      uri,
      headers: _headers(authenticated: false),
      body: jsonEncode({'refreshToken': _refreshToken}),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      final res = LoginResponse.fromJson(json);
      _accessToken = res.accessToken;
      _refreshToken = res.refreshToken;
      if (onTokenRefreshed != null) {
        await onTokenRefreshed!(res.accessToken, res.refreshToken);
      }
      return res;
    }

    _handleError(response);
  }

  /// POST /v1/auth/logout
  Future<void> logout({String? deviceId}) async {
    try {
      final uri = Uri.parse('$baseUrl/v1/auth/logout');
      await _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(deviceId != null ? {'deviceId': deviceId} : {}),
      );
    } catch (_) {
      // Ignore network errors during logout so local session teardown can complete cleanly
    } finally {
      clearTokens();
    }
  }

  /// POST /v1/auth/forgot
  Future<void> forgotPassword(String email) async {
    final uri = Uri.parse('$baseUrl/v1/auth/forgot');
    final response = await _client.post(
      uri,
      headers: _headers(authenticated: false),
      body: jsonEncode({'email': email.trim().toLowerCase()}),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    _handleError(response);
  }

  /// POST /v1/auth/reset
  Future<void> resetPassword({
    required String email,
    required String code,
    required String newPassword,
  }) async {
    final uri = Uri.parse('$baseUrl/v1/auth/reset');
    final response = await _client.post(
      uri,
      headers: _headers(authenticated: false),
      body: jsonEncode({
        'email': email.trim().toLowerCase(),
        'code': code.trim(),
        'newPassword': newPassword,
      }),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    _handleError(response);
  }

  /// PATCH /v1/auth/profile
  Future<ProfileModel> updateProfile({String? preferredLanguage}) async {
    final uri = Uri.parse('$baseUrl/v1/auth/profile');
    final response = await _sendWithAuthRetry(
      () => _client.patch(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode({'preferredLanguage': ?preferredLanguage}),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      return ProfileModel.fromJson(json);
    }

    _handleError(response);
  }

  /// POST /v1/auth/email/add
  Future<void> addEmail(String email) async {
    final uri = Uri.parse('$baseUrl/v1/auth/email/add');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode({'email': email.trim().toLowerCase()}),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    _handleError(response);
  }

  /// POST /v1/auth/email/verify
  Future<void> verifyEmail(String email, String code) async {
    final uri = Uri.parse('$baseUrl/v1/auth/email/verify');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode({
          'email': email.trim().toLowerCase(),
          'code': code.trim(),
        }),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    _handleError(response);
  }

  /// GET /v1/config
  Future<AppConfigModel> getConfig() async {
    final uri = Uri.parse('$baseUrl/v1/config');
    final response = await _client.get(
      uri,
      headers: _headers(authenticated: false),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      return AppConfigModel.fromJson(json);
    }

    _handleError(response);
  }

  /// GET /v1/releases/latest
  Future<AppReleaseModel> getLatestRelease({String? currentVersion}) async {
    final query = currentVersion != null
        ? '?current_version=$currentVersion'
        : '';
    final uri = Uri.parse('$baseUrl/v1/releases/latest$query');
    final response = await _client.get(
      uri,
      headers: _headers(authenticated: false),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      return AppReleaseModel.fromJson(json);
    }

    _handleError(response);
  }

  /// GET /v1/lookups
  Future<List<LookupValueModel>> getLookups({String? since}) async {
    final params = <String, String>{};
    if (since != null) params['since'] = since;
    final query = Uri(queryParameters: params).query;
    final uri = Uri.parse(
      '$baseUrl/v1/lookups${query.isNotEmpty ? '?$query' : ''}',
    );
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final list = jsonDecode(response.body) as List<dynamic>;
      return list
          .map((e) => LookupValueModel.fromJson(e as Map<String, dynamic>))
          .toList();
    }

    _handleError(response);
  }

  /// GET /v1/sync/area?cursor=&limit=
  Future<AreaDownloadResponse> downloadArea({
    String? cursor,
    int limit = 500,
  }) async {
    final params = <String, String>{'limit': limit.toString()};
    if (cursor != null) params['cursor'] = cursor;
    final query = Uri(queryParameters: params).query;
    final uri = Uri.parse('$baseUrl/v1/sync/area?$query');

    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      return AreaDownloadResponse.fromJson(json);
    }

    _handleError(response);
  }

  /// GET /v1/sync/area?cursor= (Raw Map accessor)
  Future<Map<String, dynamic>> getAreaSync({String? cursor}) async {
    final queryParams = cursor != null ? '?cursor=$cursor' : '';
    final uri = Uri.parse('$baseUrl/v1/sync/area$queryParams');
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }

    _handleError(response);
  }

  /// POST /v1/sync/push
  Future<SyncPushResponse> pushSync(SyncPushRequest req) async {
    final uri = Uri.parse('$baseUrl/v1/sync/push');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(req.toJson()),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      return SyncPushResponse.fromJson(json);
    }

    _handleError(response);
  }
}
