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
import '../models/post.dart';
import '../services/post_service.dart';
import '../models/nexora_label.dart';
import '../services/like_service.dart';
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
    final savedPosts = await _postService.fetchPosts();

    if (!mounted) return;

    setState(() {
      posts.insertAll(0, savedPosts);
    });
  }

  final Map<String, bool> _likedPosts = {};
  final Map<String, int> _postLikeCounts = {};

  final List<Post> posts = [
    Post(
      id: 'post_001',
      authorId: 'user_you',
      authorUsername: 'You',
      text: 'Just joined Nexora! 🚀',
      contentType: 'text',
      label: NexoraLabel.verifiedAuthentic,
      likeCount: 128,
      createdAt: DateTime(2026, 8, 29),
    ),
  ];

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
                setState(() {
                  posts.insert(0, result);
                });
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
    return ListView(
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

        _postCard(context, posts[0]),

        _postCard(
          context,
          Post(
            id: 'post_002',
            authorId: 'nexora_ai_lab',
            authorUsername: 'Nexora AI Lab',
            text: 'This image was created with AI and its origin has been verified. 🤖',
            contentType: 'image',
            label: NexoraLabel.aiGeneratedVerified,
            createdAt: DateTime(2026, 8, 28),
          ),
        ),

        _postCard(
          context,
          Post(
            id: 'post_003',
            authorId: 'nexora_community',
            authorUsername: 'Nexora Community',
            text: 'An edited artwork shared with commentary and creative interpretation. 🎨',
            contentType: 'image',
            label: NexoraLabel.editedContent,
            createdAt: DateTime(2026, 8, 27),
          ),
        ),

        _postCard(
          context,
          Post(
            id: 'post_004',
            authorId: 'nexora_community',
            authorUsername: 'Nexora Community',
            text: 'A claim that has conflicting context and should be reviewed carefully. ⚠️',
            contentType: 'text',
            label: NexoraLabel.disputedNeedsContext,
            createdAt: DateTime(2026, 8, 26),
          ),
        ),

        _postCard(
          context,
          Post(
            id: 'post_005',
            authorId: 'nexora_community',
            authorUsername: 'Nexora Community',
            text: 'A claim shown to be false or materially misleading. 🚨',
            contentType: 'text',
            label: NexoraLabel.falseOrMisleading,
            createdAt: DateTime(2026, 8, 25),
          ),
        ),
      ],
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
    final label = post.label.name;
    final why = post.label.explanation;
    final contentType = post.contentType;
    final source = 'Nexora classification source: ${post.label.explanation}';
    final labelColor = post.label.color;
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
                const CircleAvatar(
                  radius: 21,
                  backgroundColor: Color(0xFF6C63FF),
                  child: Icon(Icons.person, color: Colors.white),
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

                      const SizedBox(width: 12),

                      GestureDetector(
                        onTap: () {
                          showModalBottomSheet(
                            context: context,
                            backgroundColor: const Color(0xFF11162B),
                            shape: const RoundedRectangleBorder(
                              borderRadius: BorderRadius.vertical(
                                top: Radius.circular(24),
                              ),
                            ),
                            builder: (context) {
                              return Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  20,
                                  20,
                                  20,
                                  30,
                                ),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Container(
                                          width: 16,
                                          height: 16,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: labelColor,
                                            border: Border.all(
                                              color: Colors.white.withOpacity(
                                                0.55,
                                              ),
                                              width: 1.2,
                                            ),
                                            boxShadow: [
                                              BoxShadow(
                                                color: labelColor.withValues(
                                                  alpha: 0.45,
                                                ),
                                                blurRadius: 7,
                                                spreadRadius: 1,
                                              ),
                                            ],
                                          ),
                                        ),

                                        const SizedBox(width: 14),

                                        Text(
                                          label,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 17,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                    ),

                                    const SizedBox(height: 18),

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
                                      why,
                                      style: const TextStyle(
                                        color: Colors.white70,
                                        fontSize: 13,
                                        height: 1.4,
                                      ),
                                    ),

                                    const SizedBox(height: 16),

                                    const Text(
                                      'Content type',
                                      style: TextStyle(
                                        color: Colors.white54,
                                        fontSize: 12,
                                      ),
                                    ),

                                    const SizedBox(height: 4),

                                    Text(
                                      contentType,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 13,
                                      ),
                                    ),

                                    const SizedBox(height: 16),

                                    const Text(
                                      'Context / sources',
                                      style: TextStyle(
                                        color: Colors.white54,
                                        fontSize: 12,
                                      ),
                                    ),

                                    const SizedBox(height: 4),

                                    Text(
                                      source,
                                      style: const TextStyle(
                                        color: Colors.white70,
                                        fontSize: 13,
                                        height: 1.4,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                          );
                        },
                        child: NexoraLabelBadge(
                          label: post.label,
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

          if (post.contentType == 'image' && post.mediaUrl != null)
            Image.file(
              File(post.mediaUrl!),
              width: double.infinity,
              fit: BoxFit.contain,
            )
          else if (post.contentType == 'image')
            Container(
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
            )
          else if (post.contentType == 'video')
            Container(
              width: double.infinity,
              height: 260,
              color: const Color(0xFF252B45),
              child: const Center(
                child: Icon(
                  Icons.videocam_outlined,
                  color: Colors.white38,
                  size: 55,
                ),
              ),
            ),

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

          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${_postLikeCounts[post.id] ?? post.likeCount} likes',
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

                const SizedBox(height: 6),

                const Text(
                  '#Nexora #Community',
                  style: TextStyle(color: Color(0xFF7D8CFF), fontSize: 13),
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
}
