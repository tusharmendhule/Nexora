import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;

import '../config/api_config.dart';

/// Centralized HTTP client for Nexora API.
///
/// Handles:
/// - Firebase ID token injection (Google sign-in users)
/// - JWT token injection (email/password local users)
/// - Automatic JSON encoding/decoding
/// - Consistent error handling
/// - Token caching with auto-refresh
class ApiClient {
  ApiClient._internal();

  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;

  // ─── Token Management ───────────────────────────────

  /// Get the stored JWT token for local (email/password) auth.
  Future<String?> _getJwtToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  /// Store a JWT token from local auth.
  Future<void> setJwtToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
  }

  /// Get a valid Firebase ID token.
  Future<String?> _getFirebaseToken() async {
    try {
      final user = fb.FirebaseAuth.instance.currentUser;
      if (user == null) return null;
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

  /// Check if user is authenticated (has a Firebase user or JWT).
  Future<bool> get isAuthenticated async {
    if (fb.FirebaseAuth.instance.currentUser != null) return true;
    final jwt = await _getJwtToken();
    return jwt != null && jwt.isNotEmpty;
  }

  // ─── Headers ────────────────────────────────────────

  /// Build headers with the best available auth token.
  ///
  /// Prefers Firebase ID token if the user signed in via Google;
  /// falls back to JWT for email/password users.
  Future<Map<String, String>> _headers({bool includeAuth = true}) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (includeAuth) {
      String? token;

      // Try Firebase token first (Google sign-in users)
      token = await _getFirebaseToken();

      // Fall back to JWT token (email/password users)
      if (token == null || token.isEmpty) {
        token = await _getJwtToken();
      }

      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    return headers;
  }

  // ─── HTTP Methods ──────────────────────────────────

  /// GET request.
  Future<ApiResponse> get(String path, {bool auth = true}) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');
    try {
      final response = await http
          .get(url, headers: await _headers(includeAuth: auth))
          .timeout(ApiConfig.timeout);
      return _handleResponse(response);
    } catch (e) {
      return _handleError(e, url);
    }
  }

  /// POST request.
  Future<ApiResponse> post(String path,
      {Map<String, dynamic>? body, bool auth = true}) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');
    try {
      final response = await http
          .post(url,
              headers: await _headers(includeAuth: auth),
              body: body != null ? jsonEncode(body) : null)
          .timeout(ApiConfig.timeout);
      return _handleResponse(response);
    } catch (e) {
      return _handleError(e, url);
    }
  }

  /// PATCH request.
  Future<ApiResponse> patch(String path,
      {Map<String, dynamic>? body, bool auth = true}) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');
    try {
      final response = await http
          .patch(url,
              headers: await _headers(includeAuth: auth),
              body: body != null ? jsonEncode(body) : null)
          .timeout(ApiConfig.timeout);
      return _handleResponse(response);
    } catch (e) {
      return _handleError(e, url);
    }
  }

  /// DELETE request.
  Future<ApiResponse> delete(String path, {bool auth = true}) async {
    final url = Uri.parse('${ApiConfig.baseUrl}$path');
    try {
      final response = await http
          .delete(url, headers: await _headers(includeAuth: auth))
          .timeout(ApiConfig.timeout);
      return _handleResponse(response);
    } catch (e) {
      return _handleError(e, url);
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

  ApiResponse _handleError(Object error, Uri url) {
    final String detail;
    if (error is TimeoutException) {
      detail = 'No response from $url within ${ApiConfig.timeout.inSeconds}s. '
          'Make sure the backend is running and reachable — check the Server '
          'address (gear icon on the login screen).';
    } else {
      detail = 'Request to $url failed: ${error.toString()}';
    }
    return ApiResponse(
      success: false,
      statusCode: 0,
      message: 'Network error: $detail',
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
