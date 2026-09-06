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
  /// Clips are stories with storyType='clip' (reels-style videos).
  Future<List<Clip>> fetchClips() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories')
          .replace(queryParameters: {'type': 'clip'});
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['stories'] != null) {
          final storiesList = body['stories'] as List;
          return storiesList
              // Only actual clips (video, marked as clip) belong in the
              // Clips tab. Unlike moments, clips persist in the feed —
              // they are NOT auto-removed after being viewed. The user
              // must explicitly delete a clip to remove it.
              .where((s) {
                final map = s as Map<String, dynamic>;
                final storyType = map['storyType']?.toString() ?? 'moment';
                final mediaType = map['mediaType']?.toString() ?? 'image';
                return storyType == 'clip' &&
                    mediaType == 'video';
              })
              .map((s) {
            final map = s as Map<String, dynamic>;
            return Clip(
              id: map['_id']?.toString() ?? '',
              creatorId: map['userId']?.toString() ?? '',
              creatorUsername: map['displayName']?.toString() ?? map['username']?.toString() ?? '',
              mediaType: map['mediaType']?.toString() ?? 'video',
              videoUrl: map['mediaUrl']?.toString() ?? '',
              caption: map['caption']?.toString() ?? '',
              music: null,
              label: NexoraLabel.pendingVerification,
              // Real engagement counts + per-user state from the backend
              // (stories are the backend model behind clips).
              likeCount: (map['likeCount'] as num?)?.toInt() ?? 0,
              commentCount: (map['commentCount'] as num?)?.toInt() ?? 0,
              isLiked: map['likedByMe'] as bool? ?? map['isLiked'] as bool? ?? false,
              isViewed: map['viewedByMe'] as bool? ?? map['isViewed'] as bool? ?? false,
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
            mediaType: map['mediaType']?.toString() ?? 'video',
            videoUrl: map['mediaUrl']?.toString() ?? '',
            caption: map['caption']?.toString() ?? '',
            music: null,
            label: NexoraLabel.pendingVerification,
            likeCount: (map['likeCount'] as num?)?.toInt() ?? 0,
            commentCount: (map['commentCount'] as num?)?.toInt() ?? 0,
            isLiked: map['likedByMe'] as bool? ?? map['isLiked'] as bool? ?? false,
            isViewed: map['viewedByMe'] as bool? ?? map['isViewed'] as bool? ?? false,
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
              'storyType': 'clip',
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

  // ─── POST /api/v1/stories/:id/like ─────────────────────

  /// Toggle a like on a clip (clips are stored as video stories).
  /// Returns `{ isLiked, likesCount }` on success or `{ error: true }`
  /// on failure so the UI can roll back.
  Future<Map<String, dynamic>> toggleLike(String clipId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories/$clipId/like');
      final response = await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          return {
            'isLiked': body['isLiked'] as bool? ?? false,
            'likesCount': (body['likesCount'] as num?)?.toInt() ?? 0,
          };
        }
      }
    } catch (_) {}

    return {'error': true};
  }

  // ─── POST /api/v1/stories/:id/view ─────────────────────

  /// Record that the current user watched this clip.
  Future<void> markAsViewed(String clipId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/stories/$clipId/view');
      await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
    } catch (_) {}
  }

  // ─── Legacy compatibility ────────────────────────────

  /// Legacy: update clip (not supported by backend — kept for API compat).
  Future<void> updateClip(Clip updatedClip) async {
    // Stories are ephemeral and immutable once created.
  }
}
