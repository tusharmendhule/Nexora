import 'dart:io';

import 'package:flutter/material.dart';

import '../models/user.dart';
import '../services/user_service.dart';
import '../services/report_service.dart';
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

  User? user;
  bool isLoading = true;
  bool isFollowing = false;
  String _currentUserId = '';

  @override
  void initState() {
    super.initState();
    _loadUser();
  }

  Future<void> _loadUser() async {
    // Get the real current user ID
    final currentId = await _userService.getCurrentUserId();
    _currentUserId = currentId ?? '';

    // Fetch user by username via v1 API
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

    // Check follow status from the API response (isFollowing is set by by-username endpoint)
    final following = loadedUser.isFollowing;

    final followerCount = await _userService.getFollowers(loadedUser.id).then((list) => list.length);
    final followingCount = await _userService.getFollowing(loadedUser.id).then((list) => list.length);

    if (!mounted) return;

    setState(() {
      user = User(
        id: loadedUser.id,
        username: loadedUser.username,
        displayName: loadedUser.displayName,
        bio: loadedUser.bio,
        profileImageUrl: loadedUser.profileImageUrl,
        followersCount: followerCount,
        followingCount: followingCount,
        postsCount: loadedUser.postsCount,
        isFollowing: following,
        isFollowedBy: loadedUser.isFollowedBy,
        isVerified: loadedUser.isVerified,
        website: loadedUser.website,
        email: loadedUser.email,
        reputationBadge: loadedUser.reputationBadge,
        overallTrustRating: loadedUser.overallTrustRating,
        createdAt: loadedUser.createdAt,
      );
      isFollowing = following;
      isLoading = false;
    });
  }

  Future<void> _toggleFollow() async {
    final target = user;

    if (target == null || target.id == _currentUserId) return;

    if (isFollowing) {
      await _userService.unfollowUser(target.id);
    } else {
      await _userService.followUser(target.id);
    }

    // Refresh follow status and counts
    final following = await _userService.isFollowingUser(target.id);
    final followerCount = await _userService.getFollowers(target.id).then((list) => list.length);
    final followingCount = await _userService.getFollowing(target.id).then((list) => list.length);

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
        postsCount: target.postsCount,
        isFollowing: following,
        isFollowedBy: target.isFollowedBy,
        isVerified: target.isVerified,
        website: target.website,
        email: target.email,
        reputationBadge: target.reputationBadge,
        overallTrustRating: target.overallTrustRating,
        createdAt: target.createdAt,
      );
    });
  }

  bool get _isOwnProfile => _currentUserId.isNotEmpty && user?.id == _currentUserId;

  void _showUserOptions() {
    if (user == null) return;

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF11162B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                ListTile(
                  leading: const Icon(
                    Icons.flag_outlined,
                    color: Color(0xFFF39C12),
                    size: 22,
                  ),
                  title: const Text(
                    'Report user',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  onTap: () {
                    Navigator.pop(ctx);
                    _showReportUserDialog();
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showReportUserDialog() {
    if (user == null) return;

    final reportService = ReportService();

    final List<Map<String, String>> reasons = const [
      {'value': 'MISINFORMATION', 'label': 'Misinformation'},
      {'value': 'HARASSMENT', 'label': 'Harassment or bullying'},
      {'value': 'HARMFUL_CONTENT', 'label': 'Harmful content'},
      {'value': 'IMPERSONATION', 'label': 'Impersonation'},
      {'value': 'MANIPULATED_MEDIA', 'label': 'Manipulated media'},
      {'value': 'SPAM', 'label': 'Spam'},
      {'value': 'OTHER', 'label': 'Other'},
    ];

    String? selectedReason;
    final descriptionController = TextEditingController();
    bool isSubmitting = false;

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF11162B),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(ctx).viewInsets.bottom,
              ),
              child: SafeArea(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: Container(
                          width: 36,
                          height: 4,
                          margin: const EdgeInsets.only(bottom: 16),
                          decoration: BoxDecoration(
                            color: Colors.white24,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),

                      Text(
                        'Report @${user!.username}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),

                      const SizedBox(height: 4),

                      const Text(
                        'Why are you reporting this user?',
                        style: TextStyle(color: Colors.white54, fontSize: 13),
                      ),

                      const SizedBox(height: 16),

                      ...reasons.map((r) => RadioListTile<String>(
                            value: r['value']!,
                            groupValue: selectedReason,
                            onChanged: (val) {
                              setModalState(() => selectedReason = val);
                            },
                            title: Text(
                              r['label']!,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 14,
                              ),
                            ),
                            activeColor: const Color(0xFF3157D5),
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                          )),

                      const SizedBox(height: 8),

                      TextField(
                        controller: descriptionController,
                        maxLines: 3,
                        maxLength: 1000,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Additional details (optional)',
                          hintStyle: const TextStyle(
                            color: Colors.white30,
                            fontSize: 13,
                          ),
                          filled: true,
                          fillColor: const Color(0xFF171D35),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(
                              color: Colors.white.withOpacity(0.1),
                            ),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(
                              color: Colors.white.withOpacity(0.1),
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(
                              color: Color(0xFF3157D5),
                            ),
                          ),
                          counterStyle: const TextStyle(
                            color: Colors.white30,
                            fontSize: 11,
                          ),
                        ),
                      ),

                      const SizedBox(height: 16),

                      SizedBox(
                        width: double.infinity,
                        height: 46,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            color: selectedReason == null
                                ? Colors.white10
                                : const Color(0xFFE74C3C),
                          ),
                          child: ElevatedButton(
                            onPressed: (selectedReason == null || isSubmitting)
                                ? null
                                : () async {
                                    setModalState(() => isSubmitting = true);

                                    final success = await reportService.createReport(
                                      targetType: 'User',
                                      targetId: user!.id,
                                      reason: selectedReason!,
                                      description: descriptionController.text.trim(),
                                    );

                                    if (!ctx.mounted) return;
                                    Navigator.pop(ctx);
                                    if (!mounted) return;

                                    if (success) {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                          content: Text(
                                            'Report submitted. Thank you for keeping Nexora safe.',
                                          ),
                                        ),
                                      );
                                    } else {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                          content: Text(
                                            'Could not submit report. Please try again.',
                                          ),
                                        ),
                                      );
                                    }
                                  },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.transparent,
                              shadowColor: Colors.transparent,
                              disabledBackgroundColor: Colors.transparent,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: isSubmitting
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      color: Colors.white,
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Text(
                                    'Submit report',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
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
                          child: _buildHeroImage(),
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
                            onPressed: _isOwnProfile ? null : _showUserOptions,
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
                                  Text(
                                    user?.reputationBadge ?? 'Nexora Hero',
                                    style: const TextStyle(
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
                          if (_currentUserId.isNotEmpty && user?.id != _currentUserId)
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
                                              ChatScreen(
                                                username: username,
                                                targetUserId: user?.id,
                                              ),
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
                              _Stat(
                                value: _formatCount(user?.postsCount ?? 0),
                                label: 'Posts',
                              ),

                              GestureDetector(
                                onTap: () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (context) => FollowScreen(
                                        username: username,
                                        userId: user?.id ?? '',
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
                                        userId: user?.id ?? '',
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

  Widget _buildHeroImage() {
    final url = user?.profileImageUrl;
    if (url != null && url.isNotEmpty) {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return Image.network(
          url,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => const Center(
            child: Icon(Icons.person, color: Colors.white24, size: 110),
          ),
        );
      }
      return Image.file(
        File(url),
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => const Center(
          child: Icon(Icons.person, color: Colors.white24, size: 110),
        ),
      );
    }

    return const Center(
      child: Icon(Icons.person, color: Colors.white24, size: 110),
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
