import 'nexora_label.dart';

class Clip {
  final String id;
  final String creatorId;
  final String creatorUsername;

  /// Backend media type — clips are stories with mediaType='video'.
  final String mediaType;

  final String videoUrl;
  final String caption;
  final String? music;

  final NexoraLabel label;

  final int likeCount;
  final int commentCount;
  final int repostCount;

  final bool isLiked;
  final bool isSaved;
  final bool isReposted;

  final DateTime createdAt;

  const Clip({
    required this.id,
    required this.creatorId,
    required this.creatorUsername,
    this.mediaType = 'video',
    required this.videoUrl,
    required this.caption,
    this.music,
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
