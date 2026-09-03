import 'package:flutter/material.dart';

import '../models/user.dart';
import '../services/user_service.dart';
import 'main_nav.dart';

class FindPeopleScreen extends StatefulWidget {
  const FindPeopleScreen({super.key});

  @override
  State<FindPeopleScreen> createState() => _FindPeopleScreenState();
}

class _FindPeopleScreenState extends State<FindPeopleScreen> {
  final UserService _userService = UserService();
  final Set<String> _followedUserIds = {};
  final Map<String, bool> _followStatus = {};
  // Note: _followStatus is final, so we use .clear() + .addAll() to update it

  List<User> _people = [];
  bool _isLoading = true;
  String _currentUserId = '';

  @override
  void initState() {
    super.initState();
    _loadPeople();
  }

  Future<void> _loadPeople() async {
    // Get current user ID
    final currentId = await _userService.getCurrentUserId();
    if (!mounted) return;
    _currentUserId = currentId ?? '';

    // Search for users to suggest (using a generic query to get diverse results)
    final users = await _userService.searchUsers('a');

    if (!mounted) return;

    // Filter out current user
    final filteredUsers = users.where((u) => u.id != _currentUserId).toList();

    // Check follow status for each user
    final followStatuses = <String, bool>{};
    final followedIds = <String>{};
    for (final user in filteredUsers) {
      final isFollowing = await _userService.isFollowingUser(user.id);
      followStatuses[user.id] = isFollowing;
      if (isFollowing) {
        followedIds.add(user.id);
      }
    }

    if (!mounted) return;

    setState(() {
      _people = filteredUsers;
      _followStatus
        ..clear()
        ..addAll(followStatuses);
      _followedUserIds.clear();
      _followedUserIds.addAll(followedIds);
      _isLoading = false;
    });
  }

  Future<void> _toggleFollow(User user) async {
    final isCurrentlyFollowing = _followStatus[user.id] ?? false;

    // Optimistic update
    setState(() {
      _followStatus[user.id] = !isCurrentlyFollowing;
      if (isCurrentlyFollowing) {
        _followedUserIds.remove(user.id);
      } else {
        _followedUserIds.add(user.id);
      }
    });

    try {
      if (isCurrentlyFollowing) {
        await _userService.unfollowUser(user.id);
      } else {
        await _userService.followUser(user.id);
      }
    } catch (_) {
      // Revert on failure
      if (mounted) {
        setState(() {
          _followStatus[user.id] = isCurrentlyFollowing;
          if (isCurrentlyFollowing) {
            _followedUserIds.add(user.id);
          } else {
            _followedUserIds.remove(user.id);
          }
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0B1A),
      body: SafeArea(
        child: Column(
          children: [
            _topBar(),

            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                children: [
                  _hero(),

                  const SizedBox(height: 26),

                  const Text(
                    'People you may know',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),

                  const SizedBox(height: 5),

                  const Text(
                    'Follow people to personalize your Nexora experience.',
                    style: TextStyle(color: Colors.white54, fontSize: 12),
                  ),

                  const SizedBox(height: 16),

                  if (_isLoading)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child: CircularProgressIndicator(color: Colors.white),
                      ),
                    )
                  else if (_people.isEmpty)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child: Text(
                          'No people to suggest yet',
                          style: TextStyle(color: Colors.white54, fontSize: 14),
                        ),
                      ),
                    )
                  else
                    ...List.generate(
                      _people.length,
                      (index) => _personCard(user: _people[index]),
                    ),

                  const SizedBox(height: 15),

                  _continueButton(),

                  const SizedBox(height: 10),

                  TextButton(
                    onPressed: _skip,
                    child: const Text(
                      'Skip for now',
                      style: TextStyle(
                        color: Colors.white54,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),

                  const SizedBox(height: 15),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _topBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
      child: Row(
        children: [
          _logo(),

          const Spacer(),

          TextButton(
            onPressed: _skip,
            child: const Text(
              'Skip',
              style: TextStyle(
                color: Colors.white54,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _logo() {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        gradient: const LinearGradient(
          colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Icon(
        Icons.auto_awesome_rounded,
        color: Colors.white,
        size: 22,
      ),
    );
  }

  Widget _hero() {
    return Column(
      children: [
        Container(
          width: 82,
          height: 82,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF7C3AED).withOpacity(0.25),
                blurRadius: 25,
                spreadRadius: 2,
              ),
            ],
          ),
          child: const Icon(
            Icons.people_alt_outlined,
            color: Colors.white,
            size: 39,
          ),
        ),

        const SizedBox(height: 20),

        const Text(
          'Find your people',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white,
            fontSize: 27,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
          ),
        ),

        const SizedBox(height: 8),

        const Text(
          'Connect with people, creators and friends\n'
          'who make Nexora more interesting.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white54, fontSize: 13, height: 1.45),
        ),
      ],
    );
  }

  Widget _personCard({required User user}) {
    final isFollowing = _followStatus[user.id] ?? false;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(17),
        border: Border.all(
          color: isFollowing
              ? const Color(0xFF7C3AED).withOpacity(0.35)
              : Colors.white.withOpacity(0.05),
        ),
      ),
      child: Row(
        children: [
          // Avatar
          CircleAvatar(
            radius: 25,
            backgroundColor: const Color(0xFF6C63FF),
            backgroundImage: user.profileImageUrl != null &&
                    user.profileImageUrl!.isNotEmpty
                ? NetworkImage(user.profileImageUrl!)
                : null,
            child: user.profileImageUrl == null || user.profileImageUrl!.isEmpty
                ? const Icon(Icons.person, color: Colors.white, size: 25)
                : null,
          ),

          const SizedBox(width: 12),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        user.displayName ?? user.username,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (user.isVerified) ...[
                      const SizedBox(width: 4),
                      const Icon(Icons.verified, color: Color(0xFF6C8CFF), size: 14),
                    ],
                  ],
                ),

                const SizedBox(height: 3),

                Text(
                  '@${user.username}',
                  style: const TextStyle(color: Colors.white54, fontSize: 11),
                ),

                const SizedBox(height: 4),

                if (user.bio != null && user.bio!.isNotEmpty)
                  Text(
                    user.bio!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white38, fontSize: 10),
                  ),
              ],
            ),
          ),

          const SizedBox(width: 10),

          SizedBox(
            height: 36,
            child: isFollowing
                ? OutlinedButton.icon(
                    onPressed: () => _toggleFollow(user),
                    icon: const Icon(Icons.check, size: 15),
                    label: const Text(
                      'Following',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF9B8CFF),
                      side: BorderSide(
                        color: const Color(0xFF7C3AED).withOpacity(0.4),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(11),
                      ),
                    ),
                  )
                : ElevatedButton(
                    onPressed: () => _toggleFollow(user),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF3157D5),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(horizontal: 15),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(11),
                      ),
                    ),
                    child: const Text(
                      'Follow',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _continueButton() {
    final count = _followedUserIds.length;

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
        ),
        child: ElevatedButton(
          onPressed: () {
            Navigator.pushAndRemoveUntil(
              context,
              MaterialPageRoute(builder: (context) => const MainNavigation()),
              (route) => false,
            );
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          child: Text(
            count == 0
                ? 'Continue'
                : 'Continue with $count ${count == 1 ? 'follow' : 'follows'}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }

  void _skip() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (context) => const MainNavigation(startWithEmptyHome: true),
      ),
      (route) => false,
    );
  }
}
