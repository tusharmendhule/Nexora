import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../l10n/translations.dart';

import '../models/user.dart';

class ShareProfileScreen extends StatelessWidget {
  final User user;

  const ShareProfileScreen({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.backgroundAlt,
      appBar: AppBar(
        backgroundColor: context.nexora.backgroundAlt,
        foregroundColor: context.nexora.textPrimary,
        elevation: 0,
        title: Text(
          tr(context, 'Share Profile'),
          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w600),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 30),
          child: Column(
            children: [
              const Spacer(),

              _profileCard(context),

              SizedBox(height: 28),

              _shareButton(
                context,
                icon: Icons.copy_rounded,
                label: tr(context, 'Copy Profile Link'),
                onTap: () {
                  _copyProfileLink(context);
                },
              ),

              SizedBox(height: 12),

              _shareButton(
                context,
                icon: Icons.ios_share_rounded,
                label: tr(context, 'Share Profile'),
                onTap: () {
                  _showShareMessage(context);
                },
              ),

              const Spacer(),

              Text(
                tr(context, 'Share your Nexora profile with others'),
                style: TextStyle(color: context.nexora.textHint, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _profileCard(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: context.nexora.surfaceSubtle),
      ),
      child: Column(
        children: [
          _profileAvatar(context),

          SizedBox(height: 18),

          Text(
            user.displayName ?? user.username,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: context.nexora.textPrimary,
              fontSize: 23,
              fontWeight: FontWeight.bold,
            ),
          ),

          SizedBox(height: 5),

          Text(
            '@${user.username}',
            style: TextStyle(color: context.nexora.textSecondary, fontSize: 13),
          ),

          if (user.bio != null && user.bio!.isNotEmpty) ...[
            SizedBox(height: 14),
            Text(
              user.bio!,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.nexora.textSecondary,
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ],

          SizedBox(height: 22),

          Container(height: 1, color: context.nexora.surfaceSubtle),

          SizedBox(height: 18),

          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _stat(
                  context, user.followersCount.toString(), tr(context, 'Followers')),
              SizedBox(width: 42),
              _stat(
                  context, user.followingCount.toString(), tr(context, 'Following')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _profileAvatar(BuildContext context) {
    return Container(
      width: 104,
      height: 104,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: [Color(0xFF36C8FF), Color(0xFF7B61FF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: ClipOval(
        child: user.profileImageUrl != null && user.profileImageUrl!.isNotEmpty
            ? (kIsWeb || user.profileImageUrl!.startsWith('http')
                ? Image.network(
                    user.profileImageUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _avatarPlaceholder(context),
                  )
                : _avatarPlaceholder(context))
            : _avatarPlaceholder(context),
      ),
    );
  }

  Widget _avatarPlaceholder(BuildContext context) {
    return ColoredBox(
      color: context.nexora.card,
      child: Icon(Icons.person, color: context.nexora.textSecondary, size: 50),
    );
  }

  Widget _stat(BuildContext context, String value, String label) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 17,
            fontWeight: FontWeight.bold,
          ),
        ),
        SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(color: context.nexora.textMuted, fontSize: 11),
        ),
      ],
    );
  }

  Widget _shareButton(
    BuildContext context, {
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
          ),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: context.nexora.textPrimary, size: 19),
                SizedBox(width: 9),
                Text(
                  label,
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _copyProfileLink(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content: Text(trP(context, 'Profile link copied for @{0}', [
            user.username
          ]))),
    );
  }

  void _showShareMessage(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
          content: Text(tr(context, 'System sharing will be connected soon'))),
    );
  }
}
