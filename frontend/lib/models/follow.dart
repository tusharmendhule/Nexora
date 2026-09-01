class Follow {
  final String id;
  final String followerId;
  final String followingId;
  final DateTime createdAt;

  const Follow({
    required this.id,
    required this.followerId,
    required this.followingId,
    required this.createdAt,
  });
}
