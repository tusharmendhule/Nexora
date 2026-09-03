import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/conversation.dart';

/// Backend-connected conversation service.
///
/// All conversation operations go through the Nexora backend backed by MongoDB.
class ConversationService {
  ConversationService._internal();

  static final ConversationService _instance = ConversationService._internal();
  factory ConversationService() => _instance;

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

  /// Get the auth token for Socket.IO connections.
  Future<String?> getAuthToken() async {
    String? token = await _getFirebaseToken();
    if (token == null || token.isEmpty) {
      token = await _getJwtToken();
    }
    return token;
  }

  // ─── GET /api/messages/inbox ─────────────────────────

  /// Fetch all conversations for the current user from the backend.
  Future<List<Conversation>> fetchConversations() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/../../api/messages/inbox');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['inbox'] != null) {
          final inboxList = body['inbox'] as List;
          return inboxList.map((item) {
            final contact = item['contact'] as Map<String, dynamic>?;
            final participantIds = contact != null
                ? [contact['_id']?.toString() ?? '', contact['username']?.toString() ?? '']
                : <String>[];

            return Conversation(
              id: item['_id']?.toString() ?? '',
              participantIds: participantIds,
              lastMessageText: item['lastMessagePreview']?.toString() ?? '',
              lastMessageAt: item['lastMessageTime'] != null
                  ? DateTime.tryParse(item['lastMessageTime'].toString())
                  : null,
              unreadCount: item['unreadCount'] as int? ?? 0,
            );
          }).toList();
        }
      }
    } catch (_) {}

    return [];
  }

  // ─── POST /api/conversations ─────────────────────────

  /// Create or find an existing conversation with another user.
  Future<Conversation?> createOrFindConversation(String receiverId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/../../api/conversations');
      final response = await http
          .post(
            url,
            headers: await _headers(),
            body: jsonEncode({'receiverId': receiverId}),
          )
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['conversation'] != null) {
          final conv = body['conversation'] as Map<String, dynamic>;
          final participants = conv['participants'] as List? ?? [];
          final participantIds = participants
              .map((p) => (p as Map<String, dynamic>)['_id']?.toString() ?? '')
              .toList();

          return Conversation(
            id: conv['_id']?.toString() ?? '',
            participantIds: participantIds,
            lastMessageText: conv['lastMessage']?.toString() ?? '',
            lastMessageAt: conv['lastMessageAt'] != null
                ? DateTime.tryParse(conv['lastMessageAt'].toString())
                : null,
          );
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── GET /api/conversations ──────────────────────────

  /// Fetch all conversations (legacy format).
  Future<List<Conversation>> fetchConversationsLegacy() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/../../api/conversations');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['conversations'] != null) {
          final convList = body['conversations'] as List;
          return convList.map((conv) {
            final participants = conv['participants'] as List? ?? [];
            final participantIds = participants
                .map((p) => (p as Map<String, dynamic>)['_id']?.toString() ?? '')
                .toList();

            return Conversation(
              id: conv['_id']?.toString() ?? '',
              participantIds: participantIds,
              lastMessageText: conv['lastMessage']?.toString() ?? '',
              lastMessageAt: conv['lastMessageAt'] != null
                  ? DateTime.tryParse(conv['lastMessageAt'].toString())
                  : null,
            );
          }).toList();
        }
      }
    } catch (_) {}

    return [];
  }
}
