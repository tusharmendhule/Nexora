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

  /// Create a Message from a backend JSON response.
  ///
  /// Backend message shape:
  /// ```json
  /// {
  ///   "_id": "...",
  ///   "sender": { "_id": "...", "username": "...", "name": "..." },
  ///   "recipient": { "_id": "...", "username": "...", "name": "..." },
  ///   "text": "...",
  ///   "isRead": false,
  ///   "status": "sent",
  ///   "createdAt": "..."
  /// }
  /// ```
  factory Message.fromJson(Map<String, dynamic> json) {
    final senderObj = json['sender'] as Map<String, dynamic>?;
    final recipientObj = json['recipient'] as Map<String, dynamic>?;

    return Message(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      conversationId: json['conversationId']?.toString() ?? '',
      senderId: senderObj?['_id']?.toString() ?? json['senderId']?.toString() ?? json['sender']?.toString() ?? '',
      receiverId: recipientObj?['_id']?.toString() ?? json['receiverId']?.toString() ?? json['recipient']?.toString() ?? '',
      text: json['text']?.toString() ?? '',
      isRead: json['isRead'] as bool? ?? json['read'] as bool? ?? false,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}
