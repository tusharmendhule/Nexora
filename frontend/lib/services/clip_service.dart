import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/clip.dart';
import '../models/nexora_label.dart';

/// Backend-connected clip service.
///
/// Clips are short video content (like Reels/TikToks).
/// They are stored on the backend as Story documents with mediaType='video'.
class ClipService {
  ClipService._internal();

  static final ClipService _instance = ClipService._internal();
  factory ClipService() => _instance;

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

  // ─── GET /api/v1/stories (clips are video stories) ────

  /// Fetch all clips from the backend.
  /// Clips are stories with mediaType='video'.
  Future<List<Clip>> fetchClips() async {
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
            return Clip(
              id: map['_id']?.toString() ?? '',
              creatorId: map['userId']?.toString() ?? '',
              creatorUsername: map['displayName']?.toString() ?? map['username']?.toString() ?? '',
              videoUrl: map['mediaUrl']?.toString() ?? '',
              caption: map['caption']?.toString() ?? '',
              music: null,
              label: NexoraLabel.editedContent,
              createdAt: map['createdAt'] != null
                  ? DateTime.tryParse(map['createdAt'].toString()) ?? DateTime.now()
                  : DateTime.now(),
            );
          }).toList();
        }
      }
    } catch (_) {}

    return [];
  }

  // ─── GET /api/v1/stories/:id ──────────────────────────

  /// Get a specific clip by ID.
  Future<Clip?> getClipById(String clipId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories/$clipId');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['story'] != null) {
          final map = body['story'] as Map<String, dynamic>;
          return Clip(
            id: map['_id']?.toString() ?? '',
            creatorId: map['userId']?.toString() ?? '',
            creatorUsername: map['displayName']?.toString() ?? '',
            videoUrl: map['mediaUrl']?.toString() ?? '',
            caption: map['caption']?.toString() ?? '',
            music: null,
            label: NexoraLabel.editedContent,
            createdAt: map['createdAt'] != null
                ? DateTime.tryParse(map['createdAt'].toString()) ?? DateTime.now()
                : DateTime.now(),
          );
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── POST /api/v1/stories ──────────────────────────────

  /// Create a new clip on the backend.
  Future<void> createClip(Clip clip) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories');
      await http
          .post(
            url,
            headers: await _headers(),
            body: jsonEncode({
              'mediaUrl': clip.videoUrl,
              'mediaType': 'video',
              'caption': clip.caption,
            }),
          )
          .timeout(ApiConfig.timeout);
    } catch (_) {}
  }

  // ─── DELETE /api/v1/stories/:id ────────────────────────

  /// Delete a clip from the backend.
  Future<void> deleteClip(String clipId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories/$clipId');
      await http
          .delete(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
    } catch (_) {}
  }

  // ─── Legacy compatibility ────────────────────────────

  /// Legacy: update clip (not supported by backend — kept for API compat).
  Future<void> updateClip(Clip updatedClip) async {
    // Stories are ephemeral and immutable once created.
  }
}
