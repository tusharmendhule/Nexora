import 'package:flutter/material.dart';

import '../models/notification.dart';

class NotificationService {
  static final List<AppNotification> _notifications = [
    AppNotification(
      id: 'notification_001',
      recipientId: 'user_you',
      actorId: 'user2',
      name: 'User2',
      text: 'liked your post',
      icon: Icons.favorite,
      createdAt: DateTime(2026, 8, 30, 19, 45),
    ),
    AppNotification(
      id: 'notification_002',
      recipientId: 'user_you',
      actorId: 'user3',
      name: 'User3',
      text: 'started following you',
      icon: Icons.person_add,
      createdAt: DateTime(2026, 8, 30, 19, 32),
    ),
    AppNotification(
      id: 'notification_003',
      recipientId: 'user_you',
      actorId: 'user4',
      name: 'User4',
      text: 'commented on your post',
      icon: Icons.chat_bubble,
      createdAt: DateTime(2026, 8, 30, 18, 50),
    ),
    AppNotification(
      id: 'notification_004',
      recipientId: 'user_you',
      name: 'Nexora Community',
      text: 'shared something new',
      icon: Icons.groups,
      createdAt: DateTime(2026, 8, 30, 16, 00),
    ),
    AppNotification(
      id: 'notification_005',
      recipientId: 'user_you',
      actorId: 'user5',
      name: 'User5',
      text: 'liked your profile',
      icon: Icons.auto_awesome,
      createdAt: DateTime(2026, 8, 29, 20, 00),
    ),
  ];

  Future<List<AppNotification>> fetchNotifications(String recipientId) async {
    return _notifications
        .where((notification) => notification.recipientId == recipientId)
        .toList();
  }

  Future<int> getUnreadCount(String recipientId) async {
    return _notifications
        .where(
          (notification) =>
              notification.recipientId == recipientId && !notification.isRead,
        )
        .length;
  }

  Future<void> markAsRead(String notificationId) async {
    final index = _notifications.indexWhere(
      (notification) => notification.id == notificationId,
    );

    if (index == -1) return;

    _notifications[index] = _notifications[index].copyWith(isRead: true);
  }

  Future<void> markAllAsRead(String recipientId) async {
    for (var i = 0; i < _notifications.length; i++) {
      if (_notifications[i].recipientId == recipientId) {
        _notifications[i] = _notifications[i].copyWith(isRead: true);
      }
    }
  }

  Future<void> deleteAll(String recipientId) async {
    _notifications.removeWhere(
      (notification) => notification.recipientId == recipientId,
    );
  }

  Future<void> createNotification(AppNotification notification) async {
    _notifications.insert(0, notification);
  }
}
