class Comment {
  final String id;
  final String contentId;
  final String authorId;
  final String authorUsername;

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
    required this.text,
    this.parentCommentId,
    this.likeCount = 0,
    this.isLiked = false,
    required this.createdAt,
  });
}
