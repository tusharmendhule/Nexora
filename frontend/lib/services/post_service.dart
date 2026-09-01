import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../models/post.dart';

/// Backend-connected post service.
///
/// All reads/writes go through the Nexora v1 API backed by MongoDB.
class PostService {
  PostService._internal();

  static final PostService _instance = PostService._internal();
  factory PostService() => _instance;

  // ─── Token helper ────────────────────────────────────

  Future<String?> _getIdToken() async {
    try {
      final user = fb.FirebaseAuth.instance.currentUser;
      if (user == null) return null;
      return await user.getIdToken(true);
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, String>> _headers() async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    final token = await _getIdToken();
    if (token != null) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  // ─── GET /api/v1/posts ──────────────────────────────

  /// Fetch posts with pagination.
  ///
  /// [page] starts at 1, [limit] defaults to 20.
  /// Returns a map with `posts` list and `pagination` info.
  Future<Map<String, dynamic>> fetchPosts({int page = 1, int limit = 20}) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/posts?page=$page&limit=$limit',
      );
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          final postsList = (body['posts'] as List?) ?? [];
          final posts = postsList
              .map((p) => Post.fromJson(p as Map<String, dynamic>))
              .toList();
          final pagination = body['pagination'] as Map<String, dynamic>? ?? {};
          return {
            'posts': posts,
            'pagination': pagination,
          };
        }
      }
    } catch (_) {}

    return {'posts': <Post>[], 'pagination': <String, dynamic>{}};
  }

  // ─── GET /api/v1/posts/:id ──────────────────────────

  /// Fetch a single post by its ID.
  Future<Post?> getPostById(String postId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/posts/$postId');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['post'] != null) {
          return Post.fromJson(body['post'] as Map<String, dynamic>);
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── POST /api/v1/posts ─────────────────────────────

  /// Create a new post via the backend.
  ///
  /// [text] is the post content.
  /// [contentType] should be one of: text, image, video, audio, link.
  /// [media] is an optional list of media items with url/type/thumbnailUrl.
  /// [tags] are user-defined tags.
  /// [hashtags] are extracted hashtags.
  Future<Post?> createPost({
    required String text,
    String contentType = 'text',
    List<Map<String, dynamic>>? media,
    List<String>? tags,
    List<String>? hashtags,
    String? linkUrl,
    String? linkTitle,
    String? linkDescription,
    String? visibility,
  }) async {
    try {
      final body = <String, dynamic>{
        'text': text,
        'contentType': contentType,
      };

      if (media != null && media.isNotEmpty) body['media'] = media;
      if (tags != null && tags.isNotEmpty) body['tags'] = tags;
      if (hashtags != null && hashtags.isNotEmpty) body['hashtags'] = hashtags;
      if (linkUrl != null) body['linkUrl'] = linkUrl;
      if (linkTitle != null) body['linkTitle'] = linkTitle;
      if (linkDescription != null) body['linkDescription'] = linkDescription;
      if (visibility != null) body['visibility'] = visibility;

      final url = Uri.parse('${ApiConfig.baseUrl}/posts');
      final response = await http
          .post(url, headers: await _headers(), body: jsonEncode(body))
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 201) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        if (json['success'] == true && json['post'] != null) {
          return Post.fromJson(json['post'] as Map<String, dynamic>);
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── PATCH /api/v1/posts/:id ────────────────────────

  /// Update a post via the backend.
  ///
  /// Only the post owner can update their post.
  Future<Post?> updatePost({
    required String postId,
    String? text,
    String? contentType,
    List<Map<String, dynamic>>? media,
    List<String>? tags,
    List<String>? hashtags,
    String? visibility,
  }) async {
    try {
      final body = <String, dynamic>{};
      if (text != null) body['text'] = text;
      if (contentType != null) body['contentType'] = contentType;
      if (media != null) body['media'] = media;
      if (tags != null) body['tags'] = tags;
      if (hashtags != null) body['hashtags'] = hashtags;
      if (visibility != null) body['visibility'] = visibility;

      if (body.isEmpty) return null;

      final url = Uri.parse('${ApiConfig.baseUrl}/posts/$postId');
      final response = await http
          .patch(url, headers: await _headers(), body: jsonEncode(body))
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        if (json['success'] == true && json['post'] != null) {
          return Post.fromJson(json['post'] as Map<String, dynamic>);
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── DELETE /api/v1/posts/:id ───────────────────────

  /// Delete a post via the backend.
  ///
  /// Only the post owner, moderators, or admins can delete.
  Future<bool> deletePost(String postId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/posts/$postId');
      final response = await http
          .delete(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return json['success'] == true;
      }
    } catch (_) {}

    return false;
  }

  // ─── Legacy Compatibility ───────────────────────────

  /// Legacy helper that returns all posts (ignores pagination).
  /// Used by screens that haven't been updated to use fetchPosts() yet.
  Future<List<Post>> fetchPostsList() async {
    final result = await fetchPosts(page: 1, limit: 100);
    return result['posts'] as List<Post>;
  }
}
