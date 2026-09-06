import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../config/nexora_themes.dart';
import '../utils/media_url.dart';
import '../utils/route_observer.dart';
import 'comments_screen.dart';
import 'post_screen.dart';
import 'share_screen.dart';
import 'user_profile_screen.dart';
import '../models/clip.dart';
import '../services/clip_service.dart';
import '../services/like_service.dart';
import '../services/moment_service.dart';
import '../services/post_service.dart';

class ClipsScreen extends StatefulWidget {
  /// Whether this screen is the tab currently shown in the bottom
  /// navigation. When false, the playing clip is paused so its audio
  /// stops after the user leaves the Clips tab.
  final bool active;

  const ClipsScreen({super.key, this.active = true});

  @override
  State<ClipsScreen> createState() => _ClipsScreenState();
}

class _ClipsScreenState extends State<ClipsScreen>
    with RouteAware, WidgetsBindingObserver {
  final ClipService _clipService = ClipService();
  final MomentService _momentService = MomentService();
  final LikeService _likeService = LikeService();
  final PostService _postService = PostService();
  final PageController _pageController = PageController();

  final Map<String, bool> _likedClips = {};
  final Map<String, int> _clipLikeCounts = {};
  final Map<String, bool> _savedClips = {};
  final Map<String, GlobalKey<_VideoPlayerWidgetState>> _playerKeys = {};

  List<Clip> clips = [];

  /// Clips persist in the feed — they are NOT auto-removed after viewing.
  /// Only explicit user deletion removes a clip.
  List<Clip> get _visibleClips => clips;

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
    WidgetsBinding.instance.addObserver(this);
    _loadClips();
  }

  /// App went to the background (or the browser tab was hidden) — stop
  /// clip audio so it never plays when the user isn't looking at it.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (widget.active) {
        _resumeCurrentClip();
      }
    } else {
      _pauseAllPlayback();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Watch the enclosing route so any full-screen page pushed on top of
    // the Clips screen pauses clip playback while it is covered. Modal
    // bottom sheets are not PageRoutes, so they do not pause the video.
    final route = ModalRoute.of(context);
    if (route is PageRoute<dynamic>) {
      routeObserver.subscribe(this, route);
    }
  }

  /// A new screen was pushed on top of the Clips screen — stop audio.
  @override
  void didPushNext() {
    if (!widget.active) return;
    _pauseAllPlayback();
  }

  /// The covering screen was popped — resume the visible clip (if the
  /// Clips tab is still the active tab).
  @override
  void didPopNext() {
    if (!widget.active) return;
    _resumeCurrentClip();
  }

  /// Record that the user watched the clip at [index] on the server.
  /// Unlike moments, clips are NOT removed from the feed after viewing —
  /// they persist until the user explicitly deletes them.
  void _markClipViewed(int index) {
    if (index < 0 || index >= _visibleClips.length) return;
    final clip = _visibleClips[index];
    if (clip.isViewed) return;
    // Fire-and-forget server notification only; no local state removal.
    unawaited(
      _momentService.markAsViewed(clip.id).catchError((_) {}),
    );
  }

  Future<void> _loadClips() async {
    final loadedClips = await _clipService.fetchClips();

    if (!mounted) return;

    setState(() {
      clips = loadedClips;
      isLoading = false;
    });

    // Initialize like counts from fetched clips
    for (final clip in clips) {
      _likedClips[clip.id] = false;
      _clipLikeCounts[clip.id] = clip.likeCount;
    }
  }

  @override
  void didUpdateWidget(covariant ClipsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.active == widget.active) return;

    if (widget.active) {
      // Back on the Clips tab — resume the clip that was playing.
      _resumeCurrentClip();
    } else {
      // Left the Clips tab — stop audio/video playback.
      _pauseAllPlayback();
    }
  }

  @override
  void dispose() {
    routeObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    _pageController.dispose();
    super.dispose();
  }

  /// Player widget of the clip currently on screen, if it exists yet.
  _VideoPlayerWidgetState? _currentPlayerState() {
    if (_visibleClips.isEmpty ||
        currentClip < 0 ||
        currentClip >= _visibleClips.length) {
      return null;
    }
    return _playerKeys[_visibleClips[currentClip].id]?.currentState;
  }

  /// Every player currently mounted (the visible clip plus cached
  /// neighbours), so audio can be silenced no matter which clip was
  /// unmuted last.
  Iterable<_VideoPlayerWidgetState> get _allPlayerStates => _playerKeys.values
      .map((key) => key.currentState)
      .whereType<_VideoPlayerWidgetState>();

  /// Silences every mounted clip player (used when the user leaves the
  /// Clips screen or another screen covers it).
  void _pauseAllPlayback() {
    for (final state in _allPlayerStates) {
      state.pause();
    }
  }

  void _resumeCurrentClip() {
    _currentPlayerState()?.play();
  }

  /// Pushes [screen] on top of the Clips screen. Playback is paused while
  /// the screen is covered and resumed once the user comes back, so clip
  /// audio never plays while another screen is open.
  Future<void> _navigateTo(
    Widget screen, {
    Future<void> Function()? onReturn,
  }) async {
    _pauseAllPlayback();
    await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    if (!mounted) return;
    if (onReturn != null) {
      await onReturn();
    }
    _resumeCurrentClip();
  }
  Future<void> _toggleLike(Clip clip) async {
    final previousLiked = _likedClips[clip.id] ?? false;
    final previousCount = _clipLikeCounts[clip.id] ?? clip.likeCount;

    // Optimistic update
    setState(() {
      _likedClips[clip.id] = !previousLiked;
      _clipLikeCounts[clip.id] = previousLiked
          ? (previousCount > 0 ? previousCount - 1 : 0)
          : previousCount + 1;
    });

    // Call backend
    final result = await _likeService.toggleLike(postId: clip.id);

    if (!mounted) return;

    // Trust backend response if it returned valid data
    if (result['likesCount'] != 0 || result['isLiked'] != false || !previousLiked) {
      setState(() {
        _likedClips[clip.id] = result['isLiked'] as bool;
        _clipLikeCounts[clip.id] = result['likesCount'] as int;
      });
    } else {
      // Rollback on failure
      setState(() {
        _likedClips[clip.id] = previousLiked;
        _clipLikeCounts[clip.id] = previousCount;
      });
    }
  }

  Future<void> _toggleSaveClip(Clip clip) async {
    final previousSaved = _savedClips[clip.id] ?? false;

    if (!mounted) return;
    setState(() {
      _savedClips[clip.id] = !previousSaved;
    });

    final result = await _postService.toggleSave(postId: clip.id);

    if (!mounted) return;

    setState(() {
      _savedClips[clip.id] = result['isSaved'] as bool;
    });
  }

  void _openProfile(String username) {
    _navigateTo(UserProfileScreen(username: username));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: isLoading
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : _visibleClips.isEmpty
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
                  itemCount: _visibleClips.length,
                  onPageChanged: (index) {
                    setState(() {
                      currentClip = index;
                    });
                    // The page we just swiped away from is still mounted
                    // briefly — stop its audio so only the visible clip
                    // can be heard.
                    for (final state in _allPlayerStates) {
                      state.pause();
                    }
                    _resumeCurrentClip();
                    _markClipViewed(index);
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

    return _VideoPlayerWidget(
      key: _playerKeys.putIfAbsent(
        clip.id,
        () => GlobalKey<_VideoPlayerWidgetState>(),
      ),
      videoUrl: clip.videoUrl,
      onMutedChanged: (muted) {
        if (mounted) {
          setState(() {
            _mutedClips[clip.id] = muted;
          });
        }
      },
    );
  }

  Widget _clipPage(int index) {
    final clip = _visibleClips[index];
    // Gradients follow the original clip order so they stay stable even
    // after watched clips drop out of the feed.
    final originalIndex = clips.indexOf(clip);
    final gradient = gradients[
        (originalIndex < 0 ? index : originalIndex) % gradients.length];

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
      backgroundColor: context.nexora.sheet,
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
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 18),

            Text(
              'Why this label?',
              style: TextStyle(
                color: context.nexora.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),

            const SizedBox(height: 6),

            Text(
              _labelWhy(label),
              style: TextStyle(
                color: context.nexora.textSecondary,
                fontSize: 13,
                height: 1.4,
              ),
            ),

            const SizedBox(height: 16),

            Text(
              'Content type',
              style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
            ),

            const SizedBox(height: 4),

            Text(
              '🎥 Video',
              style: TextStyle(color: context.nexora.textPrimary, fontSize: 13),
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
    final clip = _visibleClips[currentClip];

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
            final creator = _visibleClips[currentClip].creatorUsername;

            _navigateTo(CommentsScreen(username: creator));
          },
        ),

        const SizedBox(height: 20),

        _clipAction(Icons.repeat, '126'),

        const SizedBox(height: 20),

        _clipAction(
          Icons.send_outlined,
          'Share',
          onTap: () {
            final creator = _visibleClips[currentClip].creatorUsername;

            _navigateTo(ShareScreen(postAuthor: creator));
          },
        ),

        const SizedBox(height: 20),

        _clipAction(
          (_savedClips[_visibleClips[currentClip].id] ?? false)
              ? Icons.bookmark
              : Icons.bookmark_border,
          'Save',
          onTap: () => _toggleSaveClip(_visibleClips[currentClip]),
        ),
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

            // Volume toggle lives in the header row (right of the title),
            // clear of the camera button and the video's overlay icons.
            // Only shown for real (non-demo) clips.
            if (_hasCurrentVideo())
              GestureDetector(
                onTap: _toggleCurrentMute,
                child: Container(
                  width: 34,
                  height: 34,
                  margin: const EdgeInsets.only(right: 6),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.35),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withOpacity(0.25)),
                  ),
                  child: Icon(
                    _isCurrentClipMuted()
                        ? Icons.volume_off
                        : Icons.volume_up,
                    color: Colors.white,
                    size: 18,
                  ),
                ),
              ),

            IconButton(
              onPressed: () {
                _navigateTo(
                  const PostScreen(initialType: CreationType.clip),
                  onReturn: _loadClips,
                );
              },
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

  /// Mute state per clip, kept in sync by each player via [onMutedChanged].
  final Map<String, bool> _mutedClips = {};

  bool _hasCurrentVideo() {
    if (_visibleClips.isEmpty || currentClip >= _visibleClips.length) {
      return false;
    }
    return !_visibleClips[currentClip].videoUrl.startsWith('demo://');
  }

  bool _isCurrentClipMuted() {
    if (_visibleClips.isEmpty || currentClip >= _visibleClips.length) {
      return true;
    }
    return _mutedClips[_visibleClips[currentClip].id] ?? true;
  }

  void _toggleCurrentMute() {
    if (_visibleClips.isEmpty || currentClip >= _visibleClips.length) return;
    final clip = _visibleClips[currentClip];
    final state = _playerKeys[clip.id]?.currentState;
    if (state != null) {
      state.setMuted(!_isCurrentClipMuted());
    }
  }

  Widget _pageIndicator() {
    return Positioned(
      right: 5,
      top: 0,
      bottom: 0,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(_visibleClips.length, (index) {
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

  /// Reports mute-state changes so the header button stays in sync.
  final ValueChanged<bool>? onMutedChanged;

  const _VideoPlayerWidget({
    super.key,
    required this.videoUrl,
    this.onMutedChanged,
  });

  @override
  State<_VideoPlayerWidget> createState() => _VideoPlayerWidgetState();
}

class _VideoPlayerWidgetState extends State<_VideoPlayerWidget> {
  late final VideoPlayerController _controller;
  bool _failed = false;
  bool _muted = true;
  Timer? _initTimer;

  /// Set this player's mute state.
  void setMuted(bool muted) {
    if (_muted == muted) return;
    setState(() {
      _muted = muted;
    });
    // Runs inside the user's tap, which is the gesture browsers require
    // before allowing audible playback.
    _controller.setVolume(muted ? 0 : 1);
    widget.onMutedChanged?.call(muted);
  }

  /// Pauses playback and silences the audio track (used when the user
  /// navigates away from the Clips screen so audio cannot keep playing in
  /// the background). Volume is restored on [play].
  void pause() {
    if (_controller.value.isInitialized) {
      _controller.pause();
      _controller.setVolume(0);
    }
  }

  /// Resumes playback after returning to the Clips screen, restoring the
  /// user's chosen volume (muted unless they turned sound on).
  void play() {
    if (_controller.value.isInitialized && !_failed) {
      _controller.setVolume(_muted ? 0 : 1);
      _controller.play();
    }
  }

  void _reportMuted() {
    widget.onMutedChanged?.call(_muted);
  }

  @override
  void initState() {
    super.initState();

    final url = mediaPlaybackUrl(widget.videoUrl);
    final isNetwork = url.startsWith('http://') || url.startsWith('https://');
    _controller = isNetwork
        ? VideoPlayerController.networkUrl(Uri.parse(url))
        : VideoPlayerController.file(File(url));

    _controller.initialize().then((_) {
      if (!mounted) return;
      _initTimer?.cancel();
      _initTimer = null;
      setState(() {});
      // Start muted so autoplay is allowed (browsers block audible
      // autoplay without a prior user gesture).
      _controller
        ..setLooping(true)
        ..setVolume(0)
        ..play();
      _reportMuted();
    }).catchError((Object _) {
      if (!mounted) return;
      _initTimer?.cancel();
      _initTimer = null;
      setState(() => _failed = true);
    });

    // Some browsers hang forever instead of erroring when a video can't
    // decode (e.g. unsupported codec) — surface it instead of spinning.
    _initTimer = Timer(const Duration(seconds: 20), () {
      if (!mounted || _controller.value.isInitialized) return;
      setState(() => _failed = true);
    });
  }

  @override
  void dispose() {
    _initTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return Container(
        color: Colors.black,
        alignment: Alignment.center,
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.videocam_off_outlined,
                color: Colors.white38, size: 40),
            SizedBox(height: 8),
            Text(
              'Video unavailable',
              style: TextStyle(color: Colors.white54, fontSize: 13),
            ),
          ],
        ),
      );
    }

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
