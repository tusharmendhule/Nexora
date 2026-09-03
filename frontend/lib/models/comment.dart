class Comment {
  final String id;
  final String contentId;
  final String authorId;
  final String authorUsername;
  final String? authorAvatar;

  final String text;

  final String? parentCommentId;

  final int likeCount;
  final bool isLiked;

  final DateTime createdAt;

  const Comment({
    required this.id,
    required this.contentId,
    required this.authorId,
    required this.authorUsername,
    this.authorAvatar,
    required this.text,
    this.parentCommentId,
    this.likeCount = 0,
    this.isLiked = false,
    required this.createdAt,
  });

  /// Create a Comment from a backend JSON response.
  ///
  /// Backend comment shape:
  /// ```json
  /// {
  ///   "_id": "...",
  ///   "post": "...",
  ///   "user": { "_id": "...", "name": "...", "username": "...", "avatar": "..." },
  ///   "text": "...",
  ///   "parentComment": null,
  ///   "createdAt": "..."
  /// }
  /// ```
  factory Comment.fromJson(Map<String, dynamic> json) {
    final userObj = json['user'] as Map<String, dynamic>?;
    return Comment(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      contentId: json['post']?.toString() ?? json['contentId']?.toString() ?? '',
      authorId: userObj?['_id']?.toString() ?? json['authorId']?.toString() ?? '',
      authorUsername: userObj?['name']?.toString() ?? userObj?['username']?.toString() ?? json['authorUsername']?.toString() ?? '',
      authorAvatar: userObj?['avatar']?.toString(),
      text: json['text']?.toString() ?? '',
      parentCommentId: json['parentComment']?.toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}
