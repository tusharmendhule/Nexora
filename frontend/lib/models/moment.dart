import 'nexora_label.dart';

class Moment {
  final String id;
  final String creatorId;
  final String creatorUsername;

  /// Creator's profile picture URL (empty when unset).
  final String creatorAvatar;

  final String mediaUrl;
  final String mediaType;

  final NexoraLabel? label;

  final DateTime createdAt;
  final DateTime expiresAt;

  final bool isViewed;

  /// Engagement counters synced with the backend.
  final int likeCount;
  final bool isLiked;
  final int commentCount;

  const Moment({
    required this.id,
    required this.creatorId,
    required this.creatorUsername,
    this.creatorAvatar = '',
    required this.mediaUrl,
    required this.mediaType,
    this.label,
    required this.createdAt,
    required this.expiresAt,
    this.isViewed = false,
    this.likeCount = 0,
    this.isLiked = false,
    this.commentCount = 0,
  });
}
