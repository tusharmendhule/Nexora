import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import 'follower_screen.dart';
import 'share_profile_screen.dart';
import 'edit_profile_screen.dart';
import '../models/user.dart';
import '../services/user_service.dart';
import 'settings_screen.dart';
import '../widgets/profile_moments_grid.dart';
import '../widgets/profile_post_grid.dart';

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

  /// Keys for the posts/memories grids so re-selecting a tab refetches it.
  final GlobalKey<ProfilePostGridState> _postsGridKey =
      GlobalKey<ProfilePostGridState>();
  final GlobalKey<ProfileMomentsGridState> _momentsGridKey =
      GlobalKey<ProfileMomentsGridState>();

  final List<String> sections = [
    'Posts',
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
    final loadedUser = await _userService.getMyProfile();

    if (!mounted) return;

    setState(() {
      user = loadedUser;
      isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
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
                    Stack(
                      children: [
                        Container(
                          width: double.infinity,
                          height: 430,
                          decoration: BoxDecoration(
                            color: context.nexora.card,
                          ),
                          child: _buildHeroImage(),
                        ),

                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: Container(
                            height: 180,
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [Colors.transparent, context.nexora.backgroundAlt],
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
                            icon: Icon(
                              Icons.arrow_back,
                              color: context.nexora.textPrimary,
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
                            icon: Icon(
                              Icons.more_vert,
                              color: context.nexora.textPrimary,
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
                                  Icon(
                                    Icons.auto_awesome,
                                    color: Color(0xFF7C5CFF),
                                    size: 18,
                                  ),
                                  SizedBox(width: 6),
                                  Text(
                                    user?.reputationBadge ?? 'Nexora Hero',
                                    style: TextStyle(
                                      color: Color(0xFFB7A8FF),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  if (user?.isVerified == true) ...[
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
                                user?.displayName ??
                                    user?.username ??
                                    'Username_',
                                style: TextStyle(
                                  color: context.nexora.textPrimary,
                                  fontSize: 30,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),

                              SizedBox(height: 5),

                              Text(
                                '@${user?.username ?? 'username_'}',
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
                      padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.bio ??
                                'Building, creating and exploring the world.',
                            style: TextStyle(
                              color: context.nexora.textSecondary,
                              fontSize: 14,
                              height: 1.4,
                            ),
                          ),

                          SizedBox(height: 18),

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
                                                onSave: ({
                                                  required String displayName,
                                                  required String username,
                                                  required String bio,
                                                  Uint8List? profileImageBytes,
                                                  String? profileImageFilename,
                                                }) async {
                                                  // Update profile fields via API
                                                  final updated = await _userService.updateMyProfile(
                                                    name: displayName,
                                                    username: username,
                                                    bio: bio,
                                                  );

                                                  // Upload the newly picked avatar photo (bytes work
                                                  // on mobile and on the web)
                                                  if (profileImageBytes != null &&
                                                      updated != null) {
                                                    final uploaded =
                                                        await _userService.uploadAvatar(
                                                      profileImageBytes,
                                                      filename: profileImageFilename ??
                                                          'avatar.jpg',
                                                    );

                                                    if (uploaded == null && mounted) {
                                                      ScaffoldMessenger.of(context).showSnackBar(
                                                        SnackBar(
                                                          content: Text(
                                                            'Profile picture could not be updated. Please try again.',
                                                          ),
                                                          behavior:
                                                              SnackBarBehavior.floating,
                                                        ),
                                                      );
                                                    }
                                                  }

                                                  // Reload fresh profile from backend
                                                  await _loadProfile();
                                                },
                                              ),
                                            ),
                                          );

                                          if (!mounted ||
                                              result == null ||
                                              user == null) {
                                            return;
                                          }

                                          // Reload profile from backend after edit
                                          await _loadProfile();
                                        },
                                  child: _profileButton(
                                    text: 'Edit Profile',
                                    filled: false,
                                  ),
                                ),
                              ),
                              SizedBox(width: 10),
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

                          SizedBox(height: 20),

                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _profileStat(
                                _formatCount(user?.postsCount ?? 0),
                                'Posts',
                              ),

                              GestureDetector(
                                onTap: user == null
                                    ? null
                                    : () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => FollowScreen(
                                        username: user?.username ?? 'Username_',
                                        userId: user!.id,
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
                                onTap: user == null
                                    ? null
                                    : () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => FollowScreen(
                                        username: user?.username ?? 'Username_',
                                        userId: user!.id,
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

                          SizedBox(height: 24),

                          // Account metadata — created timestamp
                          if (user?.createdAt != null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 20),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.calendar_today_outlined,
                                    color: context.nexora.textHint,
                                    size: 14,
                                  ),
                                  SizedBox(width: 6),
                                  Text(
                                    'Joined ${_formatDate(user!.createdAt!)}',
                                    style: TextStyle(
                                      color: context.nexora.textHint,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),

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
                                  SizedBox(width: 10),
                              itemBuilder: (context, index) {
                                final selected = selectedSection == index;

                                return GestureDetector(
                                  onTap: () {
                                    setState(() {
                                      selectedSection = index;
                                    });

                                    // Re-fetch the grids whenever the
                                    // Posts / Memories tab is (re)selected.
                                    if (index == 0) {
                                      WidgetsBinding.instance
                                          .addPostFrameCallback((_) {
                                        _postsGridKey.currentState?.reload();
                                      });
                                    }
                                    if (index == 1) {
                                      WidgetsBinding.instance
                                          .addPostFrameCallback((_) {
                                        _momentsGridKey.currentState?.reload();
                                      });
                                    }
                                  },
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 200),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 22,
                                      vertical: 11,
                                    ),
                                    decoration: BoxDecoration(
                                      gradient: selected
                                          ? LinearGradient(
                                              colors: [
                                                Color(0xFF36C8FF),
                                                Color(0xFF7B61FF),
                                              ],
                                            )
                                          : null,
                                      color: selected
                                          ? null
                                          : context.nexora.sheet,
                                      borderRadius: BorderRadius.circular(24),
                                      border: Border.all(
                                        color: selected
                                            ? Colors.transparent
                                            : context.nexora.surfaceSubtle,
                                      ),
                                    ),
                                    child: Text(
                                      sections[index],
                                      style: TextStyle(
                                        color: selected
                                            ? context.nexora.textPrimary
                                            : context.nexora.textSecondary,
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

                          SizedBox(height: 20),

                          _sectionContent(),

                          SizedBox(height: 100),
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
            child: Icon(Icons.person, color: context.nexora.textDim, size: 120),
          ),
        );
      }
      return Image.file(
        File(url),
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Center(
          child: Icon(Icons.person, color: context.nexora.textDim, size: 120),
        ),
      );
    }

    return Center(
      child: Icon(Icons.person, color: context.nexora.textDim, size: 120),
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

  String _formatDate(DateTime date) {
    final months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${months[date.month - 1]} ${date.year}';
  }

  Widget _profileButton({required String text, required bool filled}) {
    return Container(
      height: 44,
      decoration: BoxDecoration(
        gradient: filled
            ? LinearGradient(
                colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
              )
            : null,
        color: filled ? null : context.nexora.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: filled ? Colors.transparent : context.nexora.surfaceSubtle,
        ),
      ),
      child: Center(
        child: Text(
          text,
          style: TextStyle(
            color: context.nexora.textPrimary,
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
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: context.nexora.textPrimary,
          ),
        ),
        SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(fontSize: 12, color: context.nexora.textSecondary),
        ),
      ],
    );
  }

  Widget _sectionContent() {
    switch (selectedSection) {
      case 0:
        // Instagram-style grid of every post the user has published.
        if (user == null) return const SizedBox.shrink();
        return ProfilePostGrid(
          key: _postsGridKey,
          userId: user!.id,
          emptyMessage:
              'No posts yet. When you publish posts they will appear here.',
        );

      case 1:
        // The user's active moments (stories), Instagram-story style.
        if (user == null) return const SizedBox.shrink();
        return ProfileMomentsGrid(
          key: _momentsGridKey,
          userId: user!.id,
          emptyMessage:
              'No active memories. Moments you share will appear here for 24 hours.',
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
        color: context.nexora.sheet,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          Icon(icon, color: const Color(0xFF6C8CFF), size: 32),
          SizedBox(height: 12),
          Text(
            title,
            style: TextStyle(
              color: context.nexora.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 6),
          Text(
            description,
            textAlign: TextAlign.center,
            style: TextStyle(color: context.nexora.textMuted, fontSize: 13),
          ),
        ],
      ),
    );
  }
}
