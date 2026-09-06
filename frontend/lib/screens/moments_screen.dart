import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../l10n/translations.dart';
import '../utils/media_url.dart';
import 'user_profile_screen.dart';
import '../models/moment.dart';
import '../services/moment_service.dart';
import '../services/user_service.dart';

class MomentsScreen extends StatefulWidget {
  final int initialIndex;

  /// When set, only this user's moments are shown (profile Memories tab).
  final String? authorId;

  /// When set, the viewer starts on the moment with this id (if present) —
  /// used when opening from a "replied to your moment" notification.
  final String? startMomentId;

  const MomentsScreen({
    super.key,
    this.initialIndex = 0,
    this.authorId,
    this.startMomentId,
  });

  @override
  State<MomentsScreen> createState() => _MomentsScreenState();
}

class _MomentsScreenState extends State<MomentsScreen>
    with SingleTickerProviderStateMixin {
  final MomentService _momentService = MomentService();
  final UserService _userService = UserService();

  String _currentUserId = '';
  bool _isLoadingUser = true;

  /// How long a segment stays on screen before auto-advancing.
  static const Duration _imageDuration = Duration(seconds: 10);
  static const Duration _videoMaxDuration = Duration(seconds: 30);

  final Map<String, bool> _likedMoments = {};
  final Map<String, int> _momentLikeCounts = {};

  late final PageController _pageController;

  List<Moment> moments = [];
  late int currentMoment;

  /// Drives the auto-advance timer and the top progress bar fill.
  AnimationController? _segmentController;

  /// Active video player (video moments), or null for images.
  VideoPlayerController? _videoController;

  /// Guards against overlapping segment setups (rapid taps / swipes).
  bool _segmentBusy = false;

  /// Likes being toggled right now (prevents double-taps double counting).
  final Set<String> _likeInFlight = {};

  /// Reply composer state.
  final TextEditingController _replyController = TextEditingController();
  final FocusNode _replyFocus = FocusNode();
  bool _sendingReply = false;

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
    // Pause the auto-advance timer/video while the user is typing a reply.
    _replyFocus.addListener(_onReplyFocusChanged);
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
    var loadedMoments =
        await _momentService.fetchMoments(authorId: widget.authorId);

    // Defensive: when a specific author was requested, only keep their
    // moments even if the server ignores the filter.
    if (widget.authorId != null && widget.authorId!.isNotEmpty) {
      loadedMoments = loadedMoments
          .where((m) => m.creatorId == widget.authorId)
          .toList();
    }

    // Clips never belong in the moments viewer.
    loadedMoments = loadedMoments
        .where((m) => m.storyType != 'clip')
        .toList();

    if (!mounted) return;

    // Seed like state from the backend so counts/likes are correct on open.
    _likedMoments.clear();
    _momentLikeCounts.clear();
    for (final m in loadedMoments) {
      _likedMoments[m.id] = m.isLiked;
      _momentLikeCounts[m.id] = m.likeCount;
    }

    // If a specific moment was requested (e.g. from a reply notification),
    // start there instead of the generic index.
    var startIndex = widget.initialIndex;
    if (widget.startMomentId != null && widget.startMomentId!.isNotEmpty) {
      final match = loadedMoments.indexWhere(
        (m) => m.id == widget.startMomentId,
      );
      if (match != -1) startIndex = match;
    }

    final safeIndex = loadedMoments.isEmpty
        ? 0
        : startIndex.clamp(0, loadedMoments.length - 1);

    _pageController = PageController(initialPage: safeIndex);

    setState(() {
      moments = loadedMoments;
      currentMoment = safeIndex;
    });

    // Start auto-advance for the first segment (onPageChanged isn't fired
    // for the initial page).
    if (loadedMoments.isNotEmpty) {
      await _startSegment(safeIndex);
    }
  }

  @override
  void dispose() {
    _replyFocus.removeListener(_onReplyFocusChanged);
    _replyFocus.dispose();
    _replyController.dispose();
    _segmentController?.dispose();
    _videoController?.dispose();
    if (moments.isNotEmpty) {
      _pageController.dispose();
    }

    super.dispose();
  }

  // ─── Segment / auto-advance logic ────────────────────

  /// Prepare and start the segment at [index]: tears down the previous
  /// segment, wires up the correct duration (10s image / up to 30s video)
  /// and starts the timer + video playback.
  Future<void> _startSegment(int index) async {
    if (moments.isEmpty || index < 0 || index >= moments.length) return;
    if (_segmentBusy) return;
    _segmentBusy = true;

    try {
      // Dispose the previous video player (if any).
      final oldVideo = _videoController;
      _videoController = null;
      if (oldVideo != null) {
        try {
          await oldVideo.dispose();
        } catch (_) {}
      }

      // Dispose the previous timer controller.
      final oldSegment = _segmentController;
      _segmentController = null;
      if (oldSegment != null) {
        try {
          oldSegment.dispose();
        } catch (_) {}
      }

      if (!mounted) return;

      final moment = moments[index];

      // Reset the reply box between moments (unless the user is typing).
      if (!_replyFocus.hasFocus) {
        _replyController.clear();
      }

      setState(() => currentMoment = index);

      // Non-critical: record that the viewer saw this moment.
      unawaited(
        _momentService.markAsViewed(moment.id).catchError((_) {}),
      );

      // Decide the segment length and start video playback when applicable.
      Duration duration;
      if (moment.mediaType == 'video' && _isNetworkUrl(moment.mediaUrl)) {
        duration = _videoMaxDuration;
        try {
          final vc = VideoPlayerController.networkUrl(
            Uri.parse(mediaPlaybackUrl(moment.mediaUrl)),
          );
          _videoController = vc;
          await vc.initialize();

          // The user navigated away while the video was loading.
          if (!mounted || _videoController != vc) {
            try {
              await vc.dispose();
            } catch (_) {}
            return;
          }

          // Short videos advance when they finish; long ones cap at 30s.
          final videoDuration = vc.value.duration;
          if (videoDuration > Duration.zero &&
              videoDuration < _videoMaxDuration) {
            duration = videoDuration;
          }

          await vc.setLooping(false);
          await vc.setVolume(0); // muted autoplay (allowed on web)
          await vc.play();
        } catch (_) {
          // Video failed to load — still advance on the 30s timer.
          final failed = _videoController;
          _videoController = null;
          try {
            await failed?.dispose();
          } catch (_) {}
        }
      } else {
        duration = _imageDuration;
      }

      if (!mounted) return;

      final seg = AnimationController(
        vsync: this,
        duration: duration,
      );
      _segmentController = seg;
      seg.addListener(_onSegmentTick);
      seg.addStatusListener(_onSegmentStatus);
      await seg.forward(from: 0);
    } finally {
      _segmentBusy = false;
    }
  }

  void _onSegmentTick() {
    if (mounted) setState(() {});
  }

  void _onSegmentStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed) return;
    // Segment finished → go to the next moment (or close at the end).
    _goToSegment(currentMoment + 1);
  }

  /// Navigate to [target]. Negative targets replay the current segment;
  /// targets past the end close the viewer (Instagram behaviour).
  void _goToSegment(int target) {
    if (moments.isEmpty) return;
    if (target < 0) {
      _startSegment(currentMoment);
      return;
    }
    if (target >= moments.length) {
      Navigator.of(context).pop();
      return;
    }
    if (target == currentMoment) return;

    _pageController.animateToPage(
      target,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  }

  String _timeAgo(DateTime date) {
    final diff = DateTime.now().difference(date);
    if (diff.inMinutes < 1) return tr(context, 'just now');
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return '${(diff.inDays / 7).floor()}w';
  }

  Future<void> _toggleLike(Moment moment) async {
    if (_likeInFlight.contains(moment.id)) return;
    _likeInFlight.add(moment.id);

    final wasLiked = _likedMoments[moment.id] ?? moment.isLiked;
    final wasCount = _momentLikeCounts[moment.id] ?? moment.likeCount;
    var optimisticCount = wasCount + (wasLiked ? -1 : 1);
    if (optimisticCount < 0) optimisticCount = 0;

    // Optimistic update for a snappy UI.
    setState(() {
      _likedMoments[moment.id] = !wasLiked;
      _momentLikeCounts[moment.id] = optimisticCount;
    });

    final result = await _momentService.toggleLike(moment.id);
    _likeInFlight.remove(moment.id);

    if (!mounted) return;

    if (result['error'] == true) {
      // Roll back on failure.
      setState(() {
        _likedMoments[moment.id] = wasLiked;
        _momentLikeCounts[moment.id] = wasCount;
      });
      _showSnack(tr(context, 'Could not update like. Please try again.'),
          isError: true);
      return;
    }

    setState(() {
      _likedMoments[moment.id] = result['isLiked'] as bool? ?? !wasLiked;
      _momentLikeCounts[moment.id] =
          (result['likesCount'] as int?) ?? optimisticCount;
    });
  }

  /// Pause the segment timer + video while typing a reply, resume on close.
  void _onReplyFocusChanged() {
    if (!mounted) return;
    if (_replyFocus.hasFocus) {
      _segmentController?.stop(canceled: false);
      _videoController?.pause();
    } else {
      final segment = _segmentController;
      if (segment != null && !segment.isAnimating) {
        segment.forward();
      }
      _videoController?.play();
    }
  }

  Future<void> _sendReply() async {
    final text = _replyController.text.trim();
    if (text.isEmpty || _sendingReply || moments.isEmpty) return;

    final moment = moments[currentMoment];
    setState(() => _sendingReply = true);

    final sent = await _momentService.replyToMoment(moment.id, text);
    if (!mounted) return;

    setState(() => _sendingReply = false);
    if (sent) {
      _replyController.clear();
      _replyFocus.unfocus();
      _showSnack(tr(context, 'Reply sent'));
    } else {
      _showSnack(tr(context, 'Could not send reply. Please try again.'),
          isError: true);
    }
  }

  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.redAccent : null,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
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
                  onPageChanged: (index) {
                    _startSegment(index);
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
    final String caption = trP(context, 'Moment by @{0}', [creator]);
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

          // Network video — plays muted, auto-advancing like Instagram
          if (moment.mediaType == 'video' && _isNetworkUrl(moment.mediaUrl))
            Positioned.fill(
              child: index == currentMoment &&
                      _videoController != null &&
                      _videoController!.value.isInitialized
                  ? _videoView(_videoController!)
                  : const Center(
                      child: CircularProgressIndicator(color: Colors.white),
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

          // Tap zones: left half = previous, right half = next.
          Positioned.fill(
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _goToSegment(currentMoment - 1),
                    child: const SizedBox.expand(),
                  ),
                ),
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _goToSegment(currentMoment + 1),
                    child: const SizedBox.expand(),
                  ),
                ),
              ],
            ),
          ),

          Positioned(
            left: 20,
            right: 20,
            bottom: 30,
            child: _momentInformation(
              avatarUrl: moment.creatorAvatar,
              creator: creator,
              time: time,
              caption: caption,
            ),
          ),
        ],
      ),
    );
  }

  /// Fill the moment area with the playing video, cropping to cover.
  Widget _videoView(VideoPlayerController controller) {
    final size = controller.value.size;
    final hasSize =
        size.width > 0 && size.height > 0 && size.aspectRatio > 0;

    if (!hasSize) {
      return Center(
        child: SizedBox(
          width: double.infinity,
          child: AspectRatio(
            aspectRatio: 16 / 9,
            child: VideoPlayer(controller),
          ),
        ),
      );
    }

    return FittedBox(
      fit: BoxFit.cover,
      clipBehavior: Clip.hardEdge,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: VideoPlayer(controller),
      ),
    );
  }

  Widget _momentInformation({
    required String avatarUrl,
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
                clipBehavior: Clip.antiAlias,
                child: avatarUrl.isNotEmpty
                    ? (_isNetworkUrl(avatarUrl)
                        ? Image.network(
                            avatarUrl,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Icon(
                              Icons.person,
                              color: Colors.white,
                              size: 23,
                            ),
                          )
                        : Image.file(
                            File(avatarUrl),
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Icon(
                              Icons.person,
                              color: Colors.white,
                              size: 23,
                            ),
                          ))
                    : const Icon(Icons.person, color: Colors.white, size: 23),
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
          padding: const EdgeInsets.only(left: 16, right: 4),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.22),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: Colors.white.withOpacity(0.18)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _replyController,
                  focusNode: _replyFocus,
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _sendReply(),
                  decoration: InputDecoration(
                    hintText: tr(context, 'Reply to this Moment...'),
                    hintStyle: const TextStyle(
                        color: Colors.white60, fontSize: 12),
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ),
              IconButton(
                onPressed: _sendingReply ? null : _sendReply,
                padding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
                icon: _sendingReply
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white70,
                        ),
                      )
                    : const Icon(
                        Icons.send_outlined,
                        color: Colors.white,
                        size: 19,
                      ),
              ),
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

            Text(
              tr(context, 'Moments'),
              style: const TextStyle(
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

  /// Instagram-style segmented progress bar. Segments before the current
  /// one are full, the active one fills up as its timer/playback runs.
  Widget _progressIndicator() {
    final segment = _segmentController;

    return Positioned(
      top: 10,
      left: 12,
      right: 12,
      child: SafeArea(
        child: Row(
          children: List.generate(moments.length, (index) {
            final double fill;
            if (segment == null || index > currentMoment) {
              fill = 0;
            } else if (index < currentMoment) {
              fill = 1;
            } else {
              fill = segment.value;
            }

            return Expanded(
              child: Container(
                height: 3,
                margin: const EdgeInsets.symmetric(horizontal: 2),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Container(color: Colors.white.withOpacity(0.28)),
                      FractionallySizedBox(
                        alignment: Alignment.centerLeft,
                        widthFactor: fill,
                        child: Container(color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}
