import '../models/user.dart';
import 'user_service.dart';

/// Backend-connected follow service.
///
/// All follow/unfollow operations are persisted to MongoDB via the v1 API.
/// Uses the Follower model on the backend for relationship tracking.
class FollowService {
  final UserService _userService = UserService();

  /// Check if the current user is following a target user.
  Future<bool> isFollowing({
    required String followerId,
    required String followingId,
  }) async {
    try {
      return await _userService.isFollowingUser(followingId);
    } catch (_) {
      return false;
    }
  }

  /// Follow a user. Returns true if the follow was successful.
  Future<void> follow({
    required String followerId,
    required String followingId,
  }) async {
    if (followerId == followingId) return;
    await _userService.followUser(followingId);
  }

  /// Unfollow a user.
  Future<void> unfollow({
    required String followerId,
    required String followingId,
  }) async {
    await _userService.unfollowUser(followingId);
  }

  /// Get a list of users who follow the given user.
  Future<List<User>> getFollowers(String userId) async {
    return await _userService.getFollowers(userId);
  }

  /// Get a list of users the given user is following.
  Future<List<User>> getFollowing(String userId) async {
    return await _userService.getFollowing(userId);
  }

  /// Get the follower count for a user.
  /// Uses the count from the user profile (already fetched by the caller).
  Future<int> getFollowerCount(String userId) async {
    final user = await _userService.getUserById(userId);
    return user?.followersCount ?? 0;
  }

  /// Get the following count for a user.
  Future<int> getFollowingCount(String userId) async {
    final user = await _userService.getUserById(userId);
    return user?.followingCount ?? 0;
  }
}
