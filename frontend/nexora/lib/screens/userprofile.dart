import 'package:flutter/material.dart';

import '../models/user.dart';
import '../services/user_service.dart';
import '../services/follow_service.dart';
import 'chat_screen.dart';
import 'follower_screen.dart';

class UserProfileScreen extends StatefulWidget {
  final String username;

  const UserProfileScreen({super.key, required this.username});

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  final UserService _userService = UserService();
  final FollowService _followService = FollowService();

  static const String currentUserId = 'user_you';

  User? user;
  bool isLoading = true;
  bool isFollowing = false;

  @override
  void initState() {
    super.initState();
    _loadUser();
  }

  Future<void> _loadUser() async {
    final loadedUser = await _userService.getUserByUsername(widget.username);

    if (!mounted) return;

    if (loadedUser == null) {
      setState(() {
        user = null;
        isFollowing = false;
        isLoading = false;
      });
      return;
    }

    final following = loadedUser.id == currentUserId
        ? false
        : await _followService.isFollowing(
            followerId: currentUserId,
            followingId: loadedUser.id,
          );

    final followerCount = await _followService.getFollowerCount(loadedUser.id);
    final followingCount = await _followService.getFollowingCount(
      loadedUser.id,
    );

    final updatedUser = User(
      id: loadedUser.id,
      username: loadedUser.username,
      displayName: loadedUser.displayName,
      bio: loadedUser.bio,
      profileImageUrl: loadedUser.profileImageUrl,
      followersCount: followerCount,
      followingCount: followingCount,
      isFollowing: following,
      isFollowedBy: loadedUser.isFollowedBy,
      isVerified: loadedUser.isVerified,
    );

    setState(() {
      user = updatedUser;
      isFollowing = following;
      isLoading = false;
    });
  }

  Future<void> _toggleFollow() async {
    final target = user;

    if (target == null || target.id == currentUserId) return;

    if (isFollowing) {
      await _followService.unfollow(
        followerId: currentUserId,
        followingId: target.id,
      );
    } else {
      await _followService.follow(
        followerId: currentUserId,
        followingId: target.id,
      );
    }

    final following = await _followService.isFollowing(
      followerId: currentUserId,
      followingId: target.id,
    );
    final followerCount = await _followService.getFollowerCount(target.id);
    final followingCount = await _followService.getFollowingCount(target.id);

    if (!mounted) return;

    setState(() {
      isFollowing = following;
      user = User(
        id: target.id,
        username: target.username,
        displayName: target.displayName,
        bio: target.bio,
        profileImageUrl: target.profileImageUrl,
        followersCount: followerCount,
        followingCount: followingCount,
        isFollowing: following,
        isFollowedBy: target.isFollowedBy,
        isVerified: target.isVerified,
      );
    });
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

  @override
  Widget build(BuildContext context) {
    final displayName = user?.displayName ?? widget.username;

    final username = user?.username ?? widget.username;

    final bio = user?.bio ?? 'Creating, sharing and discovering new things.';

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
                    // Hero area
                    Stack(
                      children: [
                        Container(
                          width: double.infinity,
                          height: 390,
                          color: const Color(0xFF171D35),
                          child: const Center(
                            child: Icon(
                              Icons.person,
                              color: Colors.white24,
                              size: 110,
                            ),
                          ),
                        ),

                        // Bottom gradient
                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: Container(
                            height: 170,
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [Colors.transparent, Color(0xFF080B1A)],
                              ),
                            ),
                          ),
                        ),

                        // Back
                        Positioned(
                          top: 10,
                          left: 10,
                          child: IconButton(
                            onPressed: () {
                              Navigator.pop(context);
                            },
                            icon: const Icon(
                              Icons.arrow_back,
                              color: Colors.white,
                            ),
                          ),
                        ),

                        // More
                        Positioned(
                          top: 10,
                          right: 10,
                          child: IconButton(
                            onPressed: () {},
                            icon: const Icon(
                              Icons.more_vert,
                              color: Colors.white,
                            ),
                          ),
                        ),

                        // Identity
                        Positioned(
                          left: 24,
                          right: 24,
                          bottom: 22,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.auto_awesome,
                                    color: Color(0xFF7C5CFF),
                                    size: 17,
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
                                  if (user?.isVerified ?? false) ...[
                                    const SizedBox(width: 6),
                                    const Icon(
                                      Icons.verified,
                                      color: Color(0xFF6C8CFF),
                                      size: 16,
                                    ),
                                  ],
                                ],
                              ),

                              const SizedBox(height: 7),

                              Text(
                                displayName,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 28,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),

                              const SizedBox(height: 4),

                              Text(
                                '@${username.toLowerCase()}',
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
                      padding: const EdgeInsets.fromLTRB(24, 18, 24, 100),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            bio,
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 14,
                              height: 1.4,
                            ),
                          ),

                          const SizedBox(height: 18),

                          // Follow + Message
                          Row(
                            children: [
                              Expanded(
                                child: GestureDetector(
                                  onTap: _toggleFollow,
                                  child: Container(
                                    height: 46,
                                    decoration: BoxDecoration(
                                      gradient: isFollowing
                                          ? null
                                          : const LinearGradient(
                                              colors: [
                                                Color(0xFF2878E8),
                                                Color(0xFF673DE6),
                                              ],
                                            ),
                                      color: isFollowing
                                          ? const Color(0xFF171D35)
                                          : null,
                                      borderRadius: BorderRadius.circular(24),
                                      border: isFollowing
                                          ? Border.all(
                                              color: const Color(0xFF303653),
                                            )
                                          : null,
                                    ),
                                    child: Center(
                                      child: Text(
                                        isFollowing ? 'Following' : 'Follow',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),

                              const SizedBox(width: 10),

                              Expanded(
                                child: GestureDetector(
                                  onTap: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (context) =>
                                            ChatScreen(username: username),
                                      ),
                                    );
                                  },
                                  child: Container(
                                    height: 46,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF171D35),
                                      borderRadius: BorderRadius.circular(24),
                                      border: Border.all(
                                        color: const Color(0xFF303653),
                                      ),
                                    ),
                                    child: const Center(
                                      child: Text(
                                        'Message',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(height: 26),

                          // Stats
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              const _Stat(value: '128', label: 'Posts'),

                              GestureDetector(
                                onTap: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (context) => FollowScreen(
                                        username: username,
                                        showFollowers: true,
                                      ),
                                    ),
                                  );
                                },
                                child: _Stat(
                                  value: _formatCount(
                                    user?.followersCount ?? 0,
                                  ),
                                  label: 'Followers',
                                ),
                              ),

                              GestureDetector(
                                onTap: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (context) => FollowScreen(
                                        username: username,
                                        showFollowers: false,
                                      ),
                                    ),
                                  );
                                },
                                child: _Stat(
                                  value: _formatCount(
                                    user?.followingCount ?? 0,
                                  ),
                                  label: 'Following',
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(height: 28),

                          const Text(
                            'Recent activity',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),

                          const SizedBox(height: 14),

                          _activityCard(
                            Icons.image_outlined,
                            'Shared a new post',
                          ),

                          const SizedBox(height: 10),

                          _activityCard(
                            Icons.favorite_border,
                            'Liked a community post',
                          ),

                          const SizedBox(height: 10),

                          _activityCard(
                            Icons.groups_outlined,
                            'Joined a community',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _activityCard(IconData icon, String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF11162B),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF6C8CFF), size: 24),
          const SizedBox(width: 14),
          Text(
            text,
            style: const TextStyle(color: Colors.white70, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String value;
  final String label;

  const _Stat({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
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
          style: const TextStyle(color: Colors.white54, fontSize: 12),
        ),
      ],
    );
  }
}
