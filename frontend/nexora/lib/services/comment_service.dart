import '../models/comment.dart';

class CommentService {
  final List<Comment> _comments = [
    Comment(
      id: 'comment_001',
      contentId: 'demo_content',
      authorId: 'aarav',
      authorUsername: 'Aarav',
      text: 'This is actually really interesting. 👏',
      createdAt: DateTime(2026, 8, 29, 19, 58),
    ),
    Comment(
      id: 'comment_002',
      contentId: 'demo_content',
      authorId: 'maya',
      authorUsername: 'Maya',
      text: 'Love this! ✨',
      createdAt: DateTime(2026, 8, 29, 19, 52),
    ),
    Comment(
      id: 'comment_003',
      contentId: 'demo_content',
      authorId: 'arjun',
      authorUsername: 'Arjun',
      text: 'Nexora is looking better every day.',
      createdAt: DateTime(2026, 8, 29, 19, 46),
    ),
  ];

  List<Comment> get comments => List.unmodifiable(_comments);

  Future<List<Comment>> fetchComments(String contentId) async {
    return _comments
        .where(
          (comment) =>
              comment.contentId == contentId && comment.parentCommentId == null,
        )
        .toList();
  }

  Future<Comment?> getCommentById(String commentId) async {
    for (final comment in _comments) {
      if (comment.id == commentId) return comment;
    }
    return null;
  }

  Future<void> addComment(Comment comment) async {
    _comments.insert(0, comment);
  }

  Future<void> updateComment(Comment updatedComment) async {
    final index = _comments.indexWhere((c) => c.id == updatedComment.id);
    if (index == -1) return;
    _comments[index] = updatedComment;
  }

  Future<void> deleteComment(String commentId) async {
    _comments.removeWhere((c) => c.id == commentId);
  }

  Future<List<Comment>> fetchReplies(String parentCommentId) async {
    return _comments
        .where((c) => c.parentCommentId == parentCommentId)
        .toList();
  }
}
