import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;

import '../config/api_config.dart';

/// Centralized HTTP client for Nexora API.
///
/// Handles:
/// - Automatic Firebase ID token injection
/// - Automatic JSON encoding/decoding
/// - Consistent error handling
/// - Token caching with auto-refresh
class ApiClient {
  ApiClient._internal();

  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;

  // ─── Token Management ───────────────────────────────

  /// Get a valid Firebase ID token.
  ///
  /// Attempts to use the cached token first. If the cached token is expired
  /// or missing, refreshes from Firebase Auth.
  Future<String?> _getIdToken() async {
    try {
      final user = fb.FirebaseAuth.instance.currentUser;
      if (user == null) return null;

      // getIdToken(true) forces a refresh if the token is near expiry
      return await user.getIdToken(true);
    } catch (e) {
      return null;
    }
  }

  /// Clear all local auth data (used on logout).
  Future<void> clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    await prefs.remove('user_data');
  }

  /// Check if user is authenticated (has a Firebase user).
  bool get isAuthenticated => fb.FirebaseAuth.instance.currentUser != null;

  // ─── Headers ────────────────────────────────────────

  /// Build headers with optional Firebase ID token.
  Future<Map<String, String>> _headers({bool includeAuth = true}) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (includeAuth) {
      final token = await _getIdToken();
      if (token != null) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    return headers;
  }

  // ─── HTTP Methods ──────────────────────────────────

  /// GET request.
  Future<ApiResponse> get(String path, {bool auth = true}) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}$path');
      final response = await http
          .get(url, headers: await _headers(includeAuth: auth))
          .timeout(ApiConfig.timeout);
      return _handleResponse(response);
    } catch (e) {
      return _handleError(e);
    }
  }

  /// POST request.
  Future<ApiResponse> post(String path,
      {Map<String, dynamic>? body, bool auth = true}) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}$path');
      final response = await http
          .post(url,
              headers: await _headers(includeAuth: auth),
              body: body != null ? jsonEncode(body) : null)
          .timeout(ApiConfig.timeout);
      return _handleResponse(response);
    } catch (e) {
      return _handleError(e);
    }
  }

  /// PATCH request.
  Future<ApiResponse> patch(String path,
      {Map<String, dynamic>? body, bool auth = true}) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}$path');
      final response = await http
          .patch(url,
              headers: await _headers(includeAuth: auth),
              body: body != null ? jsonEncode(body) : null)
          .timeout(ApiConfig.timeout);
      return _handleResponse(response);
    } catch (e) {
      return _handleError(e);
    }
  }

  /// DELETE request.
  Future<ApiResponse> delete(String path, {bool auth = true}) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}$path');
      final response = await http
          .delete(url, headers: await _headers(includeAuth: auth))
          .timeout(ApiConfig.timeout);
      return _handleResponse(response);
    } catch (e) {
      return _handleError(e);
    }
  }

  // ─── Response Handling ─────────────────────────────

  ApiResponse _handleResponse(http.Response response) {
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return ApiResponse(
        success: body['success'] as bool? ?? false,
        statusCode: response.statusCode,
        data: body,
        message: body['message'] as String?,
      );
    } catch (_) {
      return ApiResponse(
        success: false,
        statusCode: response.statusCode,
        message: 'Failed to parse response',
      );
    }
  }

  ApiResponse _handleError(Object error) {
    return ApiResponse(
      success: false,
      statusCode: 0,
      message: 'Network error: ${error.toString()}',
    );
  }
}

/// Consistent API response wrapper.
class ApiResponse {
  final bool success;
  final int statusCode;
  final Map<String, dynamic>? data;
  final String? message;

  const ApiResponse({
    required this.success,
    required this.statusCode,
    this.data,
    this.message,
  });

  bool get isUnauthorized => statusCode == 401;
  bool get isNotFound => statusCode == 404;
  bool get isServerError => statusCode >= 500;
}
