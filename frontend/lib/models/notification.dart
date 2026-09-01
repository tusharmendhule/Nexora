import 'package:flutter/material.dart';

class AppNotification {
  final String id;
  final String recipientId;
  final String? actorId;
  final String name;
  final String text;
  final IconData icon;
  final DateTime createdAt;
  final bool isRead;

  const AppNotification({
    required this.id,
    required this.recipientId,
    this.actorId,
    required this.name,
    required this.text,
    required this.icon,
    required this.createdAt,
    this.isRead = false,
  });

  AppNotification copyWith({
    bool? isRead,
  }) {
    return AppNotification(
      id: id,
      recipientId: recipientId,
      actorId: actorId,
      name: name,
      text: text,
      icon: icon,
      createdAt: createdAt,
      isRead: isRead ?? this.isRead,
    );
  }
}
