import 'like_service.dart';
import 'post_service.dart';
import 'user_service.dart';

/// Service that aggregates like/save/repost/follow interactions.
///
/// Delegates all operations to the real backend services instead of
/// maintaining in-memory state. Use this as a convenience wrapper
/// when multiple interaction types are needed in one screen.
class InteractionService {
  final LikeService _likeService = LikeService();
  final PostService _postService = PostService();
  final UserService _userService = UserService();

  // ─────────────────────────────────────────────
  // LIKE
  // ─────────────────────────────────────────────

  /// Toggle like on a post. Returns { isLiked, likesCount }.
  Future<Map<String, dynamic>> like(String postId) async {
    return await _likeService.toggleLike(postId: postId);
  }

  /// Unlike a post.
  Future<Map<String, dynamic>> unlike(String postId) async {
    return await _likeService.removeLike(postId: postId);
  }

  // ─────────────────────────────────────────────
  // SAVE / BOOKMARK
  // ─────────────────────────────────────────────

  /// Toggle save/bookmark on a post.
  Future<Map<String, dynamic>> save(String postId) async {
    return await _postService.toggleSave(postId: postId);
  }

  /// Unsave a post.
  Future<Map<String, dynamic>> unsave(String postId) async {
    return await _postService.toggleSave(postId: postId);
  }

  // ─────────────────────────────────────────────
  // FOLLOW
  // ─────────────────────────────────────────────

  /// Follow a user via the backend API.
  Future<bool> follow(String userId) async {
    return await _userService.followUser(userId);
  }

  /// Unfollow a user via the backend API.
  Future<bool> unfollow(String userId) async {
    return await _userService.unfollowUser(userId);
  }

  /// Check if the current user is following a target user.
  Future<bool> isFollowing(String userId) async {
    return await _userService.isFollowingUser(userId);
  }
}
