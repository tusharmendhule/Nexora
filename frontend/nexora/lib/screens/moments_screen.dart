import 'dart:io';

import 'package:flutter/material.dart';

import 'userprofile.dart';
import '../models/moment.dart';
import '../services/moment_service.dart';
import '../services/like_service.dart';

class MomentsScreen extends StatefulWidget {
  final int initialIndex;

  const MomentsScreen({super.key, this.initialIndex = 0});

  @override
  State<MomentsScreen> createState() => _MomentsScreenState();
}

class _MomentsScreenState extends State<MomentsScreen> {
  final MomentService _momentService = MomentService();
  final LikeService _likeService = LikeService();

  static const String currentUserId = 'user_you';

  final Map<String, bool> _likedMoments = {};
  final Map<String, int> _momentLikeCounts = {};

  late final PageController _pageController;

  List<Moment> moments = [];
  late int currentMoment;

  final List<String> times = const ['Now', '12m', '28m', '41m', '1h'];

  final List<String> captions = const [
    'Your latest Moment. ✨',
    'A little moment worth remembering. ✨',
    'Just enjoying the moment. 💜',
    'Late nights. Big ideas. 🚀',
    'Find beauty in the ordinary. 🌿',
  ];

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

  Future<void> _toggleLike(Moment moment) async {
    final currentlyLiked = await _likeService.isLiked(
      userId: currentUserId,
      contentId: moment.id,
      contentType: 'moment',
    );

    if (currentlyLiked) {
      await _likeService.unlike(
        userId: currentUserId,
        contentId: moment.id,
        contentType: 'moment',
      );
    } else {
      await _likeService.like(
        userId: currentUserId,
        contentId: moment.id,
        contentType: 'moment',
      );
    }

    if (!mounted) return;

    setState(() {
      final newLikedState = !currentlyLiked;
      _likedMoments[moment.id] = newLikedState;

      final currentCount = _momentLikeCounts[moment.id] ?? 0;

      _momentLikeCounts[moment.id] = newLikedState
          ? currentCount + 1
          : (currentCount > 0 ? currentCount - 1 : 0);
    });
  }

  void _openProfile(String username) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => UserProfileScreen(username: username)),
    );
  }

  @override
  Widget build(BuildContext context) {
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
          if (moment.mediaType == 'image' &&
              !moment.mediaUrl.startsWith('demo://'))
            Positioned.fill(
              child: Image.file(File(moment.mediaUrl), fit: BoxFit.cover),
            ),
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
              time: index < times.length ? times[index] : '',
              caption: index < captions.length ? captions[index] : '',
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
                margin: const EdgeInsets.symmetric(horizontal: 2),
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
