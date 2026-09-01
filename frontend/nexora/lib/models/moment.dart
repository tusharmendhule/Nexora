import 'nexora_label.dart';

class Moment {
  final String id;
  final String creatorId;
  final String creatorUsername;

  final String mediaUrl;
  final String mediaType;

  final NexoraLabel? label;

  final DateTime createdAt;
  final DateTime expiresAt;

  final bool isViewed;

  const Moment({
    required this.id,
    required this.creatorId,
    required this.creatorUsername,
    required this.mediaUrl,
    required this.mediaType,
    this.label,
    required this.createdAt,
    required this.expiresAt,
    this.isViewed = false,
  });
}
