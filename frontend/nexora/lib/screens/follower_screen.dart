import 'package:flutter/material.dart';

import 'userprofile.dart';
import '../models/user.dart';
import '../services/follow_service.dart';

class FollowScreen extends StatefulWidget {
  final String username;
  final bool showFollowers;
  final String userId;

  const FollowScreen({
    super.key,
    required this.username,
    this.userId = 'user_you',
    this.showFollowers = true,
  });

  @override
  State<FollowScreen> createState() => _FollowScreenState();
}

class _FollowScreenState extends State<FollowScreen> {
  late bool showingFollowers;

  final FollowService _followService = FollowService();

  static const String currentUserId = 'user_you';

  List<User> users = [];
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    showingFollowers = widget.showFollowers;
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    final loadedUsers = showingFollowers
        ? await _followService.getFollowers(widget.userId)
        : await _followService.getFollowing(widget.userId);

    if (!mounted) return;

    setState(() {
      users = loadedUsers;
      isLoading = false;
    });
  }

  Future<void> _toggleFollow(User user) async {
    if (user.id == currentUserId) return;

    final currentlyFollowing = await _followService.isFollowing(
      followerId: currentUserId,
      followingId: user.id,
    );

    if (currentlyFollowing) {
      await _followService.unfollow(
        followerId: currentUserId,
        followingId: user.id,
      );
    } else {
      await _followService.follow(
        followerId: currentUserId,
        followingId: user.id,
      );
    }

    if (!mounted) return;

    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080B1A),

      appBar: AppBar(
        backgroundColor: const Color(0xFF080B1A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(
          widget.username,
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
        ),
      ),

      body: Column(
        children: [
          const SizedBox(height: 8),

          // Followers / Following switch
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Container(
              height: 46,
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: const Color(0xFF171D35),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Row(
                children: [
                  _switchButton('Followers', showingFollowers, () {
                    setState(() {
                      showingFollowers = true;
                      isLoading = true;
                    });
                    _loadUsers();
                  }),
                  _switchButton('Following', !showingFollowers, () {
                    setState(() {
                      showingFollowers = false;
                      isLoading = true;
                    });
                    _loadUsers();
                  }),
                ],
              ),
            ),
          ),

          const SizedBox(height: 14),

          // User list
          Expanded(
            child: isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: users.length,
                    itemBuilder: (context, index) {
                      final user = users[index];

                      return GestureDetector(
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) =>
                                  UserProfileScreen(username: user.username),
                            ),
                          );
                        },
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFF11162B),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Row(
                            children: [
                              const CircleAvatar(
                                radius: 25,
                                backgroundColor: Color(0xFF242A43),
                                child: Icon(
                                  Icons.person,
                                  color: Colors.white54,
                                ),
                              ),

                              const SizedBox(width: 12),

                              Expanded(
                                child: Text(
                                  user.username,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),

                              FutureBuilder<bool>(
                                future: _followService.isFollowing(
                                  followerId: currentUserId,
                                  followingId: user.id,
                                ),
                                builder: (context, snapshot) {
                                  final isFollowed = snapshot.data ?? false;

                                  return GestureDetector(
                                    onTap: () => _toggleFollow(user),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 17,
                                        vertical: 9,
                                      ),
                                      decoration: BoxDecoration(
                                        gradient: isFollowed
                                            ? null
                                            : const LinearGradient(
                                                colors: [
                                                  Color(0xFF2878E8),
                                                  Color(0xFF673DE6),
                                                ],
                                              ),
                                        color: isFollowed
                                            ? const Color(0xFF171D35)
                                            : null,
                                        borderRadius: BorderRadius.circular(20),
                                        border: isFollowed
                                            ? Border.all(
                                                color: const Color(0xFF303653),
                                              )
                                            : null,
                                      ),
                                      child: Text(
                                        isFollowed ? 'Following' : 'Follow',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _switchButton(String text, bool selected, VoidCallback onTap) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: selected
                ? const LinearGradient(
                    colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
                  )
                : null,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            text,
            style: TextStyle(
              color: selected ? Colors.white : Colors.white54,
              fontSize: 13,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
      ),
    );
  }
}
