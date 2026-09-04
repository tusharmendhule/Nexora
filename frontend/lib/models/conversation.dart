/// A chat conversation between the authenticated user and another user.
///
/// The backend `/api/messages/inbox` response shape:
/// ```json
/// {
///   "_id": "...",
///   "contact": { "_id": "...", "username": "...", "name": "...", "avatar": "..." },
///   "lastMessagePreview": "...",
///   "lastMessageTime": "...",
///   "unreadCount": 0
/// }
/// ```
class Conversation {
  final String id;

  /// The MongoDB _id of the *other* participant (never the current user).
  final String otherUserId;

  final String otherUsername;

  /// The other participant's display name (falls back to username).
  final String otherName;

  /// The other participant's avatar URL (empty string when unset).
  final String otherAvatar;

  final String? lastMessageId;
  final String? lastMessageText;
  final DateTime? lastMessageAt;

  /// Sender of the latest message (MongoDB _id).
  final String? lastMessageSenderId;

  final int unreadCount;

  const Conversation({
    required this.id,
    required this.otherUserId,
    required this.otherUsername,
    this.otherName = '',
    this.otherAvatar = '',
    this.lastMessageId,
    this.lastMessageText,
    this.lastMessageAt,
    this.lastMessageSenderId,
    this.unreadCount = 0,
  });

  /// Display name for the other participant — real name when available,
  /// otherwise the username. Never falls back to "You".
  String get displayName => otherName.isNotEmpty ? otherName : otherUsername;
}