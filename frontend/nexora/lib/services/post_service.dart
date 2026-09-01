import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/post.dart';
import '../models/nexora_label.dart';

class PostService {
  static const String _storageKey = 'nexora_posts';

  final List<Post> _posts = [];
  bool _loaded = false;

  List<Post> get posts => List.unmodifiable(_posts);

  Future<void> _ensureLoaded() async {
    if (_loaded) return;

    final prefs = await SharedPreferences.getInstance();
    final savedPosts = prefs.getStringList(_storageKey) ?? [];

    _posts.clear();

    for (final jsonString in savedPosts) {
      try {
        final map = jsonDecode(jsonString) as Map<String, dynamic>;

        _posts.add(
          Post(
            id: map['id'] as String,
            authorId: map['authorId'] as String,
            authorUsername: map['authorUsername'] as String,
            text: map['text'] as String?,
            mediaUrl: map['mediaUrl'] as String?,
            contentType: map['contentType'] as String,
            label: NexoraLabel.editedContent,
            likeCount: map['likeCount'] as int? ?? 0,
            commentCount: map['commentCount'] as int? ?? 0,
            repostCount: map['repostCount'] as int? ?? 0,
            isLiked: map['isLiked'] as bool? ?? false,
            isSaved: map['isSaved'] as bool? ?? false,
            isReposted: map['isReposted'] as bool? ?? false,
            createdAt: DateTime.parse(map['createdAt'] as String),
          ),
        );
      } catch (_) {
        // Ignore malformed saved posts.
      }
    }

    _loaded = true;
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();

    final savedPosts = _posts.map((post) {
      return jsonEncode({
        'id': post.id,
        'authorId': post.authorId,
        'authorUsername': post.authorUsername,
        'text': post.text,
        'mediaUrl': post.mediaUrl,
        'contentType': post.contentType,
        'label': post.label.name,
        'likeCount': post.likeCount,
        'commentCount': post.commentCount,
        'repostCount': post.repostCount,
        'isLiked': post.isLiked,
        'isSaved': post.isSaved,
        'isReposted': post.isReposted,
        'createdAt': post.createdAt.toIso8601String(),
      });
    }).toList();

    await prefs.setStringList(_storageKey, savedPosts);
  }

  Future<List<Post>> fetchPosts() async {
    await _ensureLoaded();
    return List.unmodifiable(_posts);
  }

  Future<Post?> getPostById(String postId) async {
    await _ensureLoaded();

    for (final post in _posts) {
      if (post.id == postId) {
        return post;
      }
    }

    return null;
  }

  Future<void> createPost(Post post) async {
    await _ensureLoaded();

    _posts.insert(0, post);
    await _save();
  }

  Future<void> updatePost(Post updatedPost) async {
    await _ensureLoaded();

    final index = _posts.indexWhere((post) => post.id == updatedPost.id);

    if (index == -1) return;

    _posts[index] = updatedPost;
    await _save();
  }

  Future<void> deletePost(String postId) async {
    await _ensureLoaded();

    _posts.removeWhere((post) => post.id == postId);

    await _save();
  }
}
