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

  /// Create a local notification (used by follow_service, etc.).
  /// This stores the notification in memory; in production this would
  /// POST to the backend notifications API.
  Future<void> createNotification(AppNotification notification) async {
    // For now, this is a local no-op. In production, it would call:
    // POST /api/v1/notifications
    try {
      final headers = await ApiConfig.headers;
      await http.post(
        Uri.parse('${ApiConfig.baseUrl}/notifications'),
        headers: headers,
        body: jsonEncode({
          'recipient': notification.recipientId,
          'type': notification.icon == Icons.person_add
              ? 'FOLLOW'
              : 'SYSTEM',
          'body': notification.text,
        }),
      );
    } catch (_) {
      // Non-critical — local fallback
    }
  }

  /// Parse a backend notification JSON into an AppNotification.
  AppNotification _parseNotification(Map<String, dynamic> json) {
    return AppNotification(
      id: json['_id'] ?? json['id'] ?? '',
      recipientId: json['recipient'] ?? '',
      actorId: json['sender'] is Map ? json['sender']['_id'] : json['sender'],
      name: json['sender'] is Map
          ? (json['sender']['name'] ?? json['sender']['username'] ?? 'System')
          : 'System',
      text: json['body'] ?? '',
      icon: _typeToIcon(json['type']),
      createdAt: DateTime.tryParse(json['createdAt'] ?? '') ?? DateTime.now(),
      isRead: json['isRead'] ?? false,
    );
  }

  /// Map notification type to an icon.
  IconData _typeToIcon(String? type) {
    switch (type) {
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
      case 'REPORT_RESOLVED':
        return Icons.flag;
      case 'REPORT_DISMISSED':
        return Icons.outlined_flag;
      case 'ACCOUNT_SECURITY':
        return Icons.security;
      case 'SYSTEM':
        return Icons.notifications;
      default:
        return Icons.notifications;
    }
  }
}
