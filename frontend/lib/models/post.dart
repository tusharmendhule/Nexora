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

  // Backend-synced fields
  final String? authorAvatar;
  final bool authorIsVerified;
  final String? authorReputationBadge;
  final List<Map<String, dynamic>>? mediaItems;
  final List<String>? tags;
  final List<String>? hashtags;
  final String? linkUrl;
  final String? linkTitle;
  final String? linkDescription;
  final String? visibility;
  final int? likesCount;
  final int? commentsCount;
  final int? sharesCount;
  final int? viewsCount;
  final int? trustScore;
  final String? verificationStatus;
  final String? moderationStatus;
  final DateTime? updatedAt;

  // Trust Score detail from backend TrustScore collection
  final String? trustLabel;
  final String? trustExplanation;
  final bool? trustOverrideApplied;
  final double? trustAuthenticity;
  final double? trustFactualVerification;
  final double? trustSourceCredibility;
  final double? trustModelConfidence;

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
    this.authorAvatar,
    this.authorIsVerified = false,
    this.authorReputationBadge,
    this.mediaItems,
    this.tags,
    this.hashtags,
    this.linkUrl,
    this.linkTitle,
    this.linkDescription,
    this.visibility,
    this.likesCount,
    this.commentsCount,
    this.sharesCount,
    this.viewsCount,
    this.trustScore,
    this.verificationStatus,
    this.moderationStatus,
    this.updatedAt,
    this.trustLabel,
    this.trustExplanation,
    this.trustOverrideApplied,
    this.trustAuthenticity,
    this.trustFactualVerification,
    this.trustSourceCredibility,
    this.trustModelConfidence,
  });

  /// Create a [Post] from a backend JSON map.
  ///
  /// The backend response shape (v1 API with TrustScore enrichment):
  /// ```json
  /// {
  ///   "_id": "...",
  ///   "user": { "_id": "...", "name": "...", "username": "...", "avatar": "...", "isVerified": false },
  ///   "text": "...",
  ///   "contentType": "text|image|video|audio|link",
  ///   "media": [{ "url": "...", "type": "image" }],
  ///   "trustScore": 85,
  ///   "verificationStatus": "verified",
  ///   "moderationStatus": "pending",
  ///   "trustScoreDetail": {
  ///     "score": 85,
  ///     "label": "Green",
  ///     "explanation": "Rule 5: High-trust content...",
  ///     "isOverrideApplied": false,
  ///     "authenticity": 0.9,
  ///     "factualVerification": 0.85,
  ///     "sourceCredibility": 0.8,
  ///     "modelConfidence": 0.9
  ///   },
  ///   "createdAt": "2026-08-29T00:00:00.000Z"
  /// }
  /// ```
  factory Post.fromJson(Map<String, dynamic> json) {
    // Parse author (nested user object from populate)
    final userObj = json['user'] as Map<String, dynamic>?;
    final authorId = userObj?['_id']?.toString() ?? json['authorId']?.toString() ?? '';
    final authorUsername = userObj?['username']?.toString() ?? userObj?['name']?.toString() ?? json['authorUsername']?.toString() ?? '';
    final authorAvatar = userObj?['avatar']?.toString();
    final authorIsVerified = userObj?['isVerified'] as bool? ?? false;
    final authorReputationBadge = userObj?['reputationBadge']?.toString();

    // Determine primary media URL from media array
    String? mediaUrl;
    final mediaList = json['media'] as List?;
    if (mediaList != null && mediaList.isNotEmpty) {
      mediaUrl = mediaList[0]['url']?.toString();
    }
    // Fallback: check legacy mediaUrl field
    mediaUrl ??= json['mediaUrl']?.toString();

    // Parse content type
    final contentType = json['contentType']?.toString() ?? 'text';

    // Parse trust score detail from backend enrichment
    final trustScoreDetail = json['trustScoreDetail'] as Map<String, dynamic>?;
    final trustLabelStr = trustScoreDetail?['label']?.toString();
    final trustExplanationStr = trustScoreDetail?['explanation']?.toString();

    // Numeric trust score — prefer detail's score, then post model's field.
    // NO fabricated fallback: null means the backend has not computed a
    // score yet, and the UI shows a pending state instead of a fake value.
    final trustScoreValue = (trustScoreDetail?['score'] as num?)?.toInt()
        ?? (json['trustScore'] as num?)?.toInt();

    // Verification & moderation status
    final verificationStatus = json['verificationStatus']?.toString();
    final moderationStatus = json['moderationStatus']?.toString();

    // Parse label — prefer backend TrustScore label, fall back to heuristic
    final label = _parseLabel(json, trustLabelStr, trustExplanationStr);

    // Parse timestamps
    final createdAt = json['createdAt'] != null
        ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
        : DateTime.now();

    final updatedAt = json['updatedAt'] != null
        ? DateTime.tryParse(json['updatedAt'].toString())
        : null;

    // Parse tags
    final tagsList = (json['tags'] as List?)?.map((e) => e.toString()).toList();
    final hashtagsList = (json['hashtags'] as List?)?.map((e) => e.toString()).toList();    // Parse isLiked from backend (enriched per-user flag)

    final isLiked = json['isLiked'] as bool? ?? false;

    // Parse isSaved from backend (enriched per-user flag)

    final isSaved = json['isSaved'] as bool? ?? false;

    // Parse isReshared from backend (enriched per-user flag)
    final isReshared = json['isReshared'] as bool? ?? false;

    return Post(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      authorId: authorId,
      authorUsername: authorUsername,
      text: json['text']?.toString(),
      mediaUrl: mediaUrl,
      contentType: contentType,
      label: label,
      likeCount: json['likesCount'] as int? ?? 0,
      commentCount: json['commentsCount'] as int? ?? 0,
      repostCount: json['sharesCount'] as int? ?? 0,
      isLiked: isLiked,
      isSaved: isSaved,
      isReposted: isReshared,
      createdAt: createdAt,
      authorAvatar: authorAvatar,
      authorIsVerified: authorIsVerified,
      authorReputationBadge: authorReputationBadge,
      mediaItems: mediaList?.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
      tags: tagsList,
      hashtags: hashtagsList,
      linkUrl: json['linkUrl']?.toString(),
      linkTitle: json['linkTitle']?.toString(),
      linkDescription: json['linkDescription']?.toString(),
      visibility: json['visibility']?.toString(),
      likesCount: json['likesCount'] as int?,
      commentsCount: json['commentsCount'] as int?,
      sharesCount: json['sharesCount'] as int?,
      viewsCount: json['viewsCount'] as int?,
      trustScore: trustScoreValue,
      verificationStatus: verificationStatus,
      moderationStatus: moderationStatus,
      updatedAt: updatedAt,
      trustLabel: trustLabelStr,
      trustExplanation: trustExplanationStr,
      trustOverrideApplied: trustScoreDetail?['isOverrideApplied'] as bool?,
      trustAuthenticity: (trustScoreDetail?['authenticity'] as num?)?.toDouble(),
      trustFactualVerification: (trustScoreDetail?['factualVerification'] as num?)?.toDouble(),
      trustSourceCredibility: (trustScoreDetail?['sourceCredibility'] as num?)?.toDouble(),
      trustModelConfidence: (trustScoreDetail?['modelConfidence'] as num?)?.toDouble(),
    );
  }

  /// Parse a NexoraLabel from backend trust/verification fields.
  ///
  /// Priority:
  ///   1. Backend TrustScore label (authoritative — from the rule engine)
  ///   2. Honest pending state when the backend has no TrustScore record.
  ///
  /// Labels are NEVER derived from score ranges here — that would fabricate
  /// a verdict. The verification status (verified/failed/pending) is shown
  /// separately by the UI from the backend's real value.
  static NexoraLabel _parseLabel(
    Map<String, dynamic> json,
    String? backendLabel,
    String? backendExplanation,
  ) {
    // 1. If backend provided a TrustScore label, use it directly
    if (backendLabel != null && backendLabel.isNotEmpty) {
      return NexoraLabel.fromBackendLabel(backendLabel, explanation: backendExplanation);
    }

    // 2. No backend TrustScore record — show the honest pre-analysis state.
    return NexoraLabel.pendingVerification;
  }

  /// Parse a list of posts from the backend response.
  static List<Post> fromJsonList(List<dynamic> jsonList) {
    return jsonList
        .map((json) => Post.fromJson(json as Map<String, dynamic>))
        .toList();
  }
}
