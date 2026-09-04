class User {
  final String id;
  final String username;

  final String? displayName;
  final String? bio;
  final String? profileImageUrl;

  final int followersCount;
  final int followingCount;
  final int postsCount;

  final bool isFollowing;
  final bool isFollowedBy;

  final bool isVerified;

  final String? website;
  final String? email;
  final String? phone;
  final String? role;
  final String? reputationBadge;
  final int? overallTrustRating;
  final bool? isPrivate;
  final String? accountStatus;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const User({
    required this.id,
    required this.username,
    this.displayName,
    this.bio,
    this.profileImageUrl,
    this.followersCount = 0,
    this.followingCount = 0,
    this.postsCount = 0,
    this.isFollowing = false,
    this.isFollowedBy = false,
    this.isVerified = false,
    this.website,
    this.email,
    this.phone,
    this.role,
    this.reputationBadge,
    this.overallTrustRating,
    this.isPrivate,
    this.accountStatus,
    this.createdAt,
    this.updatedAt,
  });

  /// Create a [User] from a backend JSON map.
  ///
  /// The backend user document uses `_id`, `name`, `avatar`, and `timestamps`.
  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      username: json['username']?.toString() ?? '',
      displayName: json['name']?.toString(),
      bio: json['bio']?.toString(),
      profileImageUrl: json['avatar']?.toString(),
      followersCount: json['followersCount'] as int? ?? 0,
      followingCount: json['followingCount'] as int? ?? 0,
      postsCount: json['postsCount'] as int? ?? 0,
      isFollowing: json['isFollowing'] as bool? ?? false,
      isFollowedBy: json['isFollowedBy'] as bool? ?? false,
      isVerified: json['isVerified'] as bool? ?? false,
      website: json['website']?.toString(),
      email: json['email']?.toString(),
      phone: json['phone']?.toString(),
      role: json['role']?.toString(),
      reputationBadge: json['reputationBadge']?.toString(),
      overallTrustRating: json['overallTrustRating'] as int?,
      isPrivate: json['isPrivate'] as bool?,
      accountStatus: json['accountStatus']?.toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'].toString())
          : null,
    );
  }

  /// Convert to a JSON map for API requests.
  Map<String, dynamic> toJson() {
    return {
      'name': displayName,
      'username': username,
      'bio': bio,
      'avatar': profileImageUrl,
      'website': website,
      'isPrivate': isPrivate,
    };
  }
}
