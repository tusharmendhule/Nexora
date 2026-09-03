import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';

/// Backend-connected report service.
///
/// All report operations go through the Nexora v1 API backed by MongoDB.
class ReportService {
  ReportService._internal();

  static final ReportService _instance = ReportService._internal();
  factory ReportService() => _instance;

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

  // ─── POST /api/v1/posts/:id/report ───────────────────

  /// Report a post.
  Future<bool> reportPost({
    required String postId,
    required String reason,
    String description = '',
  }) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/posts/$postId/report');
      final response = await http
          .post(
            url,
            headers: await _headers(),
            body: jsonEncode({
              'reason': reason,
              'description': description,
            }),
          )
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 201) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        return body['success'] == true;
      }
    } catch (_) {}
    return false;
  }

  // ─── POST /api/v1/reports ────────────────────────────

  /// Generic report creation (Post, Comment, or User).
  Future<bool> createReport({
    required String targetType,
    required String targetId,
    required String reason,
    String description = '',
  }) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/reports');
      final response = await http
          .post(
            url,
            headers: await _headers(),
            body: jsonEncode({
              'targetType': targetType,
              'targetId': targetId,
              'reason': reason,
              'description': description,
            }),
          )
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 201) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        return body['success'] == true;
      }
    } catch (_) {}
    return false;
  }

  // ─── GET /api/v1/reports/reasons ─────────────────────

  /// Get list of valid report reasons.
  Future<List<String>> getReasons() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/reports/reasons');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['reasons'] != null) {
          return (body['reasons'] as List).map((r) => r.toString()).toList();
        }
      }
    } catch (_) {}
    return [];
  }

  // ─── GET /api/v1/reports/mine ────────────────────────

  /// Get current user's own reports.
  Future<List<Map<String, dynamic>>> getMyReports({int page = 1, int limit = 20}) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/reports/mine?page=$page&limit=$limit',
      );
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['reports'] != null) {
          return (body['reports'] as List)
              .map((r) => r as Map<String, dynamic>)
              .toList();
        }
      }
    } catch (_) {}
    return [];
  }
}
