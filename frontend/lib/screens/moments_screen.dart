import 'dart:io';

import 'package:flutter/material.dart';

import 'user_profile_screen.dart';
import '../models/moment.dart';
import '../services/moment_service.dart';
import '../services/like_service.dart';
import '../services/user_service.dart';

class MomentsScreen extends StatefulWidget {
  final int initialIndex;

  const MomentsScreen({super.key, this.initialIndex = 0});

  @override
  State<MomentsScreen> createState() => _MomentsScreenState();
}

class _MomentsScreenState extends State<MomentsScreen> {
  final MomentService _momentService = MomentService();
  final LikeService _likeService = LikeService();
  final UserService _userService = UserService();

  String _currentUserId = '';
  bool _isLoadingUser = true;

  final Map<String, bool> _likedMoments = {};
  final Map<String, int> _momentLikeCounts = {};

  late final PageController _pageController;

  List<Moment> moments = [];
  late int currentMoment;

  final List<List<Color>> gradients = const [
    [Color(0xFF3157D5), Color(0xFF7C3AED)],
    [Color(0xFF3157D5), Color(0xFF7C3AED)],
    [Color(0xFFEC4899), Color(0xFF7C3AED)],
    [Color(0xFF0891B2), Color(0xFF3157D5)],
    [Color(0xFF16A34A), Color(0xFFEAB308)],
  ];

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    // Load current user ID
    final userId = await _userService.getCurrentUserId();
    if (mounted) {
      setState(() {
        _currentUserId = userId ?? '';
        _isLoadingUser = false;
      });
    }
    _loadMoments();
  }

  Future<void> _loadMoments() async {
    final loadedMoments = await _momentService.fetchMoments();

    if (!mounted) return;

    final safeIndex = loadedMoments.isEmpty
        ? 0
        : widget.initialIndex.clamp(0, loadedMoments.length - 1);

    _pageController = PageController(initialPage: safeIndex);

    setState(() {
      moments = loadedMoments;
      currentMoment = safeIndex;
    });
  }

  @override
  void dispose() {
    if (moments.isNotEmpty) {
      _pageController.dispose();
    }

    super.dispose();
  }

  String _timeAgo(DateTime date) {
    final diff = DateTime.now().difference(date);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return '${(diff.inDays / 7).floor()}w';
  }

  Future<void> _toggleLike(Moment moment) async {
    final result = await _likeService.toggleLike(postId: moment.id);

    if (!mounted) return;

    final isLiked = result['isLiked'] as bool? ?? false;
    final likesCount = result['likesCount'] as int? ?? 0;

    setState(() {
      _likedMoments[moment.id] = isLiked;
      _momentLikeCounts[moment.id] = likesCount;
    });
  }

  void _openProfile(String username) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => UserProfileScreen(username: username)),
    );
  }

  bool _isNetworkUrl(String url) {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoadingUser) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator(color: Colors.white)),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: moments.isEmpty
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : Stack(
              children: [
                PageView.builder(
                  controller: _pageController,
                  scrollDirection: Axis.horizontal,
                  itemCount: moments.length,
                  onPageChanged: (index) async {
                    setState(() {
                      currentMoment = index;
                    });

                    await _momentService.markAsViewed(moments[index].id);
                  },
                  itemBuilder: (context, index) {
                    return _momentPage(index);
                  },
                ),
                _progressIndicator(),
                _topOverlay(),
              ],
            ),
    );
  }

  Widget _momentPage(int index) {
    final moment = moments[index];
    final List<Color> gradient = gradients[index % gradients.length];

    final String creator = moment.creatorUsername;
    final String caption = 'Moment by @$creator';
    final String time = _timeAgo(moment.createdAt);

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Stack(
        children: [
          // Network image
          if (moment.mediaType == 'image' && _isNetworkUrl(moment.mediaUrl))
            Positioned.fill(
              child: Image.network(
                moment.mediaUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),

          // Local file image (fallback)
          if (moment.mediaType == 'image' && !_isNetworkUrl(moment.mediaUrl))
            Positioned.fill(
              child: Image.file(File(moment.mediaUrl), fit: BoxFit.cover),
            ),

          // Network video
          if (moment.mediaType == 'video' && _isNetworkUrl(moment.mediaUrl))
            Positioned.fill(
              child: Center(
                child: Icon(
                  Icons.play_circle_outline,
                  color: Colors.white.withOpacity(0.7),
                  size: 64,
                ),
              ),
            ),

          // Gradient overlay
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.black.withOpacity(0.04),
                    Colors.black.withOpacity(0.12),
                    Colors.black.withOpacity(0.75),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),

          Positioned(
            left: 20,
            right: 20,
            bottom: 30,
            child: _momentInformation(
              creator: creator,
              time: time,
              caption: caption,
            ),
          ),
        ],
      ),
    );
  }

  Widget _momentInformation({
    required String creator,
    required String time,
    required String caption,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: () => _openProfile(creator),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.18),
                  border: Border.all(color: Colors.white.withOpacity(0.4)),
                ),
                child: const Icon(Icons.person, color: Colors.white, size: 23),
              ),

              const SizedBox(width: 10),

              Text(
                '@$creator',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),

              const SizedBox(width: 8),

              Text(
                '· $time',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
        ),

        const SizedBox(height: 14),

        Text(
          caption,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 17,
            height: 1.35,
            fontWeight: FontWeight.w600,
          ),
        ),

        const SizedBox(height: 16),

        Row(
          children: [
            GestureDetector(
              onTap: () => _toggleLike(moments[currentMoment]),
              child: Row(
                children: [
                  Icon(
                    _likedMoments[moments[currentMoment].id] == true
                        ? Icons.favorite
                        : Icons.favorite_border,
                    color: Colors.white,
                    size: 22,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '${_momentLikeCounts[moments[currentMoment].id] ?? 0}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: 16),

        Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.22),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: Colors.white.withOpacity(0.18)),
          ),
          child: const Row(
            children: [
              Expanded(
                child: Text(
                  'Reply to this Moment...',
                  style: TextStyle(color: Colors.white60, fontSize: 12),
                ),
              ),
              Icon(Icons.send_outlined, color: Colors.white70, size: 19),
            ],
          ),
        ),
      ],
    );
  }

  Widget _topOverlay() {
    return Positioned(
      top: 16,
      left: 12,
      right: 12,
      child: SafeArea(
        child: Row(
          children: [
            IconButton(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.close, color: Colors.white, size: 25),
            ),

            const SizedBox(width: 4),

            const Text(
              'Moments',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _progressIndicator() {
    return Positioned(
      top: 10,
      left: 12,
      right: 12,
      child: SafeArea(
        child: Row(
          children: List.generate(moments.length, (index) {
            final selected = index == currentMoment;

            return Expanded(
              child: Container(
                height: 3,
                margin: const.symmetric(horizontal: 2),
                decoration: BoxDecoration(
                  color: selected
                      ? Colors.white
                      : Colors.white.withOpacity(0.28),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}
