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

  /// Replies nested under this comment (returned by the backend).
  final List<Comment> replies;

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
    this.replies = const [],
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
    final repliesList = (json['replies'] as List?) ?? const [];
    return Comment(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      // Posts use `post`, stories use `story`; both are the content id.
      contentId: json['post']?.toString() ??
          json['story']?.toString() ??
          json['contentId']?.toString() ??
          '',
      authorId: userObj?['_id']?.toString() ?? json['authorId']?.toString() ?? '',
      authorUsername: userObj?['name']?.toString() ??
          userObj?['username']?.toString() ??
          json['authorUsername']?.toString() ??
          '',
      authorAvatar: userObj?['avatar']?.toString(),
      text: json['text']?.toString() ?? '',
      parentCommentId: json['parentComment']?.toString(),
      replies: repliesList
          .map((r) => Comment.fromJson(r as Map<String, dynamic>))
          .toList(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}
