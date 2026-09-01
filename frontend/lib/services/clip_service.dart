import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/clip.dart';
import '../models/nexora_label.dart';

class ClipService {
  static const String _storageKey = 'nexora_clips';

  final List<Clip> _clips = [
    Clip(
      id: 'clip_001',
      creatorId: 'aarav',
      creatorUsername: 'Aarav',
      videoUrl: 'demo://clip_001',
      caption: 'A little moment worth remembering. ✨',
      music: 'Original audio · Aarav',
      label: NexoraLabel.verifiedAuthentic,
      likeCount: 1200,
      commentCount: 84,
      repostCount: 126,
      createdAt: DateTime(2026, 8, 29),
    ),
    Clip(
      id: 'clip_002',
      creatorId: 'maya',
      creatorUsername: 'Maya',
      videoUrl: 'demo://clip_002',
      caption: 'Create something that feels like you. 💜',
      music: 'Nexora Sounds · Dreaming',
      label: NexoraLabel.aiGeneratedVerified,
      likeCount: 1200,
      commentCount: 84,
      repostCount: 126,
      createdAt: DateTime(2026, 8, 28),
    ),
    Clip(
      id: 'clip_003',
      creatorId: 'arjun',
      creatorUsername: 'Arjun',
      videoUrl: 'demo://clip_003',
      caption: 'Late nights. Big ideas. 🚀',
      music: 'Original audio · Arjun',
      label: NexoraLabel.editedContent,
      likeCount: 1200,
      commentCount: 84,
      repostCount: 126,
      createdAt: DateTime(2026, 8, 27),
    ),
    Clip(
      id: 'clip_004',
      creatorId: 'ananya',
      creatorUsername: 'Ananya',
      videoUrl: 'demo://clip_004',
      caption: 'Find beauty in the ordinary. 🌿',
      music: 'Nexora Sounds · Ordinary',
      label: NexoraLabel.disputedNeedsContext,
      likeCount: 1200,
      commentCount: 84,
      repostCount: 126,
      createdAt: DateTime(2026, 8, 26),
    ),
    Clip(
      id: 'clip_005',
      creatorId: 'riya',
      creatorUsername: 'Riya',
      videoUrl: 'demo://clip_005',
      caption: 'A claim shown to be false or materially misleading. 🚨',
      music: 'Original audio · Riya',
      label: NexoraLabel.falseOrMisleading,
      likeCount: 1200,
      commentCount: 84,
      repostCount: 126,
      createdAt: DateTime(2026, 8, 25),
    ),
  ];

  bool _loaded = false;

  List<Clip> get clips => List.unmodifiable(_clips);

  Future<void> _ensureLoaded() async {
    if (_loaded) return;

    final prefs = await SharedPreferences.getInstance();
    final savedClips = prefs.getStringList(_storageKey) ?? [];

    for (final jsonString in savedClips) {
      try {
        final map = jsonDecode(jsonString) as Map<String, dynamic>;

        final id = map['id'] as String;

        if (_clips.any((clip) => clip.id == id)) {
          continue;
        }

        _clips.insert(
          0,
          Clip(
            id: id,
            creatorId: map['creatorId'] as String,
            creatorUsername: map['creatorUsername'] as String,
            videoUrl: map['videoUrl'] as String,
            caption: map['caption'] as String,
            music: map['music'] as String?,
            label: NexoraLabel.editedContent,
            likeCount: map['likeCount'] as int? ?? 0,
            commentCount: map['commentCount'] as int? ?? 0,
            repostCount: map['repostCount'] as int? ?? 0,
            createdAt: DateTime.parse(map['createdAt'] as String),
          ),
        );
      } catch (_) {
        // Ignore malformed saved Clips.
      }
    }

    _loaded = true;
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();

    final savedClips = _clips
        .where((clip) => !clip.videoUrl.startsWith('demo://'))
        .map(
          (clip) => jsonEncode({
            'id': clip.id,
            'creatorId': clip.creatorId,
            'creatorUsername': clip.creatorUsername,
            'videoUrl': clip.videoUrl,
            'caption': clip.caption,
            'music': clip.music,
            'createdAt': clip.createdAt.toIso8601String(),
            'likeCount': clip.likeCount,
            'commentCount': clip.commentCount,
            'repostCount': clip.repostCount,
          }),
        )
        .toList();

    await prefs.setStringList(_storageKey, savedClips);
  }

  Future<List<Clip>> fetchClips() async {
    await _ensureLoaded();
    return List.unmodifiable(_clips);
  }

  Future<Clip?> getClipById(String clipId) async {
    await _ensureLoaded();

    for (final clip in _clips) {
      if (clip.id == clipId) {
        return clip;
      }
    }

    return null;
  }

  Future<void> createClip(Clip clip) async {
    await _ensureLoaded();

    _clips.insert(0, clip);
    await _save();
  }

  Future<void> updateClip(Clip updatedClip) async {
    await _ensureLoaded();

    final index = _clips.indexWhere((clip) => clip.id == updatedClip.id);

    if (index == -1) return;

    _clips[index] = updatedClip;
    await _save();
  }

  Future<void> deleteClip(String clipId) async {
    await _ensureLoaded();

    _clips.removeWhere((clip) => clip.id == clipId);

    await _save();
  }
}
