import 'dart:io';

import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../l10n/translations.dart';

import '../models/user.dart';
import '../services/user_service.dart';
import '../services/report_service.dart';
import 'chat_screen.dart';
import 'follower_screen.dart';
import '../widgets/profile_post_grid.dart';

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
      backgroundColor: context.nexora.sheet,
      shape: RoundedRectangleBorder(
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
                    color: context.nexora.textDim,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                ListTile(
                  leading: Icon(
                    Icons.flag_outlined,
                    color: Color(0xFFF39C12),
                    size: 22,
                  ),
                  title: Text(
                    tr(ctx, 'Report user'),
                    style: TextStyle(
                      color: context.nexora.textPrimary,
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
      backgroundColor: context.nexora.sheet,
      isScrollControlled: true,
      shape: RoundedRectangleBorder(
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
                            color: context.nexora.textDim,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),

                      Text(
                        trP(ctx, 'Report @{0}', [user!.username]),
                        style: TextStyle(
                          color: context.nexora.textPrimary,
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),

                      SizedBox(height: 4),

                      Text(
                        tr(ctx, 'Why are you reporting this user?'),
                        style: TextStyle(color: context.nexora.textMuted, fontSize: 13),
                      ),

                      SizedBox(height: 16),

                      ...reasons.map((r) => RadioListTile<String>(
                            value: r['value']!,
                            groupValue: selectedReason,
                            onChanged: (val) {
                              setModalState(() => selectedReason = val);
                            },
                            title: Text(
                              tr(ctx, r['label']!),
                              style: TextStyle(
                                color: context.nexora.textPrimary,
                                fontSize: 14,
                              ),
                            ),
                            activeColor: const Color(0xFF3157D5),
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                          )),

                      SizedBox(height: 8),

                      TextField(
                        controller: descriptionController,
                        maxLines: 3,
                        maxLength: 1000,
                        style: TextStyle(
                          color: context.nexora.textPrimary,
                          fontSize: 14,
                        ),
                        decoration: InputDecoration(
                          hintText: tr(ctx, 'Additional details (optional)'),
                          hintStyle: TextStyle(
                            color: context.nexora.textHint,
                            fontSize: 13,
                          ),
                          filled: true,
                          fillColor: context.nexora.card,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(
                              color: context.nexora.textPrimary.withOpacity(0.1),
                            ),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(
                              color: context.nexora.textPrimary.withOpacity(0.1),
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(
                              color: Color(0xFF3157D5),
                            ),
                          ),
                          counterStyle: TextStyle(
                            color: context.nexora.textHint,
                            fontSize: 11,
                          ),
                        ),
                      ),

                      SizedBox(height: 16),

                      SizedBox(
                        width: double.infinity,
                        height: 46,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            color: selectedReason == null
                                ? context.nexora.surfaceSubtle
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
                                        SnackBar(
                                          content: Text(
                                            tr(context,
                                                'Report submitted. Thank you for keeping Nexora safe.'),
                                          ),
                                        ),
                                      );
                                    } else {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            tr(context,
                                                'Could not submit report. Please try again.'),
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
                                ? SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      color: context.nexora.textPrimary,
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Text(
                                    tr(ctx, 'Submit report'),
                                    style: TextStyle(
                                      color: context.nexora.textPrimary,
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

    final bio = user?.bio ?? tr(context, 'Creating, sharing and discovering new things.');

    return Scaffold(
      backgroundColor: context.nexora.backgroundAlt,
      body: SafeArea(
        child: isLoading
            ? Center(
                child: CircularProgressIndicator(color: context.nexora.textPrimary),
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
                          color: context.nexora.card,
                          child: _buildHeroImage(),
                        ),

                        // Bottom gradient
                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: Container(
                            height: 170,
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [Colors.transparent, context.nexora.backgroundAlt],
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
                            icon: Icon(
                              Icons.arrow_back,
                              color: context.nexora.textPrimary,
                            ),
                          ),
                        ),

                        // More
                        Positioned(
                          top: 10,
                          right: 10,
                          child: IconButton(
                            onPressed: _isOwnProfile ? null : _showUserOptions,
                            icon: Icon(
                              Icons.more_vert,
                              color: context.nexora.textPrimary,
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
                                  Icon(
                                    Icons.auto_awesome,
                                    color: Color(0xFF7C5CFF),
                                    size: 17,
                                  ),
                                  SizedBox(width: 6),
                                  Text(
                                    user?.reputationBadge ??
                                        tr(context, 'Nexora Hero'),
                                    style: TextStyle(
                                      color: Color(0xFFB7A8FF),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  if (user?.isVerified ?? false) ...[
                                    SizedBox(width: 6),
                                    Icon(
                                      Icons.verified,
                                      color: Color(0xFF6C8CFF),
                                      size: 16,
                                    ),
                                  ],
                                ],
                              ),

                              SizedBox(height: 7),

                              Text(
                                displayName,
                                style: TextStyle(
                                  color: context.nexora.textPrimary,
                                  fontSize: 28,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),

                              SizedBox(height: 4),

                              Text(
                                '@${username.toLowerCase()}',
                                style: TextStyle(
                                  color: context.nexora.textSecondary,
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
                            style: TextStyle(
                              color: context.nexora.textSecondary,
                              fontSize: 14,
                              height: 1.4,
                            ),
                          ),

                          SizedBox(height: 18),

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
                                            : LinearGradient(
                                                colors: [
                                                  Color(0xFF2878E8),
                                                  Color(0xFF673DE6),
                                                ],
                                              ),
                                        color: isFollowing
                                            ? context.nexora.card
                                            : null,
                                        borderRadius: BorderRadius.circular(24),
                                        border: isFollowing
                                            ? Border.all(
                                                color: context.nexora.surfaceSubtle,
                                              )
                                            : null,
                                      ),
                                      child: Center(
                                        child: Text(
                                          isFollowing
                                              ? tr(context, 'Following')
                                              : tr(context, 'Follow'),
                                          style: TextStyle(
                                            color: context.nexora.textPrimary,
                                            fontSize: 14,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),

                                SizedBox(width: 10),

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
                                        color: context.nexora.card,
                                        borderRadius: BorderRadius.circular(24),
                                        border: Border.all(
                                          color: context.nexora.surfaceSubtle,
                                        ),
                                      ),
                                      child: Center(
                                        child: Text(
                                          tr(context, 'Message'),
                                          style: TextStyle(
                                            color: context.nexora.textPrimary,
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

                          SizedBox(height: 26),

                          // Stats
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _Stat(
                                value: _formatCount(user?.postsCount ?? 0),
                                label: tr(context, 'Posts'),
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
                                  label: tr(context, 'Followers'),
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
                                  label: tr(context, 'Following'),
                                ),
                              ),
                            ],
                          ),

                          SizedBox(height: 28),

                          Text(
                            tr(context, 'Posts'),
                            style: TextStyle(
                              color: context.nexora.textPrimary,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),

                          SizedBox(height: 14),

                          // Real posts published by this user, in an
                          // Instagram-style grid.
                          if (user == null)
                            const SizedBox.shrink()
                          else
                            ProfilePostGrid(
                              userId: user!.id,
                              emptyMessage: trP(context,
                                  '@{0} has not published any posts yet.', [
                                user!.username
                              ]),
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
          errorBuilder: (_, __, ___) => Center(
            child: Icon(Icons.person, color: context.nexora.textDim, size: 110),
          ),
        );
      }
      return Image.file(
        File(url),
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Center(
          child: Icon(Icons.person, color: context.nexora.textDim, size: 110),
        ),
      );
    }

    return Center(
      child: Icon(Icons.person, color: context.nexora.textDim, size: 110),
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
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 17,
            fontWeight: FontWeight.bold,
          ),
        ),
        SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
        ),
      ],
    );
  }
}
