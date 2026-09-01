import 'dart:io';

import 'package:flutter/material.dart';

import 'follower_screen.dart';
import 'share_profile_screen.dart';
import 'edit_profile_screen.dart';
import '../models/user.dart';
import '../services/user_service.dart';
import 'settings_screen.dart';

class ProfileScreen extends StatefulWidget {
  final VoidCallback? onBack;

  const ProfileScreen({super.key, this.onBack});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final UserService _userService = UserService();

  int selectedSection = 0;

  User? user;
  bool isLoading = true;

  final List<String> sections = [
    'Projects',
    'Memories',
    'Communities',
    'Thoughts',
  ];

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final loadedUser = await _userService.getUserByUsername('Username_');

    if (!mounted) return;

    setState(() {
      user = loadedUser;
      isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080B1A),
      body: SafeArea(
        child: isLoading
            ? const Center(
                child: CircularProgressIndicator(color: Colors.white),
              )
            : SingleChildScrollView(
                child: Column(
                  children: [
                    Stack(
                      children: [
                        Container(
                          width: double.infinity,
                          height: 430,
                          decoration: const BoxDecoration(
                            color: Color(0xFF171D35),
                          ),
                          child:
                              user?.profileImageUrl != null &&
                                  user!.profileImageUrl!.isNotEmpty
                              ? Image.file(
                                  File(user!.profileImageUrl!),
                                  fit: BoxFit.cover,
                                )
                              : const Center(
                                  child: Icon(
                                    Icons.person,
                                    color: Colors.white24,
                                    size: 120,
                                  ),
                                ),
                        ),

                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: Container(
                            height: 180,
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [Colors.transparent, Color(0xFF080B1A)],
                              ),
                            ),
                          ),
                        ),

                        Positioned(
                          top: 12,
                          left: 12,
                          child: IconButton(
                            onPressed: () {
                              if (widget.onBack != null) {
                                widget.onBack!();
                              } else if (Navigator.canPop(context)) {
                                Navigator.pop(context);
                              }
                            },
                            icon: const Icon(
                              Icons.arrow_back,
                              color: Colors.white,
                            ),
                          ),
                        ),

                        Positioned(
                          top: 12,
                          right: 12,
                          child: IconButton(
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (context) => const SettingsScreen(),
                                ),
                              );
                            },
                            icon: const Icon(
                              Icons.more_vert,
                              color: Colors.white,
                            ),
                          ),
                        ),

                        Positioned(
                          left: 24,
                          right: 24,
                          bottom: 24,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.auto_awesome,
                                    color: Color(0xFF7C5CFF),
                                    size: 18,
                                  ),
                                  const SizedBox(width: 6),
                                  const Text(
                                    'Nexora Hero',
                                    style: TextStyle(
                                      color: Color(0xFFB7A8FF),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),

                              const SizedBox(height: 7),

                              Text(
                                user?.displayName ??
                                    user?.username ??
                                    'Username_',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 30,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),

                              const SizedBox(height: 5),

                              Text(
                                '@${user?.username ?? 'username_'}',
                                style: const TextStyle(
                                  color: Colors.white60,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.bio ??
                                'Building, creating and exploring the world.',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 14,
                              height: 1.4,
                            ),
                          ),

                          const SizedBox(height: 18),

                          Row(
                            children: [
                              Expanded(
                                child: GestureDetector(
                                  onTap: user == null
                                      ? null
                                      : () async {
                                          final result = await Navigator.push<Map<String, dynamic>>(
                                            context,
                                            MaterialPageRoute(
                                              builder: (_) => EditProfileScreen(
                                                user: user!,
                                                onSave:
                                                    ({
                                                      required String
                                                      displayName,
                                                      required String username,
                                                      required String bio,
                                                      String? profileImagePath,
                                                    }) async {
                                                      await _userService.updateUser(
                                                        User(
                                                          id: user!.id,
                                                          username: username,
                                                          displayName:
                                                              displayName,
                                                          bio: bio,
                                                          profileImageUrl:
                                                              profileImagePath,
                                                          followersCount: user!
                                                              .followersCount,
                                                          followingCount: user!
                                                              .followingCount,
                                                          isFollowing:
                                                              user!.isFollowing,
                                                          isFollowedBy: user!
                                                              .isFollowedBy,
                                                          isVerified:
                                                              user!.isVerified,
                                                        ),
                                                      );
                                                    },
                                              ),
                                            ),
                                          );

                                          if (!mounted ||
                                              result == null ||
                                              user == null)
                                            return;

                                          setState(() {
                                            user = User(
                                              id: user!.id,
                                              username:
                                                  result['username'] as String,
                                              displayName:
                                                  result['displayName']
                                                      as String,
                                              bio: result['bio'] as String,
                                              profileImageUrl:
                                                  result['profileImagePath']
                                                      as String?,
                                              followersCount:
                                                  user!.followersCount,
                                              followingCount:
                                                  user!.followingCount,
                                              isFollowing: user!.isFollowing,
                                              isFollowedBy: user!.isFollowedBy,
                                              isVerified: user!.isVerified,
                                            );
                                          });
                                        },
                                  child: _profileButton(
                                    text: 'Edit Profile',
                                    filled: false,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: GestureDetector(
                                  onTap: user == null
                                      ? null
                                      : () {
                                          Navigator.push(
                                            context,
                                            MaterialPageRoute(
                                              builder: (_) =>
                                                  ShareProfileScreen(
                                                    user: user!,
                                                  ),
                                            ),
                                          );
                                        },
                                  child: _profileButton(
                                    text: 'Share Profile',
                                    filled: true,
                                  ),
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(height: 20),

                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _profileStat('128', 'Posts'),

                              GestureDetector(
                                onTap: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => FollowScreen(
                                        username: user?.username ?? 'Username_',
                                        showFollowers: true,
                                      ),
                                    ),
                                  );
                                },
                                child: _profileStat(
                                  _formatCount(user?.followersCount ?? 0),
                                  'Followers',
                                ),
                              ),

                              GestureDetector(
                                onTap: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => FollowScreen(
                                        username: user?.username ?? 'Username_',
                                        showFollowers: false,
                                      ),
                                    ),
                                  );
                                },
                                child: _profileStat(
                                  _formatCount(user?.followingCount ?? 0),
                                  'Following',
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(height: 24),

                          SizedBox(
                            height: 48,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              physics: const BouncingScrollPhysics(),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              itemCount: sections.length,
                              separatorBuilder: (context, index) =>
                                  const SizedBox(width: 10),
                              itemBuilder: (context, index) {
                                final selected = selectedSection == index;

                                return GestureDetector(
                                  onTap: () {
                                    setState(() {
                                      selectedSection = index;
                                    });
                                  },
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 200),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 22,
                                      vertical: 11,
                                    ),
                                    decoration: BoxDecoration(
                                      gradient: selected
                                          ? const LinearGradient(
                                              colors: [
                                                Color(0xFF36C8FF),
                                                Color(0xFF7B61FF),
                                              ],
                                            )
                                          : null,
                                      color: selected
                                          ? null
                                          : const Color(0xFF111A3A),
                                      borderRadius: BorderRadius.circular(24),
                                      border: Border.all(
                                        color: selected
                                            ? Colors.transparent
                                            : const Color(0xFF26345F),
                                      ),
                                    ),
                                    child: Text(
                                      sections[index],
                                      style: TextStyle(
                                        color: selected
                                            ? Colors.white
                                            : Colors.white70,
                                        fontSize: 12,
                                        fontWeight: selected
                                            ? FontWeight.w600
                                            : FontWeight.w500,
                                      ),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),

                          const SizedBox(height: 20),

                          _sectionContent(),

                          const SizedBox(height: 100),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  String _formatCount(int count) {
    if (count >= 1000) {
      final value = count / 1000;

      if (value == value.roundToDouble()) {
        return '${value.toInt()}K';
      }

      return '${value.toStringAsFixed(1)}K';
    }

    return count.toString();
  }

  Widget _profileButton({required String text, required bool filled}) {
    return Container(
      height: 44,
      decoration: BoxDecoration(
        gradient: filled
            ? const LinearGradient(
                colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
              )
            : null,
        color: filled ? null : const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: filled ? Colors.transparent : const Color(0xFF303653),
        ),
      ),
      child: Center(
        child: Text(
          text,
          style: TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: filled ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
      ),
    );
  }

  Widget _profileStat(String value, String label) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: Colors.white70),
        ),
      ],
    );
  }

  Widget _sectionContent() {
    switch (selectedSection) {
      case 0:
        return _contentCard(
          Icons.code,
          'Projects',
          'Your projects and creations will appear here.',
        );

      case 1:
        return _contentCard(
          Icons.photo_library_outlined,
          'Memories',
          'Your shared memories will appear here.',
        );

      case 2:
        return _contentCard(
          Icons.groups_outlined,
          'Communities',
          'Communities you are part of will appear here.',
        );

      default:
        return _contentCard(
          Icons.lightbulb_outline,
          'Thoughts',
          'Your thoughts and posts will appear here.',
        );
    }
  }

  Widget _contentCard(IconData icon, String title, String description) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: const Color(0xFF11162B),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          Icon(icon, color: const Color(0xFF6C8CFF), size: 32),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            description,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white54, fontSize: 13),
          ),
        ],
      ),
    );
  }
}
