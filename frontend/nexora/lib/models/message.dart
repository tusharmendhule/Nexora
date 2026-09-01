class Message {
  final String id;
  final String conversationId;

  final String senderId;
  final String receiverId;

  final String text;

  final DateTime createdAt;

  final bool isRead;

  const Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.receiverId,
    required this.text,
    required this.createdAt,
    this.isRead = false,
  });
}
