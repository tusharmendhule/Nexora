import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/conversation.dart';
import 'api_exception.dart';

/// Backend-connected conversation service.
///
/// All conversation operations go through the Nexora backend backed by MongoDB:
///  - GET  /api/messages/inbox        → inbox with real contacts + unread counts
///  - POST /api/conversations         → create-or-find conversation (no duplicates)
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

  /// Build a [Conversation] from an inbox item returned by
  /// GET /api/messages/inbox. `contact` is the real other participant.
  Conversation _fromInboxItem(Map<String, dynamic> item) {
    final contact = item['contact'] is Map<String, dynamic>
        ? item['contact'] as Map<String, dynamic>
        : null;

    return Conversation(
      id: item['_id']?.toString() ?? '',
      otherUserId: contact?['_id']?.toString() ?? '',
      otherUsername: contact?['username']?.toString() ?? '',
      otherName: contact?['name']?.toString() ?? '',
      otherAvatar: contact?['avatar']?.toString() ?? '',
      lastMessageText: item['lastMessagePreview']?.toString(),
      lastMessageAt: item['lastMessageTime'] != null
          ? DateTime.tryParse(item['lastMessageTime'].toString())
          : null,
      unreadCount: (item['unreadCount'] as num?)?.toInt() ?? 0,
    );
  }

  /// Build a [Conversation] from a conversation document returned by
  /// POST/GET /api/conversations. The other participant is the one matching
  /// [otherUserId] (the receiver we asked the backend to chat with).
  Conversation _fromConversationDoc(
    Map<String, dynamic> doc,
    String otherUserId,
  ) {
    final participants = doc['participants'] is List
        ? doc['participants'] as List
        : <dynamic>[];

    Map<String, dynamic>? other;
    for (final p in participants) {
      if (p is! Map<String, dynamic>) continue;
      if (p['_id']?.toString() == otherUserId) {
        other = p;
        break;
      }
    }
    // Fallback: first participant (shouldn't happen for 2-party chats).
    other ??= participants.isNotEmpty && participants.first is Map<String, dynamic>
        ? participants.first as Map<String, dynamic>
        : null;

    final lastMessageSenderId = doc['lastMessageSender'] is Map<String, dynamic>
        ? (doc['lastMessageSender'] as Map<String, dynamic>)['_id']?.toString()
        : doc['lastMessageSender']?.toString();

    return Conversation(
      id: doc['_id']?.toString() ?? '',
      otherUserId: other?['_id']?.toString() ?? '',
      otherUsername: other?['username']?.toString() ?? '',
      otherName: other?['name']?.toString() ?? '',
      otherAvatar: other?['avatar']?.toString() ?? '',
      lastMessageText: doc['lastMessage']?.toString(),
      lastMessageAt: doc['lastMessageAt'] != null
          ? DateTime.tryParse(doc['lastMessageAt'].toString())
          : null,
      lastMessageSenderId: lastMessageSenderId,
      unreadCount: 0,
    );
  }

  // ─── GET /api/messages/inbox ─────────────────────────

  /// Fetch all real conversations for the current user from the backend.
  ///
  /// Throws [ApiException] on network/server errors so screens can surface
  /// them instead of silently showing an empty list.
  Future<List<Conversation>> fetchConversations() async {
    final url = Uri.parse('${ApiConfig.legacyBaseUrl}/messages/inbox');
    final http.Response response;
    try {
      response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);
    } catch (e) {
      throw ApiException('Network error loading conversations', statusCode: 0);
    }

    if (response.statusCode != 200) {
      throw ApiException(
        'Failed to load conversations (${response.statusCode})',
        statusCode: response.statusCode,
      );
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (body['success'] != true) {
      throw ApiException(
        body['message']?.toString() ?? 'Failed to load conversations',
        statusCode: response.statusCode,
      );
    }

    final inboxList = body['inbox'] as List? ?? [];
    return inboxList
        .whereType<Map<String, dynamic>>()
        .map(_fromInboxItem)
        .toList();
  }

  // ─── POST /api/conversations ─────────────────────────

  /// Create or find an existing conversation with another user.
  /// Returns null on failure (caller decides how to surface it).
  Future<Conversation?> createOrFindConversation(String receiverId) async {
    try {
      final url = Uri.parse('${ApiConfig.legacyBaseUrl}/conversations');
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
          return _fromConversationDoc(conv, receiverId);
        }
      }
    } catch (_) {}

    return null;
  }
}