import 'dart:io';

import 'package:flutter/material.dart';

import 'findpeople_screen.dart';
import 'post_screen.dart';
import 'notifications_screen.dart';
import 'moments_screen.dart';
import 'share_screen.dart';
import 'comments_screen.dart';
import 'user_profile_screen.dart';
import '../services/moment_service.dart';
import '../models/moment.dart';
import '../models/nexora_label.dart';
import '../models/post.dart';
import '../services/post_service.dart';
import '../services/like_service.dart';
import '../services/trust_score_service.dart';
import '../widgets/nexora_label_badge.dart';

class HomeScreen extends StatefulWidget {
  final bool isEmpty;

  final VoidCallback? onExploreClips;

  const HomeScreen({super.key, this.isEmpty = false, this.onExploreClips});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final LikeService _likeService = LikeService();
  final PostService _postService = PostService();
  final MomentService _momentService = MomentService();

  Moment? _myMoment;

  static const String currentUserId = 'user_you';

  bool _isLoadingPosts = true;
  bool _hasMorePosts = true;
  int _currentPage = 1;

  @override
  void initState() {
    super.initState();
    _loadMyMoment();
    _loadPosts();
  }

  Future<void> _loadMyMoment() async {
    final moments = await _momentService.fetchMoments();

    if (!mounted) return;

    final now = DateTime.now();

    setState(() {
      _myMoment = moments
          .where(
            (moment) =>
                moment.creatorId == currentUserId &&
                moment.expiresAt.isAfter(now),
          )
          .firstOrNull;
    });
  }

  Future<void> _loadPosts() async {
    setState(() => _isLoadingPosts = true);

    try {
      final result = await _postService.fetchPosts(page: 1, limit: 20);
      final fetchedPosts = result['posts'] as List<Post>;

      if (!mounted) return;

      setState(() {
        posts.clear();
        posts.addAll(fetchedPosts);
        _currentPage = 1;
        _hasMorePosts = fetchedPosts.length >= 20;
        _isLoadingPosts = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoadingPosts = false);
    }
  }

  Future<void> _loadMorePosts() async {
    if (!_hasMorePosts || _isLoadingPosts) return;

    try {
      final result = await _postService.fetchPosts(
        page: _currentPage + 1,
        limit: 20,
      );
      final fetchedPosts = result['posts'] as List<Post>;

      if (!mounted) return;

      setState(() {
        posts.addAll(fetchedPosts);
        _currentPage++;
        _hasMorePosts = fetchedPosts.length >= 20;
      });
    } catch (_) {}
  }

  final Map<String, bool> _likedPosts = {};
  final Map<String, int> _postLikeCounts = {};

  final List<Post> posts = [];

  Future<void> _togglePostLike(Post post) async {
    final currentlyLiked = await _likeService.isLiked(
      userId: currentUserId,
      contentId: post.id,
      contentType: 'post',
    );

    if (currentlyLiked) {
      await _likeService.unlike(
        userId: currentUserId,
        contentId: post.id,
        contentType: 'post',
      );
    } else {
      await _likeService.like(
        userId: currentUserId,
        contentId: post.id,
        contentType: 'post',
      );
    }

    if (!mounted) return;

    setState(() {
      final newLikedState = !currentlyLiked;
      _likedPosts[post.id] = newLikedState;

      final currentCount = _postLikeCounts[post.id] ?? post.likeCount;

      _postLikeCounts[post.id] = newLikedState
          ? currentCount + 1
          : (currentCount > 0 ? currentCount - 1 : 0);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0B1A),

      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0B1A),
        elevation: 0,
        title: ShaderMask(
          shaderCallback: (bounds) {
            return const LinearGradient(
              colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ).createShader(bounds);
          },
          child: const Text(
            'N',
            style: TextStyle(
              color: Colors.white,
              fontSize: 38,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),

        actions: [
          IconButton(
            onPressed: () async {
              final result = await Navigator.push<Object?>(
                context,
                MaterialPageRoute(builder: (context) => const PostScreen()),
              );

              if (result is Post && mounted) {
                // New post created — insert at top and refresh
                setState(() {
                  posts.insert(0, result);
                });
              } else if (result == true && mounted) {
                // Generic success signal — reload from API
                _loadPosts();
              }
            },
            icon: const Icon(Icons.add),
          ),

          IconButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const NotificationsScreen(),
                ),
              );
            },
            icon: const Icon(Icons.notifications_none),
          ),
        ],
      ),

      body: widget.isEmpty ? _emptyHome() : _normalHome(),
    );
  }

  Widget _normalHome() {
    return RefreshIndicator(
      onRefresh: _loadPosts,
      backgroundColor: const Color(0xFF171D35),
      color: const Color(0xFF3157D5),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Welcome to Nexora 👋',
            style: TextStyle(
              color: Colors.white,
              fontSize: 26,
              fontWeight: FontWeight.bold,
            ),
          ),

          const SizedBox(height: 8),

          const Text(
            'Connect, share and discover.',
            style: TextStyle(color: Colors.white70, fontSize: 15),
          ),

          const SizedBox(height: 20),

          SizedBox(
            height: 82,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _storyItem(
                  isFirst: true,
                  onTap: () async {
                    if (_myMoment == null) {
                      final result = await Navigator.push<Object?>(
                        context,
                        MaterialPageRoute(builder: (_) => const PostScreen()),
                      );

                      if (result != null && mounted) {
                        await _loadMyMoment();
                      }
                    } else {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const MomentsScreen()),
                      );
                    }
                  },
                ),
                _storyItem(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const MomentsScreen()),
                    );
                  },
                ),
                _storyItem(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const MomentsScreen()),
                    );
                  },
                ),
                _storyItem(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const MomentsScreen()),
                    );
                  },
                ),
                _storyItem(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const MomentsScreen()),
                    );
                  },
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // Loading indicator
          if (_isLoadingPosts && posts.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: CircularProgressIndicator(
                  color: Color(0xFF3157D5),
                  strokeWidth: 2,
                ),
              ),
            ),

          // Empty state
          if (!_isLoadingPosts && posts.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 40),
                child: Column(
                  children: [
                    const Icon(
                      Icons.article_outlined,
                      color: Colors.white24,
                      size: 48,
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'No posts yet',
                      style: TextStyle(
                        color: Colors.white54,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Be the first to share something!',
                      style: TextStyle(color: Colors.white38, fontSize: 13),
                    ),
                  ],
                ),
              ),
            ),

          // Post list
          for (final post in posts) _postCard(context, post),

          // Load more indicator
          if (_hasMorePosts && posts.isNotEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 20),
                child: _isLoadingPosts
                    ? const CircularProgressIndicator(
                        color: Color(0xFF3157D5),
                        strokeWidth: 2,
                      )
                    : GestureDetector(
                        onTap: _loadMorePosts,
                        child: const Text(
                          'Load more',
                          style: TextStyle(
                            color: Color(0xFF3157D5),
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _emptyHome() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(28, 20, 28, 30),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 92,
              height: 92,
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
                    blurRadius: 28,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: const Icon(
                Icons.people_alt_outlined,
                color: Colors.white,
                size: 42,
              ),
            ),

            const SizedBox(height: 24),

            const Text(
              'Your Nexora starts here',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 25,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),

            const SizedBox(height: 10),

            const Text(
              'Your feed is empty for now. Follow people and creators '
              'to start seeing posts, moments and conversations here.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white54,
                fontSize: 13,
                height: 1.5,
              ),
            ),

            const SizedBox(height: 28),

            SizedBox(
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
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => const FindPeopleScreen(),
                      ),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    shadowColor: Colors.transparent,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: const Text(
                    'Find People',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 12),

            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton(
                onPressed: widget.onExploreClips,
                style: OutlinedButton.styleFrom(
                  backgroundColor: const Color(0xFF171D35),
                  side: BorderSide(color: Colors.white.withOpacity(0.07)),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: const Text(
                  'Explore Clips',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _storyItem({bool isFirst = false, required VoidCallback onTap}) {
    final hasMyMoment = isFirst && _myMoment != null;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 70,
        margin: const EdgeInsets.only(right: 10),
        child: Column(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: const Color(0xFF3157D5),
                      width: 2,
                    ),
                  ),
                  child: hasMyMoment
                      ? ClipOval(
                          child: Image.file(
                            File(_myMoment!.mediaUrl),
                            fit: BoxFit.cover,
                          ),
                        )
                      : const CircleAvatar(
                          backgroundColor: Color(0xFFE5E5E5),
                          child: Icon(Icons.person, color: Colors.white),
                        ),
                ),

                if (isFirst && !hasMyMoment)
                  Positioned(
                    right: -2,
                    bottom: -2,
                    child: GestureDetector(
                      onTap: () async {
                        final result = await Navigator.push<Object?>(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const PostScreen(
                              initialType: CreationType.moment,
                            ),
                          ),
                        );

                        if (result != null && mounted) {
                          await _loadMyMoment();
                        }
                      },
                      child: Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: const LinearGradient(
                            colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
                          ),
                          border: Border.all(
                            color: const Color(0xFF0B0B1A),
                            width: 2,
                          ),
                        ),
                        child: const Icon(
                          Icons.add,
                          color: Colors.white,
                          size: 13,
                        ),
                      ),
                    ),
                  ),
              ],
            ),

            const SizedBox(height: 4),

            if (isFirst)
              const Text(
                'You',
                style: TextStyle(fontSize: 11, color: Colors.white),
              ),
          ],
        ),
      ),
    );
  }

  Widget _postCard(BuildContext context, Post post) {
    final username = post.authorUsername;
    final text = post.text ?? '';
    final label = post.label;
    final authorAvatar = post.authorAvatar;
    final isVerified = post.authorIsVerified;
    final tags = post.tags;
    final hashtags = post.hashtags;
    final displayLikeCount = _postLikeCounts[post.id] ?? post.likeCount;

    // Trust score info
    final trustScore = post.trustScore ?? 75;
    final verificationStatus = post.verificationStatus ?? 'unverified';
    final moderationStatus = post.moderationStatus ?? 'pending';

    return Container(
      margin: const EdgeInsets.only(bottom: 18),
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(18),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 10, 14),
            child: Row(
              children: [
                // Author avatar
                CircleAvatar(
                  radius: 21,
                  backgroundColor: const Color(0xFF6C63FF),
                  backgroundImage: authorAvatar != null && authorAvatar.isNotEmpty
                      ? (authorAvatar.startsWith('http')
                          ? NetworkImage(authorAvatar)
                          : null)
                      : null,
                  child: authorAvatar == null || authorAvatar.isEmpty
                      ? const Icon(Icons.person, color: Colors.white)
                      : null,
                ),

                const SizedBox(width: 12),

                Expanded(
                  child: Row(
                    children: [
                      Flexible(
                        child: GestureDetector(
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) =>
                                    UserProfileScreen(username: username),
                              ),
                            );
                          },
                          child: Text(
                            username,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),

                      if (isVerified) ...[
                        const SizedBox(width: 4),
                        const Icon(
                          Icons.verified,
                          color: Color(0xFF6C8CFF),
                          size: 16,
                        ),
                      ],

                      const SizedBox(width: 12),

                      // Trust label badge — tapping opens detail sheet
                      GestureDetector(
                        onTap: () {
                          _showTrustDetailSheet(
                            context,
                            post: post,
                            label: label,
                            trustScore: trustScore,
                            verificationStatus: verificationStatus,
                            moderationStatus: moderationStatus,
                          );
                        },
                        child: NexoraLabelBadge(
                          label: label,
                          showName: false,
                        ),
                      ),
                    ],
                  ),
                ),

                IconButton(
                  onPressed: () {},
                  icon: const Icon(Icons.more_vert, color: Colors.white70),
                ),
              ],
            ),
          ),

          // Media display — image
          if (post.contentType == 'image' && post.mediaUrl != null)
            _buildMediaImage(post.mediaUrl!),

          // Media display — video placeholder
          if (post.contentType == 'video')
            Container(
              width: double.infinity,
              height: 260,
              color: const Color(0xFF252B45),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (post.mediaUrl != null && post.mediaUrl!.isNotEmpty)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: post.mediaUrl!.startsWith('http')
                          ? Image.network(
                              post.mediaUrl!,
                              width: double.infinity,
                              height: 200,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.videocam_outlined,
                                color: Colors.white38,
                                size: 55,
                              ),
                            )
                          : const Icon(
                              Icons.videocam_outlined,
                              color: Colors.white38,
                              size: 55,
                            ),
                    )
                  else
                    const Icon(
                      Icons.videocam_outlined,
                      color: Colors.white38,
                      size: 55,
                    ),
                ],
              ),
            ),

          // Media display — audio placeholder
          if (post.contentType == 'audio')
            Container(
              width: double.infinity,
              height: 120,
              color: const Color(0xFF252B45),
              child: const Center(
                child: Icon(
                  Icons.headphones_outlined,
                  color: Colors.white38,
                  size: 55,
                ),
              ),
            ),

          // Link preview
          if (post.contentType == 'link' && post.linkUrl != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              color: const Color(0xFF252B45),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (post.linkTitle != null)
                    Text(
                      post.linkTitle!,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    post.linkUrl!,
                    style: const TextStyle(
                      color: Color(0xFF7D8CFF),
                      fontSize: 12,
                    ),
                  ),
                  if (post.linkDescription != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      post.linkDescription!,
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),

          // Engagement buttons
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
            child: Row(
              children: [
                IconButton(
                  onPressed: () => _togglePostLike(post),
                  icon: Icon(
                    _likedPosts[post.id] == true
                        ? Icons.favorite
                        : Icons.favorite_border,
                    color: Colors.white,
                  ),
                ),

                IconButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => CommentsScreen(username: username),
                      ),
                    );
                  },
                  icon: const Icon(
                    Icons.chat_bubble_outline,
                    color: Colors.white,
                  ),
                ),

                IconButton(
                  onPressed: () {},
                  icon: const Icon(Icons.repeat, color: Colors.white),
                ),

                IconButton(
                  onPressed: () {
                    Navigator.push(
                      context,

                      MaterialPageRoute(
                        builder: (_) => ShareScreen(username: username),
                      ),
                    );
                  },

                  icon: const Icon(Icons.send_outlined, color: Colors.white),
                ),

                const Spacer(),

                IconButton(
                  onPressed: () {},
                  icon: const Icon(Icons.bookmark_border, color: Colors.white),
                ),
              ],
            ),
          ),

          // Post details
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$displayLikeCount likes',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),

                const SizedBox(height: 8),

                Text(
                  '$username  $text',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    height: 1.4,
                  ),
                ),

                // Tags
                if (tags != null && tags.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: tags.map((tag) => Text(
                      '#$tag',
                      style: const TextStyle(color: Color(0xFF7D8CFF), fontSize: 13),
                    )).toList(),
                  ),
                ],

                // Hashtags
                if (hashtags != null && hashtags.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: hashtags.map((tag) => Text(
                      '#$tag',
                      style: const TextStyle(color: Color(0xFF7D8CFF), fontSize: 13),
                    )).toList(),
                  ),
                ],

                if ((tags == null || tags.isEmpty) && (hashtags == null || hashtags.isEmpty))
                  const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Text(
                      '#Nexora #Community',
                      style: TextStyle(color: Color(0xFF7D8CFF), fontSize: 13),
                    ),
                  ),

                const SizedBox(height: 10),

                // ── Trust Score inline strip ────────────────────────
                _trustScoreStrip(
                  label: label,
                  trustScore: trustScore,
                  verificationStatus: verificationStatus,
                  moderationStatus: moderationStatus,
                  onTap: () {
                    _showTrustDetailSheet(
                      context,
                      post: post,
                      label: label,
                      trustScore: trustScore,
                      verificationStatus: verificationStatus,
                      moderationStatus: moderationStatus,
                    );
                  },
                ),

                const SizedBox(height: 8),

                const Text(
                  'View all comments',
                  style: TextStyle(color: Colors.white54, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Trust Score inline strip ──────────────────────────────
  /// Compact trust indicator shown below post text.
  /// Displays: label name + trust score + verification status.
  /// Color is never the only information shown.
  Widget _trustScoreStrip({
    required NexoraLabel label,
    required int trustScore,
    required String verificationStatus,
    required String moderationStatus,
    required VoidCallback onTap,
  }) {
    // Verification status text
    final statusText = _verificationStatusText(
      verificationStatus,
      moderationStatus,
    );
    final statusColor = _verificationStatusColor(
      verificationStatus,
      moderationStatus,
    );

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: label.color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: label.color.withOpacity(0.25),
            width: 0.8,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Color dot
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: label.color,
              ),
            ),
            const SizedBox(width: 7),
            // Label name — always visible, never color-only
            Text(
              label.name,
              style: TextStyle(
                color: label.color,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(width: 8),
            // Trust score number
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.07),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '$trustScore/100',
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: 8),
            // Verification status chip
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
              decoration: BoxDecoration(
                color: statusColor.withOpacity(0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                statusText,
                style: TextStyle(
                  color: statusColor,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Verification status helpers ────────────────────────────────

  String _verificationStatusText(String verification, String moderation) {
    if (moderation == 'under_review') return 'Moderator Review';
    // Handle both legacy lowercase and new UPPERCASE enum values
    switch (verification) {
      case 'pending':
      case 'PENDING_VERIFICATION':
        return 'Pending';
      case 'processing':
      case 'VERIFYING':
        return 'Analyzing';
      case 'verified':
      case 'VERIFIED':
      case 'PUBLISHED':
        return 'Verified';
      case 'failed':
      case 'FAILED':
        return 'Failed';
      case 'REVIEW_REQUIRED':
        return 'Review Required';
      case 'REJECTED':
        return 'Rejected';
      default:
        return 'Unverified';
    }
  }

  Color _verificationStatusColor(String verification, String moderation) {
    if (moderation == 'under_review') return const Color(0xFFF39C12);
    // Handle both legacy lowercase and new UPPERCASE enum values
    switch (verification) {
      case 'pending':
      case 'PENDING_VERIFICATION':
        return const Color(0xFFF39C12);
      case 'processing':
      case 'VERIFYING':
        return const Color(0xFF3498DB);
      case 'verified':
      case 'VERIFIED':
      case 'PUBLISHED':
        return const Color(0xFF2ECC71);
      case 'failed':
      case 'FAILED':
        return const Color(0xFFE74C3C);
      case 'REVIEW_REQUIRED':
        return const Color(0xFFF39C12);
      case 'REJECTED':
        return const Color(0xFFE74C3C);
      default:
        return Colors.white54;
    }
  }

  // ── Trust detail bottom sheet ──────────────────────────────────
  void _showTrustDetailSheet(
    BuildContext context, {
    required Post post,
    required NexoraLabel label,
    required int trustScore,
    required String verificationStatus,
    required String moderationStatus,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF11162B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 30),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Header: label dot + name ──────────────
              Row(
                children: [
                  Container(
                    width: 16,
                    height: 16,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: label.color,
                      border: Border.all(
                        color: Colors.white.withOpacity(0.55),
                        width: 1.2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: label.color.withValues(alpha: 0.45),
                          blurRadius: 7,
                          spreadRadius: 1,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 14),
                  // Label name — always visible alongside color
                  Expanded(
                    child: Text(
                      label.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  // Trust score number
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: label.color.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '$trustScore / 100',
                      style: TextStyle(
                        color: label.color,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 18),

              // ── Explanation ──────────────────────────
              const Text(
                'Why this label?',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                label.explanation,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),

              const SizedBox(height: 16),

              // ── Verification status ──────────────────
              const Text(
                'Verification status',
                style: TextStyle(
                  color: Colors.white54,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 4),
              _buildStatusRow(
                _verificationStatusText(verificationStatus, moderationStatus),
                _verificationStatusColor(verificationStatus, moderationStatus),
              ),

              const SizedBox(height: 16),

              // ── Content type ─────────────────────────
              const Text(
                'Content type',
                style: TextStyle(
                  color: Colors.white54,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                post.contentType,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                ),
              ),

              // ── Component scores (if available) ──────
              if (post.trustAuthenticity != null) ...[
                const SizedBox(height: 16),
                const Text(
                  'Score breakdown',
                  style: TextStyle(
                    color: Colors.white54,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 6),
                _buildComponentBar('Authenticity', post.trustAuthenticity!),
                const SizedBox(height: 4),
                _buildComponentBar('Factual Verification', post.trustFactualVerification!),
                const SizedBox(height: 4),
                _buildComponentBar('Source Credibility', post.trustSourceCredibility!),
                const SizedBox(height: 4),
                _buildComponentBar('Model Confidence', post.trustModelConfidence!),
              ],

              const SizedBox(height: 16),

              // ── Moderator override note ──────────────
              if (post.trustOverrideApplied == true) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF39C12).withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: const Color(0xFFF39C12).withOpacity(0.3),
                    ),
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.admin_panel_settings_outlined,
                        color: Color(0xFFF39C12),
                        size: 16,
                      ),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'This label was applied or modified by a moderator.',
                          style: TextStyle(
                            color: Color(0xFFF39C12),
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              // ── Request review button ────────────────
              if (verificationStatus != 'verified') ...[
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 42,
                  child: OutlinedButton(
                    onPressed: () async {
                      final service = TrustScoreService();
                      final success = await service.requestModeratorReview(
                        post.id,
                        reason: 'User-requested review',
                      );
                      if (context.mounted) {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              success
                                  ? 'Review requested. A moderator will evaluate this content.'
                                  : 'Could not request review. Please try again.',
                            ),
                          ),
                        );
                      }
                    },
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(
                        color: Colors.white.withOpacity(0.15),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text(
                      'Request Moderator Review',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildStatusRow(String text, Color color) {
    return Row(
      children: [
        Icon(Icons.circle, color: color, size: 8),
        const SizedBox(width: 6),
        Text(
          text,
          style: TextStyle(
            color: color,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildComponentBar(String label, double value) {
    final percent = (value * 100).clamp(0, 100).toInt();
    final barColor = value >= 0.7
        ? const Color(0xFF2ECC71)
        : value >= 0.4
            ? const Color(0xFFF39C12)
            : const Color(0xFFE74C3C);

    return Row(
      children: [
        SizedBox(
          width: 140,
          child: Text(
            label,
            style: const TextStyle(color: Colors.white60, fontSize: 11),
          ),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: value,
              backgroundColor: Colors.white.withOpacity(0.08),
              valueColor: AlwaysStoppedAnimation<Color>(barColor),
              minHeight: 5,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '$percent%',
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildMediaImage(String mediaUrl) {
    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
      return Image.network(
        mediaUrl,
        width: double.infinity,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => Container(
          width: double.infinity,
          height: 260,
          color: const Color(0xFF252B45),
          child: const Center(
            child: Icon(
              Icons.image_outlined,
              color: Colors.white38,
              size: 55,
            ),
          ),
        ),
      );
    }

    // Local file path
    return Image.file(
      File(mediaUrl),
      width: double.infinity,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => Container(
        width: double.infinity,
        height: 260,
        color: const Color(0xFF252B45),
        child: const Center(
          child: Icon(
            Icons.image_outlined,
            color: Colors.white38,
            size: 55,
          ),
        ),
      ),
    );
  }
}
