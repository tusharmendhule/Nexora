import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/moment.dart';

/// Backend-connected moment (story) service.
///
/// All read/write operations go through the Nexora v1 API backed by MongoDB.
/// Stories are ephemeral 24-hour media items.
class MomentService {
  MomentService._internal();

  static final MomentService _instance = MomentService._internal();

  factory MomentService() => _instance;

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

  // ─── GET /api/v1/stories ──────────────────────────────

  /// Fetch all active moments (stories) from the backend.
  Future<List<Moment>> fetchMoments() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['stories'] != null) {
          final storiesList = body['stories'] as List;
          return storiesList.map((s) {
            final map = s as Map<String, dynamic>;
            return Moment(
              id: map['_id']?.toString() ?? '',
              creatorId: map['userId']?.toString() ?? '',
              creatorUsername: map['displayName']?.toString() ?? map['username']?.toString() ?? '',
              mediaUrl: map['mediaUrl']?.toString() ?? '',
              mediaType: map['mediaType']?.toString() ?? 'image',
              label: null,
              createdAt: map['createdAt'] != null
                  ? DateTime.tryParse(map['createdAt'].toString()) ?? DateTime.now()
                  : DateTime.now(),
              expiresAt: map['expiresAt'] != null
                  ? DateTime.tryParse(map['expiresAt'].toString()) ?? DateTime.now().add(const Duration(hours: 24))
                  : DateTime.now().add(const Duration(hours: 24)),
              isViewed: map['isViewed'] as bool? ?? false,
            );
          }).toList();
        }
      }
    } catch (_) {
      // Fall through to empty list
    }

    return [];
  }

  // ─── GET /api/v1/stories/:id ──────────────────────────

  /// Get a specific moment by ID.
  Future<Moment?> getMomentById(String momentId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories/$momentId');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['story'] != null) {
          final map = body['story'] as Map<String, dynamic>;
          return Moment(
            id: map['_id']?.toString() ?? '',
            creatorId: map['userId']?.toString() ?? '',
            creatorUsername: map['displayName']?.toString() ?? '',
            mediaUrl: map['mediaUrl']?.toString() ?? '',
            mediaType: map['mediaType']?.toString() ?? 'image',
            label: null,
            createdAt: map['createdAt'] != null
                ? DateTime.tryParse(map['createdAt'].toString()) ?? DateTime.now()
                : DateTime.now(),
            expiresAt: map['expiresAt'] != null
                ? DateTime.tryParse(map['expiresAt'].toString()) ?? DateTime.now().add(const Duration(hours: 24))
                : DateTime.now().add(const Duration(hours: 24)),
          );
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── POST /api/v1/stories ──────────────────────────────

  /// Create a new moment (story) on the backend.
  Future<void> createMoment(Moment moment) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories');
      final response = await http
          .post(
            url,
            headers: await _headers(),
            body: jsonEncode({
              'mediaUrl': moment.mediaUrl,
              'mediaType': moment.mediaType,
              'caption': moment.creatorUsername,
            }),
          )
          .timeout(ApiConfig.timeout);

      // The backend stores it — no local state needed
      if (response.statusCode == 201) {
        return;
      }
    } catch (_) {}
  }

  // ─── DELETE /api/v1/stories/:id ────────────────────────

  /// Delete a moment (story) from the backend.
  Future<void> deleteMoment(String momentId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories/$momentId');
      await http
          .delete(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
    } catch (_) {}
  }

  // ─── POST /api/v1/stories/:id/view ─────────────────────

  /// Mark a moment as viewed.
  Future<void> markAsViewed(String momentId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories/$momentId/view');
      await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
    } catch (_) {}
  }

  // ─── POST /api/v1/stories/:id/like ─────────────────────

  /// Toggle like on a moment (story).
  Future<Map<String, dynamic>> toggleLike(String momentId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories/$momentId/like');
      final response = await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        return {
          'isLiked': body['isLiked'] as bool? ?? false,
          'likesCount': body['likesCount'] as int? ?? 0,
        };
      }
    } catch (_) {}

    return {'isLiked': false, 'likesCount': 0};
  }

  // ─── Legacy compatibility ────────────────────────────

  /// Legacy: update moment (not supported by backend — kept for API compat).
  Future<void> updateMoment(Moment updatedMoment) async {
    // Backend doesn't have a PATCH endpoint for stories.
    // Stories are ephemeral and immutable once created.
  }
}
