import 'dart:convert';
import 'dart:math';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/message.dart';
import 'api_exception.dart';

/// Backend-connected message service.
///
/// All message operations go through the Nexora backend backed by MongoDB:
///  - GET    /api/messages/:userId   → chat history
///  - POST   /api/messages           → send message (idempotency key + block check)
///  - PUT    /api/messages/:senderId/read → mark messages as read
///  - DELETE /api/messages/thread/:userId → clear conversation (soft delete)
///  - DELETE /api/messages/:messageId     → delete own message
class MessageService {
  MessageService._internal();

  static final MessageService _instance = MessageService._internal();
  factory MessageService() => _instance;

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

  // ─── GET /api/messages/:userId ───────────────────────

  /// Fetch chat history with a specific user from the backend.
  ///
  /// Throws [ApiException] on network/server errors so screens can surface
  /// them instead of silently showing an empty chat.
  Future<List<Message>> fetchMessages(
    String userId, {
    int page = 1,
    int limit = 50,
  }) async {
    final url = Uri.parse(
      '${ApiConfig.legacyBaseUrl}/messages/$userId?page=$page&limit=$limit',
    );
    final http.Response response;
    try {
      response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
    } catch (e) {
      throw ApiException('Network error loading messages', statusCode: 0);
    }

    if (response.statusCode != 200) {
      throw ApiException(
        'Failed to load messages (${response.statusCode})',
        statusCode: response.statusCode,
      );
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (body['success'] != true) {
      throw ApiException(
        body['message']?.toString() ?? 'Failed to load messages',
        statusCode: response.statusCode,
      );
    }

    final messagesList = body['chatHistory'] as List? ?? [];
    return messagesList
        .whereType<Map<String, dynamic>>()
        .map(Message.fromJson)
        .toList();
  }

  // ─── POST /api/messages ──────────────────────────────

  /// Send a message to another user via the backend.
  ///
  /// Uses an idempotency key so retries never create duplicates.
  /// Returns null on failure (caller decides how to surface it).
  Future<Message?> sendMessage({
    required String recipientId,
    required String text,
  }) async {
    try {
      // Generate idempotency key to prevent duplicate messages
      final idempotencyKey =
          '${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(999999)}';

      final url = Uri.parse('${ApiConfig.legacyBaseUrl}/messages');
      final response = await http
          .post(
            url,
            headers: await _headers(),
            body: jsonEncode({
              'recipientId': recipientId,
              'text': text,
              'idempotencyKey': idempotencyKey,
            }),
          )
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 201 || response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['message'] != null) {
          return Message.fromJson(body['message'] as Map<String, dynamic>);
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── POST /api/messages/image ────────────────────────

  /// Send an image message (multipart) to another user via the backend.
  /// Returns null on failure (caller decides how to surface it).
  Future<Message?> sendImageMessage({
    required String recipientId,
    required String imagePath,
    String text = '',
  }) async {
    try {
      final idempotencyKey =
          'img_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(999999)}';

      final token = await _getFirebaseToken();
      final authToken = (token == null || token.isEmpty)
          ? await _getJwtToken()
          : token;
      if (authToken == null || authToken.isEmpty) return null;

      final url = Uri.parse('${ApiConfig.legacyBaseUrl}/messages/image');
      final request = http.MultipartRequest('POST', url);
      request.headers['Authorization'] = 'Bearer $authToken';
      request.fields['recipientId'] = recipientId;
      request.fields['idempotencyKey'] = idempotencyKey;
      if (text.isNotEmpty) {
        request.fields['text'] = text;
      }
      request.files.add(await http.MultipartFile.fromPath('image', imagePath));

      final streamedResponse = await request.send().timeout(ApiConfig.timeout);
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 201 || response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['message'] != null) {
          return Message.fromJson(body['message'] as Map<String, dynamic>);
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── POST /api/messages/share ─────────────────────────

  /// Share a post to another user through the real messaging system.
  /// Returns the created Message (type 'share'), or null on failure.
  Future<Message?> sharePost({
    required String recipientId,
    String? postId,
    String? text,
  }) async {
    try {
      final url = Uri.parse('${ApiConfig.legacyBaseUrl}/messages/share');
      final response = await http
          .post(
            url,
            headers: await _headers(),
            body: jsonEncode({
              'recipientId': recipientId,
              if (postId != null && postId.isNotEmpty) 'postId': postId,
              if (text != null && text.isNotEmpty) 'text': text,
            }),
          )
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 201 || response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['message'] != null) {
          return Message.fromJson(body['message'] as Map<String, dynamic>);
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── GET /api/messages/:userId/presence ───────────────

  /// Check whether a user is currently online (connected via Socket.IO).
  /// Returns null when the check itself fails.
  Future<bool?> checkPresence(String userId) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.legacyBaseUrl}/messages/$userId/presence',
      );
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        return body['online'] == true;
      }
    } catch (_) {}

    return null;
  }

  // ─── PUT /api/messages/:senderId/read ────────────────

  /// Mark all messages from a sender as read. Returns true on success.
  Future<bool> markAsRead(String senderId) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.legacyBaseUrl}/messages/$senderId/read',
      );
      final response = await http
          .put(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // ─── DELETE /api/messages/:messageId ─────────────────

  /// Delete a single message (sender only). Returns true on success.
  Future<bool> deleteMessage(String messageId) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.legacyBaseUrl}/messages/$messageId',
      );
      final response = await http
          .delete(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // ─── DELETE /api/messages/thread/:userId ─────────────

  /// Clear entire conversation thread with a user. Returns true on success.
  Future<bool> clearThread(String userId) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.legacyBaseUrl}/messages/thread/$userId',
      );
      final response = await http
          .delete(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}