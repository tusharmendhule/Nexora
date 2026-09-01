import 'nexora_label.dart';

class Post {
  final String id;
  final String authorId;
  final String authorUsername;

  final String? text;
  final String? mediaUrl;
  final String contentType;

  final NexoraLabel label;

  final int likeCount;
  final int commentCount;
  final int repostCount;

  final bool isLiked;
  final bool isSaved;
  final bool isReposted;

  final DateTime createdAt;

  const Post({
    required this.id,
    required this.authorId,
    required this.authorUsername,
    this.text,
    this.mediaUrl,
    required this.contentType,
    required this.label,
    this.likeCount = 0,
    this.commentCount = 0,
    this.repostCount = 0,
    this.isLiked = false,
    this.isSaved = false,
    this.isReposted = false,
    required this.createdAt,
  });
}
