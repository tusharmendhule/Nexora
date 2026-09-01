class User {
  final String id;
  final String username;

  final String? displayName;
  final String? bio;
  final String? profileImageUrl;

  final int followersCount;
  final int followingCount;

  final bool isFollowing;
  final bool isFollowedBy;

  final bool isVerified;

  const User({
    required this.id,
    required this.username,
    this.displayName,
    this.bio,
    this.profileImageUrl,
    this.followersCount = 0,
    this.followingCount = 0,
    this.isFollowing = false,
    this.isFollowedBy = false,
    this.isVerified = false,
  });
}
