import 'dart:io';

import 'package:flutter/material.dart';

import '../models/user.dart';

class ShareProfileScreen extends StatelessWidget {
  final User user;

  const ShareProfileScreen({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF080B1A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Share Profile',
          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w600),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 30),
          child: Column(
            children: [
              const Spacer(),

              _profileCard(),

              const SizedBox(height: 28),

              _shareButton(
                icon: Icons.copy_rounded,
                label: 'Copy Profile Link',
                onTap: () {
                  _copyProfileLink(context);
                },
              ),

              const SizedBox(height: 12),

              _shareButton(
                icon: Icons.ios_share_rounded,
                label: 'Share Profile',
                onTap: () {
                  _showShareMessage(context);
                },
              ),

              const Spacer(),

              const Text(
                'Share your Nexora profile with others',
                style: TextStyle(color: Colors.white38, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _profileCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF11162B),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFF26345F)),
      ),
      child: Column(
        children: [
          _profileAvatar(),

          const SizedBox(height: 18),

          Text(
            user.displayName ?? user.username,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 23,
              fontWeight: FontWeight.bold,
            ),
          ),

          const SizedBox(height: 5),

          Text(
            '@${user.username}',
            style: const TextStyle(color: Colors.white60, fontSize: 13),
          ),

          if (user.bio != null && user.bio!.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              user.bio!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ],

          const SizedBox(height: 22),

          Container(height: 1, color: const Color(0xFF26345F)),

          const SizedBox(height: 18),

          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _stat(user.followersCount.toString(), 'Followers'),
              const SizedBox(width: 42),
              _stat(user.followingCount.toString(), 'Following'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _profileAvatar() {
    return Container(
      width: 104,
      height: 104,
      padding: const EdgeInsets.all(3),
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: [Color(0xFF36C8FF), Color(0xFF7B61FF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: ClipOval(
        child: user.profileImageUrl != null && user.profileImageUrl!.isNotEmpty
            ? (user.profileImageUrl!.startsWith('http')
                ? Image.network(
                    user.profileImageUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _avatarPlaceholder(),
                  )
                : Image.file(
                    File(user.profileImageUrl!),
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _avatarPlaceholder(),
                  ))
            : _avatarPlaceholder(),
      ),
    );
  }

  Widget _avatarPlaceholder() {
    return const ColoredBox(
      color: Color(0xFF171D35),
      child: Icon(Icons.person, color: Colors.white70, size: 50),
    );
  }

  Widget _stat(String value, String label) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(color: Colors.white54, fontSize: 11),
        ),
      ],
    );
  }

  Widget _shareButton({
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
          gradient: const LinearGradient(
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
                Icon(icon, color: Colors.white, size: 19),
                const SizedBox(width: 9),
                Text(
                  label,
                  style: const TextStyle(
                    color: Colors.white,
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
      SnackBar(content: Text('Profile link copied for @${user.username}')),
    );
  }

  void _showShareMessage(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('System sharing will be connected soon')),
    );
  }
}
