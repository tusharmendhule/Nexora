import 'dart:io';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import 'comments_screen.dart';
import 'share_screen.dart';
import 'userprofile.dart';
import '../models/clip.dart';
import '../services/clip_service.dart';
import '../services/like_service.dart';

class ClipsScreen extends StatefulWidget {
  const ClipsScreen({super.key});

  @override
  State<ClipsScreen> createState() => _ClipsScreenState();
}

class _ClipsScreenState extends State<ClipsScreen> {
  final ClipService _clipService = ClipService();
  final LikeService _likeService = LikeService();
  final PageController _pageController = PageController();

  static const String currentUserId = 'user_you';

  final Map<String, bool> _likedClips = {};
  final Map<String, int> _clipLikeCounts = {};

  List<Clip> clips = [];
  int currentClip = 0;
  bool isLoading = true;

  final List<List<Color>> gradients = const [
    [Color(0xFF3157D5), Color(0xFF7C3AED)],
    [Color(0xFFEC4899), Color(0xFF7C3AED)],
    [Color(0xFF0891B2), Color(0xFF3157D5)],
    [Color(0xFF16A34A), Color(0xFFEAB308)],
  ];

  @override
  void initState() {
    super.initState();
    _loadClips();
  }

  Future<void> _loadClips() async {
    final loadedClips = await _clipService.fetchClips();

    if (!mounted) return;

    setState(() {
      clips = loadedClips;
      isLoading = false;
    });
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _toggleLike(Clip clip) async {
    final currentlyLiked = await _likeService.isLiked(
      userId: currentUserId,
      contentId: clip.id,
      contentType: 'clip',
    );

    if (currentlyLiked) {
      await _likeService.unlike(
        userId: currentUserId,
        contentId: clip.id,
        contentType: 'clip',
      );
    } else {
      await _likeService.like(
        userId: currentUserId,
        contentId: clip.id,
        contentType: 'clip',
      );
    }

    if (!mounted) return;

    setState(() {
      final newLikedState = !currentlyLiked;
      _likedClips[clip.id] = newLikedState;

      final currentCount = _clipLikeCounts[clip.id] ?? clip.likeCount;

      _clipLikeCounts[clip.id] = newLikedState
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
      body: isLoading
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : clips.isEmpty
          ? const Center(
              child: Text(
                'No clips available.',
                style: TextStyle(color: Colors.white70, fontSize: 14),
              ),
            )
          : Stack(
              children: [
                PageView.builder(
                  controller: _pageController,
                  scrollDirection: Axis.vertical,
                  itemCount: clips.length,
                  onPageChanged: (index) {
                    setState(() {
                      currentClip = index;
                    });
                  },
                  itemBuilder: (context, index) {
                    return _clipPage(index);
                  },
                ),
                _topOverlay(),
                _pageIndicator(),
              ],
            ),
    );
  }

  Widget _clipMedia(Clip clip, List<Color> gradient) {
    if (clip.videoUrl.startsWith('demo://')) {
      return Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: gradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
      );
    }

    return _VideoPlayerWidget(videoUrl: clip.videoUrl);
  }

  Widget _clipPage(int index) {
    final clip = clips[index];
    final gradient = gradients[index % gradients.length];

    return Container(
      color: Colors.black,
      child: Stack(
        children: [
          Positioned.fill(child: _clipMedia(clip, gradient)),
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.black.withOpacity(0.05),
                    Colors.black.withOpacity(0.15),
                    Colors.black.withOpacity(0.72),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),

          Positioned(
            left: 18,
            right: 80,
            bottom: 30,
            child: _clipInformation(
              creator: clip.creatorUsername,
              caption: clip.caption,
              music: clip.music ?? 'Original audio',
              label: clip.label.name,
              labelColor: clip.label.color,
            ),
          ),

          Positioned(right: 14, bottom: 32, child: _actionColumn()),
        ],
      ),
    );
  }

  Widget _clipInformation({
    required String creator,
    required String caption,
    required String music,
    required String label,
    required Color labelColor,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            GestureDetector(
              onTap: () => _openProfile(creator),
              child: Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.18),
                  border: Border.all(color: Colors.white.withOpacity(0.35)),
                ),
                child: const Icon(Icons.person, color: Colors.white, size: 22),
              ),
            ),

            const SizedBox(width: 10),

            Flexible(
              child: GestureDetector(
                onTap: () => _openProfile(creator),
                child: Text(
                  '@$creator',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),

            const SizedBox(width: 8),

            GestureDetector(
              onTap: () => _showLabelDetails(label, labelColor),
              child: Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: labelColor,
                  border: Border.all(
                    color: Colors.white.withOpacity(0.55),
                    width: 1.2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: labelColor.withOpacity(0.5),
                      blurRadius: 7,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.auto_awesome,
                  size: 9,
                  color: Colors.white,
                ),
              ),
            ),

            const SizedBox(width: 8),

            Container(
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.15),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withOpacity(0.18)),
              ),
              child: const Text(
                'Follow',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),

        const SizedBox(height: 14),

        Text(
          caption,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            height: 1.35,
            fontWeight: FontWeight.w600,
          ),
        ),

        const SizedBox(height: 12),

        Row(
          children: [
            const Icon(Icons.music_note, color: Colors.white70, size: 15),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                music,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white70, fontSize: 11),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _showLabelDetails(String label, Color labelColor) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF11162B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 30),
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
              _labelWhy(label),
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 13,
                height: 1.4,
              ),
            ),

            const SizedBox(height: 16),

            const Text(
              'Content type',
              style: TextStyle(color: Colors.white54, fontSize: 12),
            ),

            const SizedBox(height: 4),

            const Text(
              '🎥 Video',
              style: TextStyle(color: Colors.white, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  String _labelWhy(String label) {
    for (final clip in clips) {
      if (clip.label.name == label) {
        return clip.label.explanation;
      }
    }

    return 'Nexora has classified this content.';
  }

  Widget _actionColumn() {
    final clip = clips[currentClip];

    return Column(
      children: [
        _clipAction(
          _likedClips[clip.id] == true ? Icons.favorite : Icons.favorite_border,
          '${_clipLikeCounts[clip.id] ?? clip.likeCount}',
          onTap: () => _toggleLike(clip),
        ),

        const SizedBox(height: 20),

        _clipAction(
          Icons.chat_bubble_outline,
          '84',
          onTap: () {
            final creator = clips[currentClip].creatorUsername;

            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => CommentsScreen(username: creator),
              ),
            );
          },
        ),

        const SizedBox(height: 20),

        _clipAction(Icons.repeat, '126'),

        const SizedBox(height: 20),

        _clipAction(
          Icons.send_outlined,
          'Share',
          onTap: () {
            final creator = clips[currentClip].creatorUsername;

            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => ShareScreen(username: creator)),
            );
          },
        ),

        const SizedBox(height: 20),

        _clipAction(Icons.bookmark_border, 'Save'),
      ],
    );
  }

  Widget _clipAction(IconData icon, String label, {VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap ?? () {},
      child: Column(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.20),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withOpacity(0.15)),
            ),
            child: Icon(icon, color: Colors.white, size: 23),
          ),

          const SizedBox(height: 5),

          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _topOverlay() {
    return Positioned(
      top: 18,
      left: 18,
      right: 18,
      child: SafeArea(
        child: Row(
          children: [
            const Text(
              'Clips',
              style: TextStyle(
                color: Colors.white,
                fontSize: 23,
                fontWeight: FontWeight.w800,
              ),
            ),

            const Spacer(),

            IconButton(
              onPressed: () {},
              icon: const Icon(
                Icons.camera_alt_outlined,
                color: Colors.white,
                size: 24,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _pageIndicator() {
    return Positioned(
      right: 5,
      top: 0,
      bottom: 0,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(clips.length, (index) {
            final selected = currentClip == index;

            return AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.symmetric(vertical: 3),
              width: selected ? 5 : 3,
              height: selected ? 22 : 8,
              decoration: BoxDecoration(
                color: selected ? Colors.white : Colors.white.withOpacity(0.35),
                borderRadius: BorderRadius.circular(5),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _VideoPlayerWidget extends StatefulWidget {
  final String videoUrl;

  const _VideoPlayerWidget({required this.videoUrl});

  @override
  State<_VideoPlayerWidget> createState() => _VideoPlayerWidgetState();
}

class _VideoPlayerWidgetState extends State<_VideoPlayerWidget> {
  late final VideoPlayerController _controller;

  @override
  void initState() {
    super.initState();

    _controller = VideoPlayerController.file(File(widget.videoUrl))
      ..initialize().then((_) {
        if (!mounted) return;

        setState(() {});
        _controller
          ..setLooping(true)
          ..play();
      });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_controller.value.isInitialized) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }

    return SizedBox.expand(
      child: FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: _controller.value.size.width,
          height: _controller.value.size.height,
          child: VideoPlayer(_controller),
        ),
      ),
    );
  }
}
