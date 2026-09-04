/// A direct message between two users.
///
/// Backend message shape:
/// ```json
/// {
///   "_id": "...",
///   "sender": { "_id": "...", "username": "...", "name": "...", "avatar": "..." },
///   "recipient": { "_id": "...", "username": "...", "name": "...", "avatar": "..." },
///   "text": "...",
///   "isRead": false,
///   "read": false,
///   "status": "sent",
///   "createdAt": "..."
/// }
/// ```
class Message {
  final String id;

  /// MongoDB _id of the sender.
  final String senderId;

  /// MongoDB _id of the recipient.
  final String receiverId;

  final String text;

  /// Cloudinary URL of an attached image (empty for text-only messages).
  final String image;

  /// Message kind: 'text', 'image' or 'share'.
  final String type;

  /// MongoDB _id of a shared post (empty for non-share messages).
  final String sharedPostId;

  /// Populated shared-post document from the backend (Map with _id/text/user/media).
  final Map<String, dynamic>? sharedPost;

  final DateTime createdAt;

  final bool isRead;

  /// Delivery status: 'sent', 'delivered' or 'read'.
  final String status;

  final String senderName;
  final String senderAvatar;

  const Message({
    required this.id,
    required this.senderId,
    required this.receiverId,
    required this.text,
    required this.createdAt,
    this.image = '',
    this.type = 'text',
    this.sharedPostId = '',
    this.sharedPost,
    this.isRead = false,
    this.status = 'sent',
    this.senderName = '',
    this.senderAvatar = '',
  });

  /// Create a [Message] from a backend JSON map.
  ///
  /// The backend can return `sender`/`recipient` as populated objects
  /// (`{ _id, username, name, avatar }`) or as plain ObjectId strings.
  factory Message.fromJson(Map<String, dynamic> json) {
    final senderObj = json['sender'] is Map<String, dynamic>
        ? json['sender'] as Map<String, dynamic>
        : null;
    final recipientObj = json['recipient'] is Map<String, dynamic>
        ? json['recipient'] as Map<String, dynamic>
        : null;

    final senderId = senderObj?['_id']?.toString() ??
        json['senderId']?.toString() ??
        json['sender']?.toString() ??
        '';
    final receiverId = recipientObj?['_id']?.toString() ??
        json['receiverId']?.toString() ??
        json['recipient']?.toString() ??
        '';

    final readFlag = json['isRead'] as bool? ??
        json['read'] as bool? ??
        false;

    // sharedPostId may be a plain ObjectId string or a populated post object
    final rawShared = json['sharedPostId'];
    Map<String, dynamic>? sharedPost;
    String sharedPostId = '';
    if (rawShared is Map<String, dynamic>) {
      sharedPost = rawShared;
      sharedPostId = rawShared['_id']?.toString() ?? '';
    } else if (rawShared != null) {
      sharedPostId = rawShared.toString();
    }

    return Message(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      senderId: senderId,
      receiverId: receiverId,
      text: json['text']?.toString() ?? '',
      image: json['image']?.toString() ?? '',
      type: json['type']?.toString() ?? 'text',
      sharedPostId: sharedPostId,
      sharedPost: sharedPost,
      isRead: readFlag,
      status: json['status']?.toString() ?? (readFlag ? 'read' : 'sent'),
      senderName: senderObj?['name']?.toString() ?? senderObj?['username']?.toString() ?? '',
      senderAvatar: senderObj?['avatar']?.toString() ?? '',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Message copyWith({
    String? id,
    String? senderId,
    String? receiverId,
    String? text,
    String? image,
    String? type,
    String? sharedPostId,
    DateTime? createdAt,
    bool? isRead,
    String? status,
    String? senderName,
    String? senderAvatar,
  }) {
    return Message(
      id: id ?? this.id,
      senderId: senderId ?? this.senderId,
      receiverId: receiverId ?? this.receiverId,
      text: text ?? this.text,
      image: image ?? this.image,
      type: type ?? this.type,
      sharedPostId: sharedPostId ?? this.sharedPostId,
      sharedPost: sharedPost,
      createdAt: createdAt ?? this.createdAt,
      isRead: isRead ?? this.isRead,
      status: status ?? this.status,
      senderName: senderName ?? this.senderName,
      senderAvatar: senderAvatar ?? this.senderAvatar,
    );
  }
}