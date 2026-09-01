class Conversation {
  final String id;

  final List<String> participantIds;

  final String? lastMessageId;
  final String? lastMessageText;
  final DateTime? lastMessageAt;

  final int unreadCount;

  const Conversation({
    required this.id,
    required this.participantIds,
    this.lastMessageId,
    this.lastMessageText,
    this.lastMessageAt,
    this.unreadCount = 0,
  });
}
