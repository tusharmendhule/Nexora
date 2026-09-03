import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';

/// Backend-connected settings service.
///
/// All reads/writes go through the Nexora v1 API backed by MongoDB.
/// Settings persist across sessions and devices.
class SettingsService {
  SettingsService._internal();

  static final SettingsService _instance = SettingsService._internal();
  factory SettingsService() => _instance;

  // ─── Token helpers ───────────────────────────────────

  Future<String?> _getFirebaseToken() async {
    try {
      final user = fb.FirebaseAuth.instance.currentUser;
      if (user == null) return null;
      return await user.getIdToken(true);
    } catch (_) {
      return null;
    }
  }

  Future<String?> _getJwtToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  Future<Map<String, String>> _headers() async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    String? token = await _getFirebaseToken();
    if (token == null || token.isEmpty) {
      token = await _getJwtToken();
    }
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  // ─── GET /api/v1/settings ───────────────────────────

  /// Fetch all settings for the current user.
  /// Returns a map of setting key -> value.
  Future<Map<String, dynamic>> getSettings() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/settings');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['settings'] != null) {
          return body['settings'] as Map<String, dynamic>;
        }
      }
    } catch (_) {}

    return {};
  }

  // ─── PUT /api/v1/settings ───────────────────────────

  /// Update one or more settings fields.
  Future<bool> updateSettings(Map<String, dynamic> updates) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/settings');
      final response = await http
          .put(url, headers: await _headers(), body: jsonEncode(updates))
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        return body['success'] == true;
      }
    } catch (_) {}

    return false;
  }

  // ─── PATCH /api/v1/users/me/password ────────────────

  /// Change the user's password.
  /// Returns null on success, error message on failure.
  Future<String?> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/me/password');
      final response = await http
          .patch(
            url,
            headers: await _headers(),
            body: jsonEncode({
              'currentPassword': currentPassword,
              'newPassword': newPassword,
            }),
          )
          .timeout(ApiConfig.timeout);

      final body = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode == 200 && body['success'] == true) {
        return null; // success
      }

      return body['message'] as String? ?? 'Failed to change password';
    } catch (_) {
      return 'Network error. Please try again.';
    }
  }
}
