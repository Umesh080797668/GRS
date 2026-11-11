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

  Completer<LoginResponse>? _refreshCompleter;

  /// Returns true if an auth token refresh is currently in flight.
  bool get isRefreshing => _refreshCompleter != null;

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
      'X-Client-Type': 'mobile',
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
    // 1. Single-flight pre-flight gate: If a token refresh is currently in flight,
    // wait for it to complete before sending this request with the new access token.
    if (_refreshCompleter != null) {
      try {
        await _refreshCompleter!.future;
      } catch (_) {
        // If refresh failed, proceed and let requestFn fail with natural auth error
      }
    }

    final tokenBefore = _accessToken;
    final response = await requestFn();
    if (response.statusCode == 401 &&
        _refreshToken != null &&
        _refreshToken!.isNotEmpty) {
      try {
        // 2. If another concurrent request already refreshed the access token while
        // this request was in flight, retry immediately without another refresh call
        if (_accessToken != null && _accessToken != tokenBefore) {
          return await requestFn();
        }

        // 3. Single-flight deduplication: all concurrent 401s join the same in-flight refresh
        await refreshSession();

        // 4. Retry the original request with the fresh access token
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
    // If a refresh is already in-flight, return the existing Completer future
    if (_refreshCompleter != null) {
      return _refreshCompleter!.future;
    }

    if (_refreshToken == null || _refreshToken!.isEmpty) {
      throw const GrsApiException(
        statusCode: 401,
        code: 'UNAUTHORIZED',
        messageKey: 'auth.no_refresh_token',
      );
    }

    final completer = Completer<LoginResponse>();
    _refreshCompleter = completer;

    _doRefreshSession()
        .then((res) {
          if (!completer.isCompleted) {
            completer.complete(res);
          }
        })
        .catchError((Object error, StackTrace st) {
          if (!completer.isCompleted) {
            completer.completeError(error, st);
          }
        })
        .whenComplete(() {
          _refreshCompleter = null;
        });

    return completer.future;
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

  /// POST /v1/auth/heartbeat
  Future<void> sendHeartbeat({String? deviceId}) async {
    final uri = Uri.parse('$baseUrl/v1/auth/heartbeat');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(deviceId != null ? {'deviceId': deviceId} : {}),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    _handleError(response);
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
        body: jsonEncode({'preferredLanguage': preferredLanguage}),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      return ProfileModel.fromJson(json);
    }

    _handleError(response);
  }

  /// POST /v1/auth/switch-area
  Future<LoginResponse> switchArea(String gnId, {String? deviceId}) async {
    final uri = Uri.parse('$baseUrl/v1/auth/switch-area');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode({'gnId': gnId, 'deviceId': ?deviceId}),
      ),
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

  /// GET /v1/auth/assignments
  Future<List<ProfileAssignmentModel>> getAssignments() async {
    final uri = Uri.parse('$baseUrl/v1/auth/assignments');
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      final list = json['assignments'] as List<dynamic>? ?? [];
      return list
          .map(
            (e) => ProfileAssignmentModel.fromJson(e as Map<String, dynamic>),
          )
          .toList();
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

  /// GET /v1/sync/changes?since=&cursor=&limit=
  Future<Map<String, dynamic>> getChanges({
    String? since,
    String? cursor,
    int? limit,
  }) async {
    final params = <String, String>{};
    if (since != null && since.isNotEmpty) {
      params['since'] = since;
    }
    if (cursor != null && cursor.isNotEmpty) {
      params['cursor'] = cursor;
    }
    if (limit != null && limit > 0) {
      params['limit'] = limit.toString();
    }

    final query = params.isNotEmpty
        ? '?${params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&')}'
        : '';
    final uri = Uri.parse('$baseUrl/v1/sync/changes$query');
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }

    _handleError(response);
  }

  // --- LEVEL 4 / MILESTONE 4 ENDPOINTS ---

  /// POST /v1/houses - Typed house entry (M4.1 / M4.4)
  Future<Map<String, dynamic>> createHousehold(
    Map<String, dynamic> data,
  ) async {
    final uri = Uri.parse('$baseUrl/v1/houses');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(data),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// GET /v1/houses - List households with scope and filters
  Future<Map<String, dynamic>> getHouseholds({
    String? gnId,
    String? teamId,
    bool? unassignedOnly,
    String? search,
    int? limit,
    String? cursor,
  }) async {
    final params = <String, String>{};
    if (gnId != null) params['gnId'] = gnId;
    if (teamId != null) params['teamId'] = teamId;
    if (unassignedOnly != null) {
      params['unassignedOnly'] = unassignedOnly.toString();
    }
    if (search != null) params['search'] = search;
    if (limit != null) params['limit'] = limit.toString();
    if (cursor != null) params['cursor'] = cursor;

    final query = Uri(queryParameters: params).query;
    final uri = Uri.parse(
      '$baseUrl/v1/houses${query.isNotEmpty ? '?$query' : ''}',
    );
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// GET /v1/houses/:id
  Future<Map<String, dynamic>> getHousehold(String id) async {
    final uri = Uri.parse('$baseUrl/v1/houses/$id');
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// PATCH /v1/houses/:id
  Future<Map<String, dynamic>> updateHousehold(
    String id,
    Map<String, dynamic> data,
  ) async {
    final uri = Uri.parse('$baseUrl/v1/houses/$id');
    final response = await _sendWithAuthRetry(
      () => _client.patch(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(data),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/houses/:id/finish - Mark household visit as completed
  Future<Map<String, dynamic>> finishHousehold(String id) async {
    final uri = Uri.parse('$baseUrl/v1/houses/$id/finish');
    final response = await _sendWithAuthRetry(
      () => _client.post(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/houses/:id/reopen - Reopen completed household visit
  Future<Map<String, dynamic>> reopenHousehold(String id) async {
    final uri = Uri.parse('$baseUrl/v1/houses/$id/reopen');
    final response = await _sendWithAuthRetry(
      () => _client.post(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// DELETE /v1/houses/:id
  Future<Map<String, dynamic>> deleteHousehold(
    String id, {
    String? reason,
  }) async {
    final uri = Uri.parse('$baseUrl/v1/houses/$id');
    final response = await _sendWithAuthRetry(
      () => _client.delete(
        uri,
        headers: _headers(authenticated: true),
        body: reason != null ? jsonEncode({'reason': reason}) : null,
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/teams/:id/houses - Assign batch of houses to team (M4.2)
  Future<Map<String, dynamic>> assignHousesToTeam(
    String teamId,
    List<String> houseIds,
  ) async {
    final uri = Uri.parse('$baseUrl/v1/teams/$teamId/houses');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode({'houseIds': houseIds}),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// DELETE /v1/teams/:id/houses/:houseId - Unassign house from team (M4.2)
  Future<Map<String, dynamic>> unassignHouseFromTeam(
    String teamId,
    String houseId,
  ) async {
    final uri = Uri.parse('$baseUrl/v1/teams/$teamId/houses/$houseId');
    final response = await _sendWithAuthRetry(
      () => _client.delete(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// GET /v1/areas/gn/:id - Get GN division setup details (M4.4)
  Future<Map<String, dynamic>> getGnDivision(String gnId) async {
    final uri = Uri.parse('$baseUrl/v1/areas/gn/$gnId');
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// PATCH /v1/areas/gn/:id - Update GN division setup details (M4.4)
  Future<Map<String, dynamic>> updateGnDivision(
    String gnId,
    Map<String, dynamic> data,
  ) async {
    final uri = Uri.parse('$baseUrl/v1/areas/gn/$gnId');
    final response = await _sendWithAuthRetry(
      () => _client.patch(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(data),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/accounts - Create single team member (M4.3)
  Future<Map<String, dynamic>> createAccount(Map<String, dynamic> data) async {
    final uri = Uri.parse('$baseUrl/v1/accounts');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(data),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/accounts/bulk - Create bulk team members (M4.3 / M5.2)
  Future<Map<String, dynamic>> createBulkAccounts(
    Map<String, dynamic> data,
  ) async {
    final uri = Uri.parse('$baseUrl/v1/accounts/bulk');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(data),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// GET /v1/accounts - List team members (M5.2 / M5.5 keyset paged)
  Future<Map<String, dynamic>> getAccounts({
    String? teamId,
    String? role,
    String? search,
    int? limit,
    String? cursor,
  }) async {
    final params = <String, String>{};
    if (teamId != null) params['teamId'] = teamId;
    if (role != null) params['role'] = role;
    if (search != null) params['search'] = search;
    if (limit != null) params['limit'] = limit.toString();
    if (cursor != null) params['cursor'] = cursor;
    final query = Uri(queryParameters: params).query;
    final uri = Uri.parse(
      '$baseUrl/v1/accounts${query.isNotEmpty ? '?$query' : ''}',
    );
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// PATCH /v1/accounts/:id/deactivate - Deactivate an account
  Future<void> deactivateAccount(String targetId) async {
    final uri = Uri.parse('$baseUrl/v1/accounts/$targetId/deactivate');
    final response = await _sendWithAuthRetry(
      () => _client.patch(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }
    _handleError(response);
  }

  /// GET /v1/clients - List team records (M4.4)
  Future<Map<String, dynamic>> getClients({
    String? teamId,
    String? householdId,
    String? search,
    int? limit,
    String? cursor,
  }) async {
    final params = <String, String>{};
    if (teamId != null) params['teamId'] = teamId;
    if (householdId != null) params['householdId'] = householdId;
    if (search != null) params['search'] = search;
    if (limit != null) params['limit'] = limit.toString();
    if (cursor != null) params['cursor'] = cursor;

    final query = Uri(queryParameters: params).query;
    final uri = Uri.parse(
      '$baseUrl/v1/clients${query.isNotEmpty ? '?$query' : ''}',
    );
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// PATCH /v1/clients/:id - Correct client record with audit trail (Decision C2 / C13)
  Future<Map<String, dynamic>> updateClient(
    String id,
    Map<String, dynamic> data,
  ) async {
    final uri = Uri.parse('$baseUrl/v1/clients/$id');
    final response = await _sendWithAuthRetry(
      () => _client.patch(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(data),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/clients - Direct data entry online (M5.8)
  Future<Map<String, dynamic>> createClient(Map<String, dynamic> data) async {
    final uri = Uri.parse('$baseUrl/v1/clients');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(data),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// PATCH /v1/accounts/:id/reactivate - Reactivate an account (M5.2)
  Future<void> reactivateAccount(String targetId) async {
    final uri = Uri.parse('$baseUrl/v1/accounts/$targetId/reactivate');
    final response = await _sendWithAuthRetry(
      () => _client.patch(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }
    _handleError(response);
  }

  /// POST /v1/accounts/:id/reset-password - Reset password (M5.2)
  Future<Map<String, dynamic>> resetAccountPassword(String targetId) async {
    final uri = Uri.parse('$baseUrl/v1/accounts/$targetId/reset-password');
    final response = await _sendWithAuthRetry(
      () => _client.post(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/accounts/:id/reissue-password - Reissue password (M5.2)
  Future<Map<String, dynamic>> reissueAccountPassword(String targetId) async {
    final uri = Uri.parse('$baseUrl/v1/accounts/$targetId/reissue-password');
    final response = await _sendWithAuthRetry(
      () => _client.post(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/accounts/batches/:id/reissue - Reissue whole batch (M5.2)
  Future<Map<String, dynamic>> reissueBatch(String batchId) async {
    final uri = Uri.parse('$baseUrl/v1/accounts/batches/$batchId/reissue');
    final response = await _sendWithAuthRetry(
      () => _client.post(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// GET /v1/areas/districts - List all 25 districts (M5.3)
  Future<List<dynamic>> getDistricts() async {
    final uri = Uri.parse('$baseUrl/v1/areas/districts');
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as List<dynamic>;
    }
    _handleError(response);
  }

  /// GET /v1/areas/ds - List DS divisions (M5.3)
  Future<List<dynamic>> getDsDivisions({String? districtId}) async {
    final params = <String, String>{};
    if (districtId != null) params['districtId'] = districtId;
    final query = Uri(queryParameters: params).query;
    final uri = Uri.parse(
      '$baseUrl/v1/areas/ds${query.isNotEmpty ? '?$query' : ''}',
    );
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final decoded = jsonDecode(response.body);
      if (decoded is List) return decoded;
      if (decoded is Map && decoded['items'] is List) {
        return decoded['items'] as List<dynamic>;
      }
      return [];
    }
    _handleError(response);
  }

  /// GET /v1/areas/gn - List GN divisions (M5.3)
  Future<List<dynamic>> getGnDivisions({String? dsId}) async {
    final params = <String, String>{};
    if (dsId != null) params['dsId'] = dsId;
    final query = Uri(queryParameters: params).query;
    final uri = Uri.parse(
      '$baseUrl/v1/areas/gn${query.isNotEmpty ? '?$query' : ''}',
    );
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final decoded = jsonDecode(response.body);
      if (decoded is List) return decoded;
      if (decoded is Map && decoded['items'] is List) {
        return decoded['items'] as List<dynamic>;
      }
      return [];
    }
    _handleError(response);
  }

  /// GET /v1/areas/teams - List teams (M5.3)
  Future<List<dynamic>> getTeams({String? gnId}) async {
    final params = <String, String>{};
    if (gnId != null) params['gnId'] = gnId;
    final query = Uri(queryParameters: params).query;
    final uri = Uri.parse(
      '$baseUrl/v1/areas/teams${query.isNotEmpty ? '?$query' : ''}',
    );
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      final decoded = jsonDecode(response.body);
      if (decoded is List) return decoded;
      if (decoded is Map && decoded['items'] is List) {
        return decoded['items'] as List<dynamic>;
      }
      return [];
    }
    _handleError(response);
  }

  /// PATCH /v1/areas/teams/:id - Update team member limit or leader (M5.3)
  Future<Map<String, dynamic>> updateTeam(
    String teamId, {
    int? maxMembers,
    String? leaderId,
  }) async {
    final uri = Uri.parse('$baseUrl/v1/areas/teams/$teamId');
    final payload = <String, dynamic>{};
    if (maxMembers != null) payload['maxMembers'] = maxMembers;
    if (leaderId != null) payload['leaderId'] = leaderId;

    final response = await _sendWithAuthRetry(
      () => _client.patch(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(payload),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/areas/import-csv - Import pilot area CSV (M5.3)
  Future<Map<String, dynamic>> importPilotAreaCsv(
    String csvContent, {
    bool dryRun = false,
  }) async {
    final uri = Uri.parse('$baseUrl/v1/areas/import-csv');
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode({'csvContent': csvContent, 'dryRun': dryRun}),
      ),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// GET /v1/stats/progress - Get progress summary & area breakdown (M5.6 & M5.7)
  Future<Map<String, dynamic>> getProgressStats({
    String? areaType,
    String? areaId,
  }) async {
    final params = <String, String>{};
    if (areaType != null) params['areaType'] = areaType;
    if (areaId != null) params['areaId'] = areaId;
    final query = Uri(queryParameters: params).query;
    final uri = Uri.parse(
      '$baseUrl/v1/stats/progress${query.isNotEmpty ? '?$query' : ''}',
    );
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// GET /v1/duplicates - List flagged duplicate candidate pairs (M6.4)
  Future<Map<String, dynamic>> getDuplicates({
    String status = 'open',
    String? classification,
    int? minScore,
    String? cursor,
    int limit = 20,
  }) async {
    final query = <String, String>{
      'status': status,
      'limit': limit.toString(),
      if (classification != null && classification != 'all')
        'classification': classification,
      if (minScore != null) 'minScore': minScore.toString(),
      if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
    };
    final uri = Uri.parse(
      '$baseUrl/v1/duplicates',
    ).replace(queryParameters: query);
    final response = await _sendWithAuthRetry(
      () => _client.get(uri, headers: _headers(authenticated: true)),
    );
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/duplicates/:id/confirm - Confirm a duplicate pair (M6.4)
  Future<Map<String, dynamic>> confirmDuplicate(
    String id, {
    String? canonicalClientId,
    String? reason,
  }) async {
    final uri = Uri.parse('$baseUrl/v1/duplicates/$id/confirm');
    final body = <String, dynamic>{
      if (canonicalClientId != null && canonicalClientId.isNotEmpty)
        'canonicalClientId': canonicalClientId,
      if (reason != null && reason.isNotEmpty) 'reason': reason,
    };
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(body),
      ),
    );
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }

  /// POST /v1/duplicates/:id/dismiss - Dismiss a false-positive pair (M6.4)
  Future<Map<String, dynamic>> dismissDuplicate(
    String id, {
    String? reason,
  }) async {
    final uri = Uri.parse('$baseUrl/v1/duplicates/$id/dismiss');
    final body = <String, dynamic>{
      if (reason != null && reason.isNotEmpty) 'reason': reason,
    };
    final response = await _sendWithAuthRetry(
      () => _client.post(
        uri,
        headers: _headers(authenticated: true),
        body: jsonEncode(body),
      ),
    );
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    _handleError(response);
  }
}
