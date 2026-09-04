import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import 'user_profile_screen.dart';

class ContentViewerScreen extends StatelessWidget {
  final String title;
  final String category;

  const ContentViewerScreen({
    super.key,
    required this.title,
    required this.category,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.backgroundAlt,

      appBar: AppBar(
        backgroundColor: context.nexora.backgroundAlt,
        foregroundColor: context.nexora.textPrimary,
        elevation: 0,
        title: Text(
          'Explore',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
        ),
      ),

      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Content preview
          Container(
            height: 330,
            width: double.infinity,
            margin: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
              ),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Center(
              child: Icon(
                Icons.play_circle_outline,
                color: context.nexora.textPrimary,
                size: 70,
              ),
            ),
          ),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text(
              title,
              style: TextStyle(
                color: context.nexora.textPrimary,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),

          SizedBox(height: 8),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text(
              category,
              style: TextStyle(color: Color(0xFF8F9BB8), fontSize: 14),
            ),
          ),

          SizedBox(height: 20),
          SizedBox(height: 18),

          GestureDetector(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => UserProfileScreen(username: 'User2'),
                ),
              );
            },
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: context.nexora.surfaceSelected,
                  child: Icon(Icons.person, color: context.nexora.textMuted),
                ),
                SizedBox(width: 10),
                Text(
                  'User2',
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(width: 5),
                Icon(Icons.chevron_right, color: context.nexora.textMuted, size: 18),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                _actionButton(context, Icons.favorite_border, 'Like'),
                SizedBox(width: 12),
                _actionButton(context, Icons.chat_bubble_outline, 'Comment'),
                SizedBox(width: 12),
                _actionButton(context, Icons.share_outlined, 'Share'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionButton(BuildContext context, IconData icon, String label) {
    return Expanded(
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          color: context.nexora.card,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: context.nexora.textSecondary, size: 19),
            SizedBox(width: 7),
            Text(
              label,
              style: TextStyle(color: context.nexora.textPrimary, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
