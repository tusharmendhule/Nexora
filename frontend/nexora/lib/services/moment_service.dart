import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/moment.dart';

class MomentService {
  MomentService._internal();

  static final MomentService _instance = MomentService._internal();

  factory MomentService() => _instance;

  static const String _storageKey = 'nexora_moments';

  final List<Moment> _moments = [
    Moment(
      id: 'moment_001',
      creatorId: 'user_you',
      creatorUsername: 'You',
      mediaUrl: 'demo://moment_001',
      mediaType: 'image',
      label: null,
      createdAt: DateTime(2026, 8, 29),
      expiresAt: DateTime(2026, 8, 30),
    ),
    Moment(
      id: 'moment_002',
      creatorId: 'aarav',
      creatorUsername: 'Aarav',
      mediaUrl: 'demo://moment_002',
      mediaType: 'image',
      label: null,
      createdAt: DateTime(2026, 8, 29),
      expiresAt: DateTime(2026, 8, 30),
    ),
    Moment(
      id: 'moment_003',
      creatorId: 'maya',
      creatorUsername: 'Maya',
      mediaUrl: 'demo://moment_003',
      mediaType: 'image',
      label: null,
      createdAt: DateTime(2026, 8, 29),
      expiresAt: DateTime(2026, 8, 30),
    ),
    Moment(
      id: 'moment_004',
      creatorId: 'arjun',
      creatorUsername: 'Arjun',
      mediaUrl: 'demo://moment_004',
      mediaType: 'image',
      label: null,
      createdAt: DateTime(2026, 8, 29),
      expiresAt: DateTime(2026, 8, 30),
    ),
    Moment(
      id: 'moment_005',
      creatorId: 'ananya',
      creatorUsername: 'Ananya',
      mediaUrl: 'demo://moment_005',
      mediaType: 'image',
      label: null,
      createdAt: DateTime(2026, 8, 29),
      expiresAt: DateTime(2026, 8, 30),
    ),
  ];

  bool _loaded = false;

  List<Moment> get moments => List.unmodifiable(_moments);

  Future<void> _ensureLoaded() async {
    if (_loaded) return;

    final prefs = await SharedPreferences.getInstance();
    final savedMoments = prefs.getStringList(_storageKey) ?? [];

    for (final jsonString in savedMoments) {
      try {
        final map = jsonDecode(jsonString) as Map<String, dynamic>;

        final id = map['id'] as String;

        // Don't duplicate a saved Moment.
        if (_moments.any((moment) => moment.id == id)) {
          continue;
        }

        _moments.insert(
          0,
          Moment(
            id: id,
            creatorId: map['creatorId'] as String,
            creatorUsername: map['creatorUsername'] as String,
            mediaUrl: map['mediaUrl'] as String,
            mediaType: map['mediaType'] as String,
            label: null,
            createdAt: DateTime.parse(map['createdAt'] as String),
            expiresAt: DateTime.parse(map['expiresAt'] as String),
            isViewed: map['isViewed'] as bool? ?? false,
          ),
        );
      } catch (_) {
        // Ignore malformed saved Moments.
      }
    }

    _loaded = true;
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();

    final savedMoments = _moments
        .where((moment) => !moment.mediaUrl.startsWith('demo://'))
        .map(
          (moment) => jsonEncode({
            'id': moment.id,
            'creatorId': moment.creatorId,
            'creatorUsername': moment.creatorUsername,
            'mediaUrl': moment.mediaUrl,
            'mediaType': moment.mediaType,
            'createdAt': moment.createdAt.toIso8601String(),
            'expiresAt': moment.expiresAt.toIso8601String(),
            'isViewed': moment.isViewed,
          }),
        )
        .toList();

    await prefs.setStringList(_storageKey, savedMoments);
  }

  Future<List<Moment>> fetchMoments() async {
    await _ensureLoaded();
    return List.unmodifiable(_moments);
  }

  Future<Moment?> getMomentById(String momentId) async {
    await _ensureLoaded();

    for (final moment in _moments) {
      if (moment.id == momentId) {
        return moment;
      }
    }

    return null;
  }

  Future<void> createMoment(Moment moment) async {
    await _ensureLoaded();

    _moments.insert(0, moment);
    await _save();
  }

  Future<void> updateMoment(Moment updatedMoment) async {
    await _ensureLoaded();

    final index = _moments.indexWhere(
      (moment) => moment.id == updatedMoment.id,
    );

    if (index == -1) return;

    _moments[index] = updatedMoment;
    await _save();
  }

  Future<void> deleteMoment(String momentId) async {
    await _ensureLoaded();

    _moments.removeWhere((moment) => moment.id == momentId);
    await _save();
  }

  Future<void> markAsViewed(String momentId) async {
    await _ensureLoaded();

    final index = _moments.indexWhere((moment) => moment.id == momentId);

    if (index == -1) return;

    final moment = _moments[index];

    _moments[index] = Moment(
      id: moment.id,
      creatorId: moment.creatorId,
      creatorUsername: moment.creatorUsername,
      mediaUrl: moment.mediaUrl,
      mediaType: moment.mediaType,
      label: moment.label,
      createdAt: moment.createdAt,
      expiresAt: moment.expiresAt,
      isViewed: true,
    );

    await _save();
  }
}
