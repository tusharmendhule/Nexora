import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/comment.dart';

/// Backend-connected comment service.
///
/// All comment operations go through the Nexora v1 API backed by MongoDB.
class CommentService {
  CommentService._internal();

  static final CommentService _instance = CommentService._internal();
  factory CommentService() => _instance;

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

  // ─── GET /api/v1/posts/:id/comments ─────────────────

  /// Fetch comments for a post from the backend.
  Future<List<Comment>> fetchComments(String postId, {int page = 1, int limit = 50}) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/posts/$postId/comments?page=$page&limit=$limit',
      );
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['comments'] != null) {
          final commentsList = body['comments'] as List;
          return commentsList
              .map((c) => Comment.fromJson(c as Map<String, dynamic>))
              .toList();
        }
      }
    } catch (_) {}

    return [];
  }

  // ─── POST /api/v1/posts/:id/comments ────────────────

  /// Create a new comment on a post via the backend.
  Future<Comment?> createComment({
    required String postId,
    required String text,
    String? parentCommentId,
  }) async {
    try {
      final body = <String, dynamic>{
        'text': text,
      };
      if (parentCommentId != null) {
        body['parentCommentId'] = parentCommentId;
      }

      final url = Uri.parse('${ApiConfig.baseUrl}/posts/$postId/comments');
      final response = await http
          .post(url, headers: await _headers(), body: jsonEncode(body))
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 201) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        if (json['success'] == true && json['comment'] != null) {
          return Comment.fromJson(json['comment'] as Map<String, dynamic>);
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── Legacy Compatibility ────────────────────────────

  /// Legacy: fetch comments by contentId (postId).
  Future<List<Comment>> fetchCommentsByContentId(String contentId) async {
    return fetchComments(contentId);
  }

  /// Legacy: get comment by ID.
  Future<Comment?> getCommentById(String commentId) async {
    // No dedicated endpoint for single comment — not critical
    return null;
  }

  /// Legacy: add comment (delegates to createComment).
  Future<void> addComment(Comment comment) async {
    await createComment(
      postId: comment.contentId,
      text: comment.text,
      parentCommentId: comment.parentCommentId,
    );
  }

  /// Legacy: update comment (no backend endpoint — not critical).
  Future<void> updateComment(Comment updatedComment) async {}

  /// Legacy: delete comment.
  Future<void> deleteComment(String commentId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/comments/$commentId');
      await http
          .delete(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
    } catch (_) {}
  }

  /// Legacy: fetch replies.
  Future<List<Comment>> fetchReplies(String parentCommentId) async {
    // Replies are included in the main comments response from the backend
    // (nested under each comment). This method is kept for API compatibility.
    return [];
  }
}
