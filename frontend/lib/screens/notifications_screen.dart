import 'package:flutter/material.dart';

import '../models/notification.dart';
import '../services/notification_service.dart';
import '../services/user_service.dart';
import 'chat_screen.dart';
import 'user_profile_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final NotificationService _notificationService = NotificationService();
  final UserService _userService = UserService();

  List<AppNotification> notifications = [];
  bool isLoading = true;
  String _currentUserId = '';

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  Future<void> _loadNotifications() async {
    final currentId = await _userService.getCurrentUserId();
    if (!mounted) return;
    _currentUserId = currentId ?? '';

    final loaded = await _notificationService.fetchNotifications(_currentUserId);

    if (!mounted) return;

    setState(() {
      notifications = loaded;
      isLoading = false;
    });
  }

  Future<void> _markAllAsRead() async {
    await _notificationService.markAllAsRead(_currentUserId);

    if (!mounted) return;

    setState(() {
      notifications = notifications
          .map((n) => n.copyWith(isRead: true))
          .toList();
    });
  }

  Future<void> _clearNotifications() async {
    await _notificationService.deleteAll(_currentUserId);

    if (!mounted) return;

    setState(() {
      notifications.clear();
    });
  }

  Future<void> _openNotification(AppNotification notification) async {
    // Mark as read if unread
    if (!notification.isRead) {
      await _notificationService.markAsRead(notification.id);

      if (!mounted) return;

      setState(() {
        final index = notifications.indexWhere(
          (item) => item.id == notification.id,
        );

        if (index != -1) {
          notifications[index] = notification.copyWith(isRead: true);
        }
      });
    }

    // Navigate to the correct screen based on notification type
    if (!mounted) return;
    _navigateToTarget(notification);
  }

  void _navigateToTarget(AppNotification notification) {
    try {
      switch (notification.targetType) {
        case 'Post':
          // Navigate to home screen (posts are on the home feed)
          // We pop back to main nav which shows the home screen
          Navigator.of(context).pop();
          break;
        case 'User':
          // Navigate to the actor's profile
          if (notification.actorId != null && notification.actorId!.isNotEmpty) {
            // We need to get the username from the actor ID
            _navigateToProfile(notification.actorId!);
          }
          break;
        case 'Message':
          // Navigate to chat with the sender
          if (notification.actorId != null && notification.actorId!.isNotEmpty) {
            _navigateToChat(notification.actorId!);
          }
          break;
        case 'Report':
          // Reports don't have a specific screen — just pop back
          Navigator.of(context).pop();
          break;
        default:
          // For system/other notifications, just pop back
          Navigator.of(context).pop();
          break;
      }
    } catch (_) {
      // Navigation failed — stay on notifications screen
    }
  }

  Future<void> _navigateToProfile(String userId) async {
    final user = await _userService.getUserById(userId);
    if (!mounted) return;
    if (user != null) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => UserProfileScreen(username: user.username),
        ),
      );
    }
  }

  Future<void> _navigateToChat(String userId) async {
    final user = await _userService.getUserById(userId);
    if (!mounted) return;
    if (user != null) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ChatScreen(
            username: user.username,
            targetUserId: userId,
          ),
        ),
      );
    }
  }

  String _formatTime(DateTime createdAt) {
    final difference = DateTime.now().difference(createdAt);

    if (difference.inMinutes < 1) return 'now';
    if (difference.inMinutes < 60) return '${difference.inMinutes}m';
    if (difference.inHours < 24) return '${difference.inHours}h';
    if (difference.inDays < 7) return '${difference.inDays}d';

    return '${createdAt.day}/${createdAt.month}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF080B1A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Notifications',
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
        actions: [
          if (notifications.any((n) => !n.isRead))
            TextButton(
              onPressed: _markAllAsRead,
              child: const Text(
                'Mark all read',
                style: TextStyle(color: Color(0xFF6C8CFF), fontSize: 13),
              ),
            ),
          TextButton(
            onPressed: notifications.isEmpty ? null : _clearNotifications,
            child: const Text(
              'Clear',
              style: TextStyle(color: Color(0xFF6C8CFF), fontSize: 13),
            ),
          ),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : notifications.isEmpty
          ? const Center(
              child: Text(
                'No notifications yet',
                style: TextStyle(color: Colors.white54, fontSize: 14),
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 30),
              itemCount: notifications.length,
              itemBuilder: (context, index) {
                final notification = notifications[index];

                return GestureDetector(
                  onTap: () => _openNotification(notification),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: notification.isRead
                          ? const Color(0xFF11162B)
                          : const Color(0xFF151C36),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: Color(0xFF242A43),
                          ),
                          child: Icon(
                            notification.icon,
                            color: const Color(0xFF6C8CFF),
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 13),
                        Expanded(
                          child: RichText(
                            text: TextSpan(
                              children: [
                                TextSpan(
                                  text: notification.name,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                                TextSpan(
                                  text: ' ${notification.text}',
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _formatTime(notification.createdAt),
                          style: const TextStyle(
                            color: Colors.white38,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}
