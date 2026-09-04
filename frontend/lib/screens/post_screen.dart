import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import '../services/appearance_controller.dart';
import 'package:image_picker/image_picker.dart';

import '../models/clip.dart';
import '../models/moment.dart';
import '../models/nexora_label.dart';
import '../services/clip_service.dart';
import '../services/moment_service.dart';
import '../services/post_service.dart';
import '../services/user_service.dart';
import '../services/upload_service.dart';

enum CreationType { post, moment, clip }

/// File extensions treated as video/audio when classifying picked media.
const List<String> _videoExtensions = [
  '.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv',
];
const List<String> _audioExtensions = [
  '.mp3', '.wav', '.aac', '.ogg', '.flac',
];

class PostScreen extends StatefulWidget {
  final CreationType initialType;

  const PostScreen({super.key, this.initialType = CreationType.post});

  @override
  State<PostScreen> createState() => _PostScreenState();
}

class _PostScreenState extends State<PostScreen> {
  String _currentUserId = '';
  String _currentUsername = 'You';

  final TextEditingController _controller = TextEditingController();
  final ImagePicker _picker = ImagePicker();

  final PostService _postService = PostService();
  final MomentService _momentService = MomentService();
  final ClipService _clipService = ClipService();
  final UploadService _uploadService = UploadService();
  final UserService _userService = UserService();

  late CreationType _type;
  XFile? _media;

  /// Bytes of a picked image used for the on-screen preview. image_picker
  /// paths are blob URLs on web, where dart:io File reads don't work, so
  /// the preview is fed from bytes instead.
  Uint8List? _previewBytes;
  bool _publishing = false;
  double _uploadProgress = 0.0;

  @override
  void initState() {
    super.initState();
    _type = widget.initialType;
    _loadCurrentUser();
  }

  Future<void> _loadCurrentUser() async {
    final user = await _userService.getMyProfile();
    if (!mounted) return;
    setState(() {
      _currentUsername = user?.displayName ?? user?.username ?? 'You';
      _currentUserId = user?.id ?? '';
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Whether the picked media's name or path carries one of [extensions].
  /// The XFile name is checked too because on web the path is a blob URL
  /// without an extension.
  bool _mediaHasExtension(List<String> extensions) {
    final media = _media;
    if (media == null) return false;
    final lowerName = media.name.toLowerCase();
    final lowerPath = media.path.toLowerCase();
    return extensions.any(
      (ext) => lowerName.endsWith(ext) || lowerPath.endsWith(ext),
    );
  }

  bool get _isVideo => _mediaHasExtension(_videoExtensions);

  bool get _isAudio => _mediaHasExtension(_audioExtensions);

  bool get _canPublish {
    if (_type == CreationType.clip) return _media != null && _isVideo;
    if (_type == CreationType.moment) return _media != null;
    return _controller.text.trim().isNotEmpty || _media != null;
  }

  Future<void> _pickMedia() async {
    final XFile? picked;
    if (_type == CreationType.clip) {
      // Clips only accept videos — open the platform's video-only picker
      // so images can't even be selected.
      picked = await _picker.pickVideo(source: ImageSource.gallery);
    } else {
      picked = await _picker.pickMedia();
    }
    if (picked == null) return;

    if (_type == CreationType.clip && !_isVideoFile(picked)) {
      _showMessage('Clips require a video.');
      return;
    }

    setState(() => _media = picked);
    await _cacheImagePreview(picked);
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
    await _cacheImagePreview(picked);
  }

  /// True when an [XFile] looks like a video. Checks the extension on the
  /// file's name or path first (works on web where the path is a blob URL
  /// but the name still carries the real extension), then falls back to the
  /// MIME type when the picker provides one.
  static bool _isVideoFile(XFile file) {
    final lowerName = file.name.toLowerCase();
    final lowerPath = file.path.toLowerCase();
    if (_videoExtensions.any(
      (ext) => lowerName.endsWith(ext) || lowerPath.endsWith(ext),
    )) {
      return true;
    }

    // Fallback: some pickers return files without extensions (or blob URLs
    // with generated names) but expose the MIME type.
    final mime = file.mimeType?.toLowerCase() ?? '';
    return mime.startsWith('video/');
  }

  /// Reads a picked image into memory so the preview works on every
  /// platform. Videos/audio are skipped — they are previewed as an icon.
  Future<void> _cacheImagePreview(XFile picked) async {
    if (_isVideo || _isAudio) return;
    try {
      final bytes = await picked.readAsBytes();
      if (!mounted) return;
      setState(() => _previewBytes = bytes);
    } catch (_) {
      // Preview is cosmetic — ignore read failures.
    }
  }

  void _setType(CreationType type) {
    setState(() {
      _type = type;
      if (type == CreationType.clip && _media != null && !_isVideo) {
        _media = null;
        _previewBytes = null;
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
          // Determine content type
          String contentType = 'text';
          if (_media != null) {
            if (_isVideo) {
              contentType = 'video';
            } else if (_isAudio) {
              contentType = 'audio';
            } else {
              contentType = 'image';
            }
          }

          // Upload media to Cloudinary via backend if a file is attached
          List<Map<String, dynamic>>? mediaItems;
          if (_media != null) {
            try {
              setState(() {
                _uploadProgress = 0.0;
              });

              final uploadResult = await _uploadService.uploadXFile(
                xFile: _media!,
                onProgress: (bytesSent, totalBytes) {
                  if (mounted) {
                    setState(() {
                      _uploadProgress = totalBytes > 0 ? bytesSent / totalBytes : 0.0;
                    });
                  }
                },
              );

              mediaItems = [uploadResult.toMediaItem()];
              // Use the uploaded type as the content type
              contentType = uploadResult.type;
            } on UploadError catch (e) {
              if (!mounted) return;
              setState(() {
                _publishing = false;
                _uploadProgress = 0.0;
              });
              _showMessage(e.message);
              return;
            }
          }

          // Create post via backend API
          final createdPost = await _postService.createPost(
            text: text.isEmpty ? '' : text,
            contentType: contentType,
            media: mediaItems,
          );

          if (!mounted) return;

          if (!mounted) return;

          if (createdPost != null) {
            Navigator.pop(context, createdPost);
          } else {
            setState(() => _publishing = false);
            _showMessage('Could not create post. Please try again.');
          }
          return;

        case CreationType.moment:
          // Upload media to Cloudinary before creating moment
          String momentMediaUrl = _media!.path;
          if (_media != null) {
            try {
              setState(() {
                _uploadProgress = 0.0;
              });
              final uploadResult = await _uploadService.uploadXFile(
                xFile: _media!,
                onProgress: (bytesSent, totalBytes) {
                  if (mounted) {
                    setState(() {
                      _uploadProgress = totalBytes > 0 ? bytesSent / totalBytes : 0.0;
                    });
                  }
                },
              );
              momentMediaUrl = uploadResult.url;
            } on UploadError catch (e) {
              if (!mounted) return;
              setState(() {
                _publishing = false;
                _uploadProgress = 0.0;
              });
              _showMessage(e.message);
              return;
            }
          }
          await _momentService.createMoment(
            Moment(
              id: 'moment_${now.microsecondsSinceEpoch}',
              creatorId: _currentUserId,
              creatorUsername: _currentUsername,
              mediaUrl: momentMediaUrl,
              mediaType: _isVideo ? 'video' : 'image',
              label: null,
              createdAt: now,
              expiresAt: now.add(const Duration(hours: 24)),
            ),
          );
          break;

        case CreationType.clip:
          // Upload media to Cloudinary before creating clip
          String clipVideoUrl = _media!.path;
          if (_media != null) {
            try {
              setState(() {
                _uploadProgress = 0.0;
              });
              final uploadResult = await _uploadService.uploadXFile(
                xFile: _media!,
                onProgress: (bytesSent, totalBytes) {
                  if (mounted) {
                    setState(() {
                      _uploadProgress = totalBytes > 0 ? bytesSent / totalBytes : 0.0;
                    });
                  }
                },
              );
              clipVideoUrl = uploadResult.url;
            } on UploadError catch (e) {
              if (!mounted) return;
              setState(() {
                _publishing = false;
                _uploadProgress = 0.0;
              });
              _showMessage(e.message);
              return;
            }
          }
          await _clipService.createClip(
            Clip(
              id: 'clip_${now.microsecondsSinceEpoch}',
              creatorId: _currentUserId,
              creatorUsername: _currentUsername,
              videoUrl: clipVideoUrl,
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
      backgroundColor: context.nexora.backgroundAlt,
      appBar: AppBar(
        backgroundColor: context.nexora.backgroundAlt,
        foregroundColor: context.nexora.textPrimary,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back),
          onPressed: _publishing ? null : () => Navigator.pop(context),
        ),
        title: Text(
          _title,
          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w600),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
          child: Column(
            children: [
              _typeSelector(),
              SizedBox(height: 18),
              Expanded(
                child: ListView(
                  children: [
                    _profileRow(),
                    SizedBox(height: 20),
                    if (_media != null) ...[
                      _mediaPreview(),
                      SizedBox(height: 16),
                    ],
                    if (_publishing && _uploadProgress > 0) ...[
                      _uploadProgressIndicator(),
                      SizedBox(height: 16),
                    ],
                    Container(
                      width: double.infinity,
                      height: 220,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: context.nexora.field,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: TextField(
                        controller: _controller,
                        onChanged: (_) => setState(() {}),
                        maxLines: null,
                        expands: true,
                        textAlignVertical: TextAlignVertical.top,
                        style: TextStyle(
                          color: context.nexora.textPrimary,
                          fontSize: 16,
                        ),
                        decoration: InputDecoration(
                          hintText: _type == CreationType.clip
                              ? 'Write a caption for your Clip...'
                              : _type == CreationType.moment
                              ? 'Add a caption to your Moment...'
                              : "What's on your mind?",
                          hintStyle: TextStyle(
                            color: context.nexora.textMuted,
                            fontSize: 16,
                          ),
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                    SizedBox(height: 18),
                    Row(
                      children: [
                        _mediaButton(Icons.image_outlined, _pickMedia),
                        SizedBox(width: 12),
                        _mediaButton(Icons.camera_alt_outlined, _openCamera),
                        SizedBox(width: 12),
                        _mediaButton(
                          Icons.emoji_emotions_outlined,
                          () => _showEmojiPicker(),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: _canPublish && !_publishing
                        ? LinearGradient(
                            colors: nexoraGradient(),
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                          )
                        : null,
                    color: _canPublish && !_publishing
                        ? null
                        : context.nexora.disabled,
                  ),
                  child: ElevatedButton(
                    onPressed: _canPublish && !_publishing ? _publish : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      disabledBackgroundColor: Colors.transparent,
                      foregroundColor: context.nexora.textPrimary,
                      disabledForegroundColor: context.nexora.textHint,
                      shadowColor: Colors.transparent,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: _publishing
                        ? SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: context.nexora.textPrimary,
                            ),
                          )
                        : Text(
                            _publishLabel,
                            style: TextStyle(
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
        color: context.nexora.field,
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
            color: selected ? context.nexora.surfaceSelected : Colors.transparent,
            borderRadius: BorderRadius.circular(11),
          ),
          child: Column(
            children: [
              Icon(
                icon,
                size: 20,
                color: selected ? context.nexora.textPrimary : context.nexora.textMuted,
              ),
              SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  color: selected ? context.nexora.textPrimary : context.nexora.textMuted,
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
          child: CircleAvatar(
            backgroundColor: context.nexora.card,
            child: Icon(Icons.person, color: context.nexora.textPrimary),
          ),
        ),
        SizedBox(width: 12),
        Text(
          _currentUsername,
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _mediaPreview() {
    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: _isVideo
              ? Container(
                  height: 230,
                  width: double.infinity,
                  color: context.nexora.field,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.videocam_outlined,
                        color: context.nexora.textPrimary,
                        size: 52,
                      ),
                      SizedBox(height: 10),
                      Text(
                        'Video selected',
                        style: TextStyle(color: context.nexora.textSecondary),
                      ),
                    ],
                  ),
                )
              : _imagePreview(),
        ),
        Positioned(
          top: 8,
          right: 8,
          child: IconButton(
            onPressed: () => setState(() {
              _media = null;
              _previewBytes = null;
            }),
            style: IconButton.styleFrom(backgroundColor: Colors.black54),
            icon: Icon(Icons.close, color: context.nexora.textPrimary),
          ),
        ),
      ],
    );
  }

  Widget _imagePreview() {
    final bytes = _previewBytes;
    if (bytes == null) {
      return Container(
        height: 230,
        width: double.infinity,
        color: context.nexora.field,
        child: Icon(
          Icons.image_outlined,
          color: context.nexora.textSecondary,
          size: 52,
        ),
      );
    }

    return Image.memory(
      bytes,
      height: 230,
      width: double.infinity,
      fit: BoxFit.cover,
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
          color: context.nexora.field,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Icon(icon, color: context.nexora.textSecondary, size: 23),
      ),
    );
  }

  Widget _uploadProgressIndicator() {
    final percent = (_uploadProgress * 100).clamp(0, 100).toStringAsFixed(0);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.nexora.field,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Color(0xFF3157D5),
                ),
              ),
              SizedBox(width: 10),
              Text(
                'Uploading media... $percent%',
                style: TextStyle(
                  color: context.nexora.textSecondary,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: _uploadProgress,
              backgroundColor: context.nexora.surfaceSelected,
              valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF3157D5)),
              minHeight: 4,
            ),
          ),
        ],
      ),
    );
  }

  void _showEmojiPicker() {
    const emojis = ['😀', '😂', '😍', '🔥', '✨', '❤️', '👍', '🚀', '💜', '🎉'];

    showModalBottomSheet(
      context: context,
      backgroundColor: context.nexora.field,
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
                    child: Text(emoji, style: TextStyle(fontSize: 28)),
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
