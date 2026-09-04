import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import '../services/appearance_controller.dart';

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
import '../services/reshare_service.dart';
import '../services/user_service.dart';
import '../services/trust_score_service.dart';
import '../services/report_service.dart';
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
  final ReshareService _reshareService = ReshareService();
  final MomentService _momentService = MomentService();
  final UserService _userService = UserService();
  final ReportService _reportService = ReportService();

  Moment? _myMoment;
  String _currentUserId = '';

  /// Current user's profile picture URL, shown in the "You" story circle
  /// (empty → default person icon).
  String _myAvatarUrl = '';

  /// Active moments from other users — one story circle per creator.
  List<Moment> _storyMoments = [];

  bool _isLoadingPosts = true;
  bool _hasMorePosts = true;
  int _currentPage = 1;

  @override
  void initState() {
    super.initState();
    _loadCurrentUser();
  }

  Future<void> _loadCurrentUser() async {
    final me = await _userService.getMyProfile();
    if (!mounted) return;
    setState(() {
      _currentUserId = me?.id ?? '';
      _myAvatarUrl = me?.profileImageUrl ?? '';
    });
    _loadMyMoment();
    _loadPosts();
  }

  Future<void> _loadMyMoment() async {
    if (_currentUserId.isEmpty) return;
    final moments = await _momentService.fetchMoments();
    if (!mounted) return;

    final now = DateTime.now();

    // Latest active moment of the current user (shown in the "You" circle).
    final myMoments = moments
        .where(
          (moment) =>
              moment.creatorId == _currentUserId &&
              moment.expiresAt.isAfter(now),
        )
        .toList();

    // One circle per other creator with an active moment. The backend sorts
    // by createdAt descending, so the first moment seen per creator is the
    // newest one.
    final seenCreators = <String>{};
    final otherMoments = <Moment>[];
    for (final moment in moments) {
      if (moment.creatorId == _currentUserId) continue;
      if (!moment.expiresAt.isAfter(now)) continue;
      if (!seenCreators.add(moment.creatorId)) continue;
      otherMoments.add(moment);
    }

    if (!mounted) return;

    setState(() {
      _myMoment = myMoments.firstOrNull;
      _storyMoments = otherMoments;
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
        _initLikeStates(fetchedPosts);
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
        _initLikeStates(fetchedPosts);
      });
    } catch (_) {}
  }

  // Maps tracking per-post interaction state, initialized from backend data
  final Map<String, bool> _likedPosts = {};
  final Map<String, int> _postLikeCounts = {};
  final Map<String, bool> _savedPosts = {};
  final Map<String, bool> _resharedPosts = {};

  /// Initialize local interaction state from the fetched post data.
  void _initLikeStates(List<Post> fetchedPosts) {
    for (final post in fetchedPosts) {
      _likedPosts[post.id] = post.isLiked;
      _postLikeCounts[post.id] = post.likeCount;
      _savedPosts[post.id] = post.isSaved;
      _resharedPosts[post.id] = post.isReposted;
    }
  }

  final List<Post> posts = [];

  Future<void> _togglePostLike(Post post) async {
    // Optimistic update — flip state immediately
    final previousLiked = _likedPosts[post.id] ?? false;
    final previousCount = _postLikeCounts[post.id] ?? post.likeCount;

    final newLiked = !previousLiked;
    final newCount = newLiked
        ? previousCount + 1
        : (previousCount > 0 ? previousCount - 1 : 0);

    if (!mounted) return;
    setState(() {
      _likedPosts[post.id] = newLiked;
      _postLikeCounts[post.id] = newCount;
    });

    // Call backend
    final result = await _likeService.toggleLike(postId: post.id);

    if (!mounted) return;

    if (result['error'] == true) {
      // Rollback on failure
      setState(() {
        _likedPosts[post.id] = previousLiked;
        _postLikeCounts[post.id] = previousCount;
      });
    } else {
      // Trust the backend response
      setState(() {
        _likedPosts[post.id] = result['isLiked'] as bool;
        _postLikeCounts[post.id] = result['likesCount'] as int;
      });
    }
  }

  Future<void> _togglePostSave(Post post) async {
    final previousSaved = _savedPosts[post.id] ?? false;

    if (!mounted) return;
    setState(() {
      _savedPosts[post.id] = !previousSaved;
    });

    final result = await _postService.toggleSave(postId: post.id);

    if (!mounted) return;

    if (result['error'] == true) {
      // Roll back — never mark the post saved if the backend failed
      setState(() {
        _savedPosts[post.id] = previousSaved;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not save post. Please try again.')),
      );
      return;
    }

    setState(() {
      _savedPosts[post.id] = result['isSaved'] as bool;
    });
  }

  Future<void> _togglePostReshare(Post post) async {
    final previousReshared = _resharedPosts[post.id] ?? false;

    if (!mounted) return;
    setState(() {
      _resharedPosts[post.id] = !previousReshared;
    });

    final result = await _reshareService.toggleReshare(postId: post.id);

    if (!mounted) return;

    if (result == null) {
      // Roll back — never show the post as reshared if the backend failed
      setState(() {
        _resharedPosts[post.id] = previousReshared;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not reshare post. Please try again.')),
      );
      return;
    }

    setState(() {
      _resharedPosts[post.id] = result['isReshared'] as bool;
    });
  }

  void _sharePost(BuildContext context, Post post) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ShareScreen(
          postId: post.id,
          postText: post.text ?? '',
          postAuthor: post.authorUsername,
          postImageUrl: post.mediaUrl,
        ),
      ),
    );
  }

  bool _isPostOwner(Post post) {
    return _currentUserId.isNotEmpty && post.authorId == _currentUserId;
  }

  void _showPostOptions(BuildContext context, Post post) {
    final isOwner = _isPostOwner(post);

    showModalBottomSheet(
      context: context,
      backgroundColor: context.nexora.sheet,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
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
                if (isOwner)
                  ListTile(
                    leading: Icon(
                      Icons.delete_outline,
                      color: Color(0xFFE74C3C),
                      size: 22,
                    ),
                    title: Text(
                      'Delete post',
                      style: TextStyle(
                        color: Color(0xFFE74C3C),
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    onTap: () {
                      Navigator.pop(context);
                      _confirmDeletePost(context, post);
                    },
                  ),
                if (!isOwner) ...[
                  ListTile(
                    leading: Icon(
                      Icons.flag_outlined,
                      color: Color(0xFFF39C12),
                      size: 22,
                    ),
                    title: Text(
                      'Report post',
                      style: TextStyle(
                        color: context.nexora.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    onTap: () {
                      Navigator.pop(context);
                      _showReportDialog(context, post);
                    },
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  void _confirmDeletePost(BuildContext context, Post post) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: context.nexora.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
        ),
        title: Text(
          'Delete post',
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        content: Text(
          'Are you sure you want to delete this post? This action cannot be undone.',
          style: TextStyle(
            color: context.nexora.textSecondary,
            fontSize: 14,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancel',
              style: TextStyle(color: context.nexora.textMuted),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              await _deletePost(post);
            },
            child: Text(
              'Delete',
              style: TextStyle(
                color: Color(0xFFE74C3C),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _deletePost(Post post) async {
    final success = await _postService.deletePost(post.id);

    if (!mounted) return;

    if (success) {
      setState(() {
        posts.removeWhere((p) => p.id == post.id);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Post deleted')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not delete post. Please try again.'),
        ),
      );
    }
  }

  void _showReportDialog(BuildContext context, Post post) {
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
                      // Drag handle
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
                        'Report post',
                        style: TextStyle(
                          color: context.nexora.textPrimary,
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),

                      SizedBox(height: 4),

                      Text(
                        'Why are you reporting this post?',
                        style: TextStyle(color: context.nexora.textMuted, fontSize: 13),
                      ),

                      SizedBox(height: 16),

                      // Reason selection
                      ...reasons.map((r) => RadioListTile<String>(
                            value: r['value']!,
                            groupValue: selectedReason,
                            onChanged: (val) {
                              setModalState(() => selectedReason = val);
                            },
                            title: Text(
                              r['label']!,
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

                      // Optional description
                      TextField(
                        controller: descriptionController,
                        maxLines: 3,
                        maxLength: 1000,
                        style: TextStyle(
                          color: context.nexora.textPrimary,
                          fontSize: 14,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Additional details (optional)',
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

                      // Submit button
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

                                    final success =
                                        await _reportService.reportPost(
                                      postId: post.id,
                                      reason: selectedReason!,
                                      description:
                                          descriptionController.text.trim(),
                                    );

                                    if (!ctx.mounted) return;

                                    Navigator.pop(ctx);

                                    if (!mounted) return;

                                    if (success) {
                                      ScaffoldMessenger.of(context)
                                          .showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            'Report submitted. Thank you for keeping Nexora safe.',
                                          ),
                                        ),
                                      );
                                    } else {
                                      ScaffoldMessenger.of(context)
                                          .showSnackBar(
                                        SnackBar(
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
                                ? SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      color: context.nexora.textPrimary,
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Text(
                                    'Submit report',
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.background,

      appBar: AppBar(
        backgroundColor: context.nexora.background,
        elevation: 0,
        title: ShaderMask(
          shaderCallback: (bounds) {
            return LinearGradient(
              colors: nexoraGradient(),
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ).createShader(bounds);
          },
          child: Text(
            'N',
            style: TextStyle(
              color: context.nexora.textPrimary,
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
            icon: Icon(Icons.add),
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
            icon: Icon(Icons.notifications_none),
          ),
        ],
      ),

      body: widget.isEmpty ? _emptyHome() : _normalHome(),
    );
  }

  Widget _normalHome() {
    return RefreshIndicator(
      onRefresh: _loadPosts,
      backgroundColor: context.nexora.card,
      color: const Color(0xFF3157D5),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Welcome to Nexora 👋',
            style: TextStyle(
              color: context.nexora.textPrimary,
              fontSize: 26,
              fontWeight: FontWeight.bold,
            ),
          ),

          SizedBox(height: 8),

          Text(
            'Connect, share and discover.',
            style: TextStyle(color: context.nexora.textSecondary, fontSize: 15),
          ),

          SizedBox(height: 20),

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
                        MaterialPageRoute(
                          builder: (_) => MomentsScreen(
                            authorId: _currentUserId,
                            startMomentId: _myMoment?.id,
                          ),
                        ),
                      );
                    }
                  },
                ),
                for (final moment in _storyMoments)
                  _storyItem(
                    avatarUrl: moment.creatorAvatar,
                    label: moment.creatorUsername,
                    onTap: () {
                      // Open the viewer scoped to this user only — never
                      // everyone's moments mixed together.
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => MomentsScreen(
                            authorId: moment.creatorId,
                            startMomentId: moment.id,
                          ),
                        ),
                      );
                    },
                  ),
              ],
            ),
          ),

          SizedBox(height: 20),

          // Loading indicator
          if (_isLoadingPosts && posts.isEmpty)
            Center(
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
                    Icon(
                      Icons.article_outlined,
                      color: context.nexora.textDim,
                      size: 48,
                    ),
                    SizedBox(height: 16),
                    Text(
                      'No posts yet',
                      style: TextStyle(
                        color: context.nexora.textMuted,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Be the first to share something!',
                      style: TextStyle(color: context.nexora.textHint, fontSize: 13),
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
                        child: Text(
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
                gradient: LinearGradient(
                  colors: nexoraGradient(),
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
              child: Icon(
                Icons.people_alt_outlined,
                color: context.nexora.textPrimary,
                size: 42,
              ),
            ),

            SizedBox(height: 24),

            Text(
              'Your Nexora starts here',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.nexora.textPrimary,
                fontSize: 25,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),

            SizedBox(height: 10),

            Text(
              'Your feed is empty for now. Follow people and creators '
              'to start seeing posts, moments and conversations here.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.nexora.textMuted,
                fontSize: 13,
                height: 1.5,
              ),
            ),

            SizedBox(height: 28),

            SizedBox(
              width: double.infinity,
              height: 52,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  gradient: LinearGradient(
                    colors: nexoraGradient(),
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
                  child: Text(
                    'Find People',
                    style: TextStyle(
                      color: context.nexora.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),

            SizedBox(height: 12),

            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton(
                onPressed: widget.onExploreClips,
                style: OutlinedButton.styleFrom(
                  backgroundColor: context.nexora.card,
                  side: BorderSide(color: context.nexora.textPrimary.withOpacity(0.07)),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: Text(
                  'Explore Clips',
                  style: TextStyle(
                    color: context.nexora.textSecondary,
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

  Widget _storyItem({
    bool isFirst = false,
    String? avatarUrl,
    String? label,
    required VoidCallback onTap,
  }) {
    final hasMyMoment = isFirst && _myMoment != null;

    // Image shown inside the circle: own active moment → its media;
    // otherwise the profile picture ("You" or the other creator) when one
    // is set; otherwise a default person icon.
    String? imageUrl;
    if (hasMyMoment) {
      imageUrl = _myMoment!.mediaUrl;
    } else if (isFirst) {
      imageUrl = _myAvatarUrl.isNotEmpty ? _myAvatarUrl : null;
    } else if (avatarUrl != null && avatarUrl.isNotEmpty) {
      imageUrl = avatarUrl;
    }

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
                  child: imageUrl != null
                      ? ClipOval(
                          child: _storyImage(imageUrl),
                        )
                      : _storyPlaceholderAvatar(),
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
                          gradient: LinearGradient(
                            colors: nexoraGradient(),
                          ),
                          border: Border.all(
                            color: context.nexora.background,
                            width: 2,
                          ),
                        ),
                        child: Icon(
                          Icons.add,
                          color: context.nexora.textPrimary,
                          size: 13,
                        ),
                      ),
                    ),
                  ),
              ],
            ),

            SizedBox(height: 4),

            if (isFirst)
              Text(
                'You',
                style: TextStyle(fontSize: 11, color: context.nexora.textPrimary),
              )
            else if (label != null && label.isNotEmpty)
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 10,
                  color: context.nexora.textSecondary,
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// Default avatar used while no picture/moment exists (and as the
  /// fallback when an image fails to load).
  Widget _storyPlaceholderAvatar() {
    return CircleAvatar(
      backgroundColor: Color(0xFFE5E5E5),
      child: Icon(Icons.person, color: context.nexora.textPrimary),
    );
  }

  /// Render a story media URL: network images for http(s) URLs (what the
  /// backend returns), local files otherwise.
  Widget _storyImage(String url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _storyPlaceholderAvatar(),
      );
    }
    return Image.file(
      File(url),
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => _storyPlaceholderAvatar(),
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
        color: context.nexora.card,
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
                      ? Icon(Icons.person, color: context.nexora.textPrimary)
                      : null,
                ),

                SizedBox(width: 12),

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
                            style: TextStyle(
                              color: context.nexora.textPrimary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),

                      if (isVerified) ...[
                        SizedBox(width: 4),
                        Icon(
                          Icons.verified,
                          color: Color(0xFF6C8CFF),
                          size: 16,
                        ),
                      ],

                      SizedBox(width: 12),

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
                  onPressed: () => _showPostOptions(context, post),
                  icon: Icon(Icons.more_vert, color: context.nexora.textSecondary),
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
              color: context.nexora.placeholder,
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
                              errorBuilder: (_, __, ___) => Icon(
                                Icons.videocam_outlined,
                                color: context.nexora.textHint,
                                size: 55,
                              ),
                            )
                          : Icon(
                              Icons.videocam_outlined,
                              color: context.nexora.textHint,
                              size: 55,
                            ),
                    )
                  else
                    Icon(
                      Icons.videocam_outlined,
                      color: context.nexora.textHint,
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
              color: context.nexora.placeholder,
              child: Center(
                child: Icon(
                  Icons.headphones_outlined,
                  color: context.nexora.textHint,
                  size: 55,
                ),
              ),
            ),

          // Link preview
          if (post.contentType == 'link' && post.linkUrl != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              color: context.nexora.placeholder,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (post.linkTitle != null)
                    Text(
                      post.linkTitle!,
                      style: TextStyle(
                        color: context.nexora.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  SizedBox(height: 4),
                  Text(
                    post.linkUrl!,
                    style: TextStyle(
                      color: Color(0xFF7D8CFF),
                      fontSize: 12,
                    ),
                  ),
                  if (post.linkDescription != null) ...[
                    SizedBox(height: 4),
                    Text(
                      post.linkDescription!,
                      style: TextStyle(
                        color: context.nexora.textMuted,
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
                    color: context.nexora.textPrimary,
                  ),
                ),

                IconButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => CommentsScreen(
                          username: username,
                          contentId: post.id,
                        ),
                      ),
                    );
                  },
                  icon: Icon(
                    Icons.chat_bubble_outline,
                    color: context.nexora.textPrimary,
                  ),
                ),

                IconButton(
                  onPressed: () => _togglePostReshare(post),
                  icon: Icon(
                    Icons.repeat,
                    color: (_resharedPosts[post.id] ?? false)
                        ? const Color(0xFF6C8CFF)
                        : context.nexora.textPrimary,
                  ),
                ),

                IconButton(
                  onPressed: () => _sharePost(context, post),
                  icon: Icon(Icons.send_outlined, color: context.nexora.textPrimary),
                ),

                const Spacer(),

                IconButton(
                  onPressed: () => _togglePostSave(post),
                  icon: Icon(
                    (_savedPosts[post.id] ?? false)
                        ? Icons.bookmark
                        : Icons.bookmark_border,
                    color: context.nexora.textPrimary,
                  ),
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
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),

                SizedBox(height: 8),

                Text(
                  '$username  $text',
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 14,
                    height: 1.4,
                  ),
                ),

                // Tags
                if (tags != null && tags.isNotEmpty) ...[
                  SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: tags.map((tag) => Text(
                      '#$tag',
                      style: TextStyle(color: Color(0xFF7D8CFF), fontSize: 13),
                    )).toList(),
                  ),
                ],

                // Hashtags
                if (hashtags != null && hashtags.isNotEmpty) ...[
                  SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: hashtags.map((tag) => Text(
                      '#$tag',
                      style: TextStyle(color: Color(0xFF7D8CFF), fontSize: 13),
                    )).toList(),
                  ),
                ],

                if ((tags == null || tags.isEmpty) && (hashtags == null || hashtags.isEmpty))
                  Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Text(
                      '#Nexora #Community',
                      style: TextStyle(color: Color(0xFF7D8CFF), fontSize: 13),
                    ),
                  ),

                SizedBox(height: 10),

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

                SizedBox(height: 8),

                GestureDetector(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => CommentsScreen(
                          username: username,
                          contentId: post.id,
                        ),
                      ),
                    );
                  },
                  child: Text(
                    'View all comments',
                    style: TextStyle(color: context.nexora.textMuted, fontSize: 13),
                  ),
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
            SizedBox(width: 7),
            // Label name — always visible, never color-only
            Text(
              label.name,
              style: TextStyle(
                color: label.color,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(width: 8),
            // Trust score number
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
              decoration: BoxDecoration(
                color: context.nexora.textPrimary.withOpacity(0.07),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '$trustScore/100',
                style: TextStyle(
                  color: context.nexora.textSecondary,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            SizedBox(width: 8),
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
        return context.nexora.textMuted;
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
      backgroundColor: context.nexora.sheet,
      shape: RoundedRectangleBorder(
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
                        color: context.nexora.textPrimary.withOpacity(0.55),
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
                  SizedBox(width: 14),
                  // Label name — always visible alongside color
                  Expanded(
                    child: Text(
                      label.name,
                      style: TextStyle(
                        color: context.nexora.textPrimary,
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

              SizedBox(height: 18),

              // ── Explanation ──────────────────────────
              Text(
                'Why this label?',
                style: TextStyle(
                  color: context.nexora.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              SizedBox(height: 6),
              Text(
                label.explanation,
                style: TextStyle(
                  color: context.nexora.textSecondary,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),

              SizedBox(height: 16),

              // ── Verification status ──────────────────
              Text(
                'Verification status',
                style: TextStyle(
                  color: context.nexora.textMuted,
                  fontSize: 12,
                ),
              ),
              SizedBox(height: 4),
              _buildStatusRow(
                _verificationStatusText(verificationStatus, moderationStatus),
                _verificationStatusColor(verificationStatus, moderationStatus),
              ),

              SizedBox(height: 16),

              // ── Content type ─────────────────────────
              Text(
                'Content type',
                style: TextStyle(
                  color: context.nexora.textMuted,
                  fontSize: 12,
                ),
              ),
              SizedBox(height: 4),
              Text(
                post.contentType,
                style: TextStyle(
                  color: context.nexora.textPrimary,
                  fontSize: 13,
                ),
              ),

              // ── Component scores (if available) ──────
              if (post.trustAuthenticity != null) ...[
                SizedBox(height: 16),
                Text(
                  'Score breakdown',
                  style: TextStyle(
                    color: context.nexora.textMuted,
                    fontSize: 12,
                  ),
                ),
                SizedBox(height: 6),
                _buildComponentBar('Authenticity', post.trustAuthenticity!),
                SizedBox(height: 4),
                _buildComponentBar('Factual Verification', post.trustFactualVerification!),
                SizedBox(height: 4),
                _buildComponentBar('Source Credibility', post.trustSourceCredibility!),
                SizedBox(height: 4),
                _buildComponentBar('Model Confidence', post.trustModelConfidence!),
              ],

              SizedBox(height: 16),

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
                  child: Row(
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
                SizedBox(height: 16),
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
                        color: context.nexora.textPrimary.withOpacity(0.15),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      'Request Moderator Review',
                      style: TextStyle(
                        color: context.nexora.textSecondary,
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
        SizedBox(width: 6),
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
            style: TextStyle(color: context.nexora.textSecondary, fontSize: 11),
          ),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: value,
              backgroundColor: context.nexora.textPrimary.withOpacity(0.08),
              valueColor: AlwaysStoppedAnimation<Color>(barColor),
              minHeight: 5,
            ),
          ),
        ),
        SizedBox(width: 8),
        Text(
          '$percent%',
          style: TextStyle(
            color: context.nexora.textSecondary,
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
          color: context.nexora.placeholder,
          child: Center(
            child: Icon(
              Icons.image_outlined,
              color: context.nexora.textHint,
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
        color: context.nexora.placeholder,
        child: Center(
          child: Icon(
            Icons.image_outlined,
            color: context.nexora.textHint,
            size: 55,
          ),
        ),
      ),
    );
  }
}
