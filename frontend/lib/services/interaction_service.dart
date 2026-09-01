class InteractionService {
  final Set<String> _likedContentIds = {};
  final Set<String> _savedContentIds = {};
  final Set<String> _repostedContentIds = {};
  final Set<String> _followedUserIds = {};

  // ─────────────────────────────────────────────
  // LIKE
  // ─────────────────────────────────────────────

  Future<void> like(String contentId) async {
    _likedContentIds.add(contentId);
  }

  Future<void> unlike(String contentId) async {
    _likedContentIds.remove(contentId);
  }

  bool isLiked(String contentId) {
    return _likedContentIds.contains(contentId);
  }

  // ─────────────────────────────────────────────
  // SAVE
  // ─────────────────────────────────────────────

  Future<void> save(String contentId) async {
    _savedContentIds.add(contentId);
  }

  Future<void> unsave(String contentId) async {
    _savedContentIds.remove(contentId);
  }

  bool isSaved(String contentId) {
    return _savedContentIds.contains(contentId);
  }

  List<String> get savedContentIds {
    return List.unmodifiable(_savedContentIds);
  }

  // ─────────────────────────────────────────────
  // REPOST
  // ─────────────────────────────────────────────

  Future<void> repost(String contentId) async {
    _repostedContentIds.add(contentId);
  }

  Future<void> undoRepost(String contentId) async {
    _repostedContentIds.remove(contentId);
  }

  bool isReposted(String contentId) {
    return _repostedContentIds.contains(contentId);
  }

  // ─────────────────────────────────────────────
  // FOLLOW
  // ─────────────────────────────────────────────

  Future<void> follow(String userId) async {
    _followedUserIds.add(userId);
  }

  Future<void> unfollow(String userId) async {
    _followedUserIds.remove(userId);
  }

  bool isFollowing(String userId) {
    return _followedUserIds.contains(userId);
  }

  List<String> get followedUserIds {
    return List.unmodifiable(_followedUserIds);
  }
}
