import 'package:flutter/material.dart';

import '../models/post.dart';
import '../services/post_service.dart';

/// Instagram-style grid of every post created by [userId].
///
/// Image posts show their media, video/audio/text posts show a labelled tile.
/// Pull down to refresh. Tapping a tile opens a quick full-screen view.
class ProfilePostGrid extends StatefulWidget {
  final String userId;

  /// Shown when the user hasn't published anything yet.
  final String emptyMessage;

  const ProfilePostGrid({
    super.key,
    required this.userId,
    this.emptyMessage = 'No posts yet.',
  });

  @override
  State<ProfilePostGrid> createState() => ProfilePostGridState();
}

class ProfilePostGridState extends State<ProfilePostGrid> {
  final PostService _postService = PostService();

  List<Post> _posts = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;

    setState(() => _loading = true);

    final result = await _postService.fetchPosts(
      authorId: widget.userId,
      page: 1,
      limit: 60,
    );
    final posts = result['posts'] as List<Post>? ?? [];

    // Defensive: only ever render this user's own posts, even if the server
    // is temporarily ignoring the authorId filter.
    final ownPosts = posts
        .where((p) => p.authorId == widget.userId)
        .toList();

    if (!mounted) return;

    setState(() {
      _posts = ownPosts;
      _loading = false;
    });
  }

  /// Called by parents (e.g. when the user returns to this tab or after
  /// publishing a new post) to refetch the grid.
  Future<void> reload() => _load();

  /// Best thumbnail URL for a grid tile (image media → its URL, video →
  /// its thumbnail, otherwise null).
  String? _tileUrl(Post post) {
    final items = post.mediaItems ?? const <Map<String, dynamic>>[];
    for (final item in items) {
      if (item['type'] == 'image') {
        final url = item['url']?.toString();
        if (url != null && url.isNotEmpty) return url;
      }
    }
    for (final item in items) {
      final thumb = item['thumbnailUrl']?.toString();
      if (thumb != null && thumb.isNotEmpty) return thumb;
    }
    if (post.contentType == 'image') return post.mediaUrl;
    return null;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 48),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_posts.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
        child: Column(
          children: [
            Icon(
              Icons.grid_view_outlined,
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
      itemCount: _posts.length,
      itemBuilder: (context, index) => _tile(_posts[index]),
    );
  }

  Widget _tile(Post post) {
    final url = _tileUrl(post);

    return GestureDetector(
      onTap: () => _openPost(post),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (url != null)
              Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _tilePlaceholder(post),
              )
            else
              _tilePlaceholder(post),
            if (url != null && post.contentType == 'video')
              const Center(
                child: Icon(
                  Icons.play_circle_fill,
                  color: Colors.white70,
                  size: 28,
                ),
              ),
            if (url != null && post.likeCount > 0)
              Positioned(
                right: 6,
                bottom: 6,
                child: Row(
                  children: [
                    const Icon(
                      Icons.favorite,
                      color: Colors.white,
                      size: 13,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      _compact(post.likeCount),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        shadows: [
                          Shadow(color: Colors.black54, blurRadius: 3),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _tilePlaceholder(Post post) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _postTypeIcon(post.contentType),
              color: Colors.white,
              size: 26,
            ),
            const SizedBox(height: 4),
            if (post.text != null && post.text!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Text(
                  post.text!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  IconData _postTypeIcon(String contentType) {
    switch (contentType) {
      case 'video':
        return Icons.videocam_outlined;
      case 'audio':
        return Icons.music_note;
      case 'link':
        return Icons.link;
      default:
        return Icons.article_outlined;
    }
  }

  String _compact(int count) {
    if (count >= 1000) {
      return '${(count / 1000).toStringAsFixed(1)}K';
    }
    return '$count';
  }

  void _openPost(Post post) {
    final url = _tileUrl(post);

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => Scaffold(
          backgroundColor: const Color(0xFF0B0E14),
          appBar: AppBar(
            backgroundColor: const Color(0xFF0B0E14),
            foregroundColor: Colors.white,
            title: Text(
              '@${post.authorUsername}',
              style: const TextStyle(fontSize: 16),
            ),
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (url != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Image.network(
                      url,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  ),
                if (post.text != null && post.text!.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(
                    post.text!,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      height: 1.4,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  children: [
                    const Icon(Icons.favorite, color: Colors.white70, size: 16),
                    const SizedBox(width: 5),
                    Text(
                      '${post.likeCount}',
                      style: const TextStyle(color: Colors.white70),
                    ),
                    const SizedBox(width: 16),
                    const Icon(Icons.chat_bubble_outline,
                        color: Colors.white70, size: 15),
                    const SizedBox(width: 5),
                    Text(
                      '${post.commentCount}',
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
