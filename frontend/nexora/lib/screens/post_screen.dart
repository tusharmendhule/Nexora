import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/clip.dart';
import '../models/moment.dart';
import '../models/nexora_label.dart';
import '../models/post.dart';
import '../services/clip_service.dart';
import '../services/moment_service.dart';
import '../services/post_service.dart';

enum CreationType { post, moment, clip }

class PostScreen extends StatefulWidget {
  final CreationType initialType;

  const PostScreen({super.key, this.initialType = CreationType.post});

  @override
  State<PostScreen> createState() => _PostScreenState();
}

class _PostScreenState extends State<PostScreen> {
  static const String currentUserId = 'user_you';
  static const String currentUsername = 'You';

  final TextEditingController _controller = TextEditingController();
  final ImagePicker _picker = ImagePicker();

  final PostService _postService = PostService();
  final MomentService _momentService = MomentService();
  final ClipService _clipService = ClipService();

  late CreationType _type;
  XFile? _media;
  bool _publishing = false;

  @override
  void initState() {
    super.initState();
    _type = widget.initialType;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _isVideo {
    final path = _media?.path.toLowerCase() ?? '';
    return path.endsWith('.mp4') ||
        path.endsWith('.mov') ||
        path.endsWith('.m4v') ||
        path.endsWith('.webm') ||
        path.endsWith('.avi') ||
        path.endsWith('.mkv');
  }

  bool get _canPublish {
    if (_type == CreationType.clip) return _media != null && _isVideo;
    if (_type == CreationType.moment) return _media != null;
    return _controller.text.trim().isNotEmpty || _media != null;
  }

  Future<void> _pickMedia() async {
    final picked = await _picker.pickMedia();
    if (picked == null) return;

    if (_type == CreationType.clip && !_looksLikeVideo(picked.path)) {
      _showMessage('Clips require a video.');
      return;
    }

    setState(() => _media = picked);
  }

  Future<void> _openCamera() async {
    final XFile? picked;

    if (_type == CreationType.clip) {
      picked = await _picker.pickVideo(source: ImageSource.camera);
    } else {
      picked = await _picker.pickImage(source: ImageSource.camera);
    }

    if (picked == null) return;
    setState(() => _media = picked);
  }

  bool _looksLikeVideo(String path) {
    final value = path.toLowerCase();
    return value.endsWith('.mp4') ||
        value.endsWith('.mov') ||
        value.endsWith('.m4v') ||
        value.endsWith('.webm') ||
        value.endsWith('.avi') ||
        value.endsWith('.mkv');
  }

  void _setType(CreationType type) {
    setState(() {
      _type = type;
      if (type == CreationType.clip && _media != null && !_isVideo) {
        _media = null;
      }
    });
  }

  Future<void> _publish() async {
    if (!_canPublish || _publishing) return;

    FocusScope.of(context).unfocus();
    setState(() => _publishing = true);

    final now = DateTime.now();
    final text = _controller.text.trim();

    try {
      switch (_type) {
        case CreationType.post:
          final post = Post(
            id: 'post_${now.microsecondsSinceEpoch}',
            authorId: currentUserId,
            authorUsername: currentUsername,
            text: text.isEmpty ? null : text,
            mediaUrl: _media?.path,
            contentType: _media == null
                ? 'text'
                : (_isVideo ? 'video' : 'image'),
            label: NexoraLabel.editedContent,
            createdAt: now,
          );

          await _postService.createPost(post);

          if (!mounted) return;
          Navigator.pop(context, post);
          return;

        case CreationType.moment:
          await _momentService.createMoment(
            Moment(
              id: 'moment_${now.microsecondsSinceEpoch}',
              creatorId: currentUserId,
              creatorUsername: currentUsername,
              mediaUrl: _media!.path,
              mediaType: _isVideo ? 'video' : 'image',
              label: null,
              createdAt: now,
              expiresAt: now.add(const Duration(hours: 24)),
            ),
          );
          break;

        case CreationType.clip:
          await _clipService.createClip(
            Clip(
              id: 'clip_${now.microsecondsSinceEpoch}',
              creatorId: currentUserId,
              creatorUsername: currentUsername,
              videoUrl: _media!.path,
              caption: text,
              music: null,
              label: NexoraLabel.editedContent,
              createdAt: now,
            ),
          );
          break;
      }

      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e, stackTrace) {
      debugPrint('PUBLISH ERROR: $e');
      debugPrint('PUBLISH STACK TRACE: $stackTrace');

      if (!mounted) return;
      setState(() => _publishing = false);
      _showMessage('Could not publish. Please try again.');
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  String get _title {
    switch (_type) {
      case CreationType.post:
        return 'Create Post';
      case CreationType.moment:
        return 'Create Moment';
      case CreationType.clip:
        return 'Create Clip';
    }
  }

  String get _publishLabel {
    switch (_type) {
      case CreationType.post:
        return 'Post';
      case CreationType.moment:
        return 'Share Moment';
      case CreationType.clip:
        return 'Publish Clip';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF080B1A),
        foregroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: _publishing ? null : () => Navigator.pop(context),
        ),
        title: Text(
          _title,
          style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w600),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
          child: Column(
            children: [
              _typeSelector(),
              const SizedBox(height: 18),
              Expanded(
                child: ListView(
                  children: [
                    _profileRow(),
                    const SizedBox(height: 20),
                    if (_media != null) ...[
                      _mediaPreview(),
                      const SizedBox(height: 16),
                    ],
                    Container(
                      width: double.infinity,
                      height: 220,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF151A2E),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: TextField(
                        controller: _controller,
                        onChanged: (_) => setState(() {}),
                        maxLines: null,
                        expands: true,
                        textAlignVertical: TextAlignVertical.top,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                        ),
                        decoration: InputDecoration(
                          hintText: _type == CreationType.clip
                              ? 'Write a caption for your Clip...'
                              : _type == CreationType.moment
                              ? 'Add a caption to your Moment...'
                              : "What's on your mind?",
                          hintStyle: const TextStyle(
                            color: Colors.white54,
                            fontSize: 16,
                          ),
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        _mediaButton(Icons.image_outlined, _pickMedia),
                        const SizedBox(width: 12),
                        _mediaButton(Icons.camera_alt_outlined, _openCamera),
                        const SizedBox(width: 12),
                        _mediaButton(
                          Icons.emoji_emotions_outlined,
                          () => _showEmojiPicker(),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: _canPublish && !_publishing
                        ? const LinearGradient(
                            colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                          )
                        : null,
                    color: _canPublish && !_publishing
                        ? null
                        : const Color(0xFF343441),
                  ),
                  child: ElevatedButton(
                    onPressed: _canPublish && !_publishing ? _publish : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      disabledBackgroundColor: Colors.transparent,
                      foregroundColor: Colors.white,
                      disabledForegroundColor: Colors.white38,
                      shadowColor: Colors.transparent,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: _publishing
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            _publishLabel,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
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
  }

  Widget _typeSelector() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color(0xFF151A2E),
        borderRadius: BorderRadius.circular(15),
      ),
      child: Row(
        children: [
          _typeButton(CreationType.post, 'Post', Icons.article_outlined),
          _typeButton(
            CreationType.moment,
            'Moment',
            Icons.auto_stories_outlined,
          ),
          _typeButton(CreationType.clip, 'Clip', Icons.play_circle_outline),
        ],
      ),
    );
  }

  Widget _typeButton(CreationType type, String label, IconData icon) {
    final selected = _type == type;

    return Expanded(
      child: GestureDetector(
        onTap: () => _setType(type),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? const Color(0xFF242A46) : Colors.transparent,
            borderRadius: BorderRadius.circular(11),
          ),
          child: Column(
            children: [
              Icon(
                icon,
                size: 20,
                color: selected ? Colors.white : Colors.white54,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : Colors.white54,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _profileRow() {
    return Row(
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFF3157D5), width: 2),
          ),
          child: const CircleAvatar(
            backgroundColor: Color(0xFF171D35),
            child: Icon(Icons.person, color: Colors.white),
          ),
        ),
        const SizedBox(width: 12),
        const Text(
          'Username_',
          style: TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _mediaPreview() {
    final file = File(_media!.path);

    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: _isVideo
              ? Container(
                  height: 230,
                  width: double.infinity,
                  color: const Color(0xFF151A2E),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.videocam_outlined,
                        color: Colors.white,
                        size: 52,
                      ),
                      SizedBox(height: 10),
                      Text(
                        'Video selected',
                        style: TextStyle(color: Colors.white70),
                      ),
                    ],
                  ),
                )
              : Image.file(
                  file,
                  height: 230,
                  width: double.infinity,
                  fit: BoxFit.cover,
                ),
        ),
        Positioned(
          top: 8,
          right: 8,
          child: IconButton(
            onPressed: () => setState(() => _media = null),
            style: IconButton.styleFrom(backgroundColor: Colors.black54),
            icon: const Icon(Icons.close, color: Colors.white),
          ),
        ),
      ],
    );
  }

  Widget _mediaButton(IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: const Color(0xFF151A2E),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Icon(icon, color: Colors.white70, size: 23),
      ),
    );
  }

  void _showEmojiPicker() {
    const emojis = ['😀', '😂', '😍', '🔥', '✨', '❤️', '👍', '🚀', '💜', '🎉'];

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF151A2E),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: emojis.map((emoji) {
                return InkWell(
                  onTap: () {
                    final selection = _controller.selection;
                    final text = _controller.text;

                    if (selection.isValid) {
                      _controller.text = text.replaceRange(
                        selection.start,
                        selection.end,
                        emoji,
                      );
                      _controller.selection = TextSelection.collapsed(
                        offset: selection.start + emoji.length,
                      );
                    } else {
                      _controller.text = '$text$emoji';
                    }

                    Navigator.pop(context);
                    setState(() {});
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(emoji, style: const TextStyle(fontSize: 28)),
                  ),
                );
              }).toList(),
            ),
          ),
        );
      },
    );
  }
}
