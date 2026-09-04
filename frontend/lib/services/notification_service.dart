import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../models/notification.dart';
import '../config/api_config.dart';

class NotificationService {
  /// Fetch notifications from the backend API.
  Future<List<AppNotification>> fetchNotifications(String recipientId) async {
    try {
      final headers = await ApiConfig.headers;
      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/notifications?limit=50'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final List notifications = data['notifications'] ?? [];
        return notifications.map((n) => _parseNotification(n)).toList();
      }
    } catch (_) {
      // Fall through to empty list on network error
    }
    return [];
  }

  /// Get unread notification count from the backend API.
  Future<int> getUnreadCount(String recipientId) async {
    try {
      final headers = await ApiConfig.headers;
      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/notifications/unread-count'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['unreadCount'] ?? 0;
      }
    } catch (_) {
      // Fall through to 0 on network error
    }
    return 0;
  }

  /// Mark a single notification as read.
  Future<void> markAsRead(String notificationId) async {
    try {
      final headers = await ApiConfig.headers;
      await http.patch(
        Uri.parse('${ApiConfig.baseUrl}/notifications/$notificationId/read'),
        headers: headers,
      );
    } catch (_) {
      // Non-critical — ignore failure
    }
  }

  /// Mark all notifications as read for the user.
  Future<void> markAllAsRead(String recipientId) async {
    try {
      final headers = await ApiConfig.headers;
      await http.patch(
        Uri.parse('${ApiConfig.baseUrl}/notifications/read-all'),
        headers: headers,
      );
    } catch (_) {
      // Non-critical — ignore failure
    }
  }

  /// Delete all notifications for the user.
  Future<void> deleteAll(String recipientId) async {
    try {
      final headers = await ApiConfig.headers;
      await http.delete(
        Uri.parse('${ApiConfig.baseUrl}/notifications'),
        headers: headers,
      );
    } catch (_) {
      // Non-critical — ignore failure
    }
  }

  /// Create a notification via the backend API.
  /// POST /api/v1/notifications
  Future<void> createNotification(AppNotification notification) async {
    try {
      final headers = await ApiConfig.headers;
      await http.post(
        Uri.parse('${ApiConfig.baseUrl}/notifications'),
        headers: headers,
        body: jsonEncode({
          'recipientId': notification.recipientId,
          'type': notification.icon == Icons.person_add
              ? 'NEW_FOLLOWER'
              : 'SYSTEM',
          'title': notification.name,
          'body': notification.text,
        }),
      );
    } catch (_) {
      // Non-critical — local fallback
    }
  }

  /// Parse a backend notification JSON into an AppNotification.
  AppNotification _parseNotification(Map<String, dynamic> json) {
    // Handle sender being a populated object or just an ID
    final senderObj = json['sender'] as Map<String, dynamic>?;
    final senderName = senderObj != null
        ? (senderObj['name']?.toString() ?? senderObj['username']?.toString() ?? 'System')
        : 'System';

    return AppNotification(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      recipientId: json['recipient']?.toString() ?? '',
      actorId: senderObj?['_id']?.toString() ?? json['sender']?.toString(),
      name: senderName,
      text: json['body']?.toString() ?? '',
      icon: _typeToIcon(json['type']?.toString()),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      isRead: json['isRead'] as bool? ?? false,
      type: json['type']?.toString(),
      targetType: json['targetType']?.toString(),
      targetId: json['targetId']?.toString(),
    );
  }

  /// Map notification type to an icon.
  IconData _typeToIcon(String? type) {
    switch (type) {
      // Social notifications
      case 'NEW_FOLLOWER':
        return Icons.person_add;
      case 'POST_LIKED':
        return Icons.favorite;
      case 'POST_COMMENTED':
      case 'MOMENT_REPLIED':
        return Icons.comment;
      case 'NEW_MESSAGE':
        return Icons.chat_bubble;
      // Content moderation
      case 'POST_VERIFIED':
        return Icons.verified;
      case 'POST_REQUIRES_MODERATION':
        return Icons.rate_review;
      case 'POST_APPROVED':
        return Icons.check_circle;
      case 'POST_REJECTED':
        return Icons.cancel;
      case 'LABEL_OVERRIDE':
        return Icons.label;
      case 'CONTENT_REMOVED':
        return Icons.delete_outline;
      case 'CONTENT_RESTORED':
        return Icons.restore;
      // Reports
      case 'REPORT_RESOLVED':
        return Icons.flag;
      case 'REPORT_DISMISSED':
        return Icons.outlined_flag;
      // Account
      case 'ACCOUNT_SECURITY':
        return Icons.security;
      case 'SYSTEM':
        return Icons.notifications;
      default:
        return Icons.notifications;
    }
  }
}
