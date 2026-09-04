import 'package:flutter/material.dart';

import '../models/moment.dart';
import '../screens/moments_screen.dart';
import '../services/moment_service.dart';

/// Grid of the active moments (stories) created by [userId], shown on the
/// profile "Memories" tab. Tapping a tile opens the full moments viewer
/// limited to that user.
class ProfileMomentsGrid extends StatefulWidget {
  final String userId;

  /// Shown when the user has no active moments.
  final String emptyMessage;

  const ProfileMomentsGrid({
    super.key,
    required this.userId,
    this.emptyMessage = 'No active memories.',
  });

  @override
  State<ProfileMomentsGrid> createState() => ProfileMomentsGridState();
}

class ProfileMomentsGridState extends State<ProfileMomentsGrid> {
  final MomentService _momentService = MomentService();

  List<Moment> _moments = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;

    setState(() => _loading = true);

    final moments = await _momentService.fetchMoments(
      authorId: widget.userId,
    );

    // Defensive: only ever render this user's own moments, even if the
    // server is temporarily ignoring the authorId filter.
    final ownMoments = moments
        .where((m) => m.creatorId == widget.userId)
        .toList();

    if (!mounted) return;

    setState(() {
      _moments = ownMoments;
      _loading = false;
    });
  }

  /// Called by parents (e.g. when the user returns to this tab) to refetch.
  Future<void> reload() => _load();

  bool _isNetworkUrl(String url) {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 48),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_moments.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
        child: Column(
          children: [
            Icon(
              Icons.history_outlined,
              size: 42,
              color: Theme.of(context).hintColor,
            ),
            const SizedBox(height: 12),
            Text(
              widget.emptyMessage,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Theme.of(context).hintColor,
                fontSize: 13,
              ),
            ),
          ],
        ),
      );
    }

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 3,
        crossAxisSpacing: 3,
      ),
      itemCount: _moments.length,
      itemBuilder: (context, index) {
        final moment = _moments[index];
        return _tile(moment, index);
      },
    );
  }

  Widget _tile(Moment moment, int index) {
    return GestureDetector(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => MomentsScreen(
              authorId: widget.userId,
              initialIndex: index,
            ),
          ),
        );
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (moment.mediaType == 'image' &&
                _isNetworkUrl(moment.mediaUrl))
              Image.network(
                moment.mediaUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _tilePlaceholder(moment),
              )
            else
              _tilePlaceholder(moment),
            if (moment.mediaType == 'video')
              const Center(
                child: Icon(
                  Icons.play_circle_fill,
                  color: Colors.white70,
                  size: 30,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _tilePlaceholder(Moment moment) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0891B2), Color(0xFF3157D5)],
        ),
      ),
      child: const Center(
        child: Icon(
          Icons.auto_awesome,
          color: Colors.white70,
          size: 26,
        ),
      ),
    );
  }
}
