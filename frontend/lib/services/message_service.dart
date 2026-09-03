import 'dart:convert';
import 'dart:math';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/message.dart';

/// Backend-connected message service.
///
/// All message operations go through the Nexora backend backed by MongoDB.
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
  Future<List<Message>> fetchMessages(String userId, {int page = 1, int limit = 50}) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/../../api/messages/$userId?page=$page&limit=$limit',
      );
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['chatHistory'] != null) {
          final messagesList = body['chatHistory'] as List;
          return messagesList
              .map((m) => Message.fromJson(m as Map<String, dynamic>))
              .toList();
        }
      }
    } catch (_) {}

    return [];
  }

  // ─── POST /api/messages ──────────────────────────────

  /// Send a message to another user via the backend.
  Future<Message?> sendMessage({
    required String recipientId,
    required String text,
  }) async {
    try {
      // Generate idempotency key to prevent duplicate messages
      final idempotencyKey = '${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(999999)}';

      final url = Uri.parse('${ApiConfig.baseUrl}/../../api/messages');
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

  // ─── PUT /api/messages/:senderId/read ────────────────

  /// Mark all messages from a sender as read.
  Future<void> markAsRead(String senderId) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/../../api/messages/$senderId/read',
      );
      await http
          .put(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
    } catch (_) {}
  }

  // ─── DELETE /api/messages/:messageId ─────────────────

  /// Delete a single message (sender only).
  Future<void> deleteMessage(String messageId) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/../../api/messages/$messageId',
      );
      await http
          .delete(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
    } catch (_) {}
  }

  // ─── DELETE /api/messages/thread/:userId ─────────────

  /// Clear entire conversation thread with a user.
  Future<void> clearThread(String userId) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/../../api/messages/thread/$userId',
      );
      await http
          .delete(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
    } catch (_) {}
  }
}
