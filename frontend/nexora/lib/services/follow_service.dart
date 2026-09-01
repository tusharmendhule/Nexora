import 'package:flutter/material.dart';

import '../models/follow.dart';
import '../models/user.dart';
import '../models/notification.dart';
import 'user_service.dart';
import 'notification_service.dart';

class FollowService {
  final UserService _userService = UserService();
  final NotificationService _notificationService = NotificationService();

  static final List<Follow> _follows = [
    // Demo relationship data.
    // These records are intentionally kept behind the service so they can
    // later be replaced by database/API queries without changing the UI.
    Follow(
      id: 'follow_user_you_aarav',
      followerId: 'user_you',
      followingId: 'aarav',
      createdAt: DateTime(2026, 8, 29),
    ),
    Follow(
      id: 'follow_user_you_maya',
      followerId: 'user_you',
      followingId: 'maya',
      createdAt: DateTime(2026, 8, 29),
    ),
    Follow(
      id: 'follow_aarav_user_you',
      followerId: 'aarav',
      followingId: 'user_you',
      createdAt: DateTime(2026, 8, 29),
    ),
    Follow(
      id: 'follow_maya_user_you',
      followerId: 'maya',
      followingId: 'user_you',
      createdAt: DateTime(2026, 8, 29),
    ),
  ];

  static final List<Follow> _initialFollows = List.unmodifiable(
    List<Follow>.from(_follows),
  );

  List<Follow> get follows => List.unmodifiable(_follows);

  Future<bool> isFollowing({
    required String followerId,
    required String followingId,
  }) async {
    return _follows.any(
      (follow) =>
          follow.followerId == followerId && follow.followingId == followingId,
    );
  }

  Future<void> follow({
    required String followerId,
    required String followingId,
  }) async {
    if (followerId == followingId) return;

    final alreadyFollowing = await isFollowing(
      followerId: followerId,
      followingId: followingId,
    );

    if (alreadyFollowing) return;

    _follows.add(
      Follow(
        id: '${followerId}_$followingId',
        followerId: followerId,
        followingId: followingId,
        createdAt: DateTime.now(),
      ),
    );

    final actor = await _userService.getUserById(followerId);
    final recipient = await _userService.getUserById(followingId);

    if (actor != null && recipient != null) {
      await _notificationService.createNotification(
        AppNotification(
          id: 'notification_${DateTime.now().microsecondsSinceEpoch}',
          recipientId: recipient.id,
          actorId: actor.id,
          name: actor.username,
          text: 'started following you',
          icon: Icons.person_add,
          createdAt: DateTime.now(),
        ),
      );
    }
  }

  Future<void> unfollow({
    required String followerId,
    required String followingId,
  }) async {
    _follows.removeWhere(
      (follow) =>
          follow.followerId == followerId && follow.followingId == followingId,
    );
  }

  Future<List<User>> getFollowers(String userId) async {
    final followerIds = _follows
        .where((follow) => follow.followingId == userId)
        .map((follow) => follow.followerId)
        .toSet();

    final users = <User>[];

    for (final id in followerIds) {
      final user = await _userService.getUserById(id);
      if (user != null) users.add(user);
    }

    return users;
  }

  Future<List<User>> getFollowing(String userId) async {
    final followingIds = _follows
        .where((follow) => follow.followerId == userId)
        .map((follow) => follow.followingId)
        .toSet();

    final users = <User>[];

    for (final id in followingIds) {
      final user = await _userService.getUserById(id);
      if (user != null) users.add(user);
    }

    return users;
  }

  Future<int> getFollowerCount(String userId) async {
    final user = await _userService.getUserById(userId);
    final baseCount = user?.followersCount ?? 0;

    final currentCount = _follows
        .where((follow) => follow.followingId == userId)
        .length;

    final initialCount = _initialFollows
        .where((follow) => follow.followingId == userId)
        .length;

    return baseCount + (currentCount - initialCount);
  }

  Future<int> getFollowingCount(String userId) async {
    final user = await _userService.getUserById(userId);
    final baseCount = user?.followingCount ?? 0;

    final currentCount = _follows
        .where((follow) => follow.followerId == userId)
        .length;

    final initialCount = _initialFollows
        .where((follow) => follow.followerId == userId)
        .length;

    return baseCount + (currentCount - initialCount);
  }
}
