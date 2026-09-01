import 'package:flutter/material.dart';

import 'userprofile.dart';
import '../models/comment.dart';
import '../services/comment_service.dart';
import '../services/like_service.dart';

class CommentsScreen extends StatefulWidget {
  final String username;
  final String contentId;

  const CommentsScreen({
    super.key,
    required this.username,
    this.contentId = 'demo_content',
  });

  @override
  State<CommentsScreen> createState() => _CommentsScreenState();
}

class _CommentsScreenState extends State<CommentsScreen> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  final CommentService _commentService = CommentService();
  final LikeService _likeService = LikeService();

  static const String currentUserId = 'user_you';

  final Map<String, bool> _likedComments = {};
  final Map<String, int> _commentLikeCounts = {};
  final Map<String, List<Comment>> _replies = {};

  List<Comment> comments = [];
  List<String> times = [];
  bool isLoading = true;

  Comment? _replyingTo;

  @override
  void initState() {
    super.initState();
    _loadComments();
  }

  Future<void> _loadComments() async {
    final loadedComments = await _commentService.fetchComments(
      widget.contentId,
    );

    final loadedReplies = <String, List<Comment>>{};

    for (final comment in loadedComments) {
      loadedReplies[comment.id] = await _commentService.fetchReplies(
        comment.id,
      );
    }

    if (!mounted) return;

    setState(() {
      comments = loadedComments;
      _replies
        ..clear()
        ..addAll(loadedReplies);

      times = List.generate(
        loadedComments.length,
        (index) => index == 0
            ? '2m'
            : index == 1
            ? '8m'
            : index == 2
            ? '14m'
            : 'now',
      );

      isLoading = false;
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _startReply(Comment comment) {
    setState(() {
      _replyingTo = comment;
    });

    _focusNode.requestFocus();
  }

  void _cancelReply() {
    setState(() {
      _replyingTo = null;
      _controller.clear();
    });

    _focusNode.unfocus();
  }

  Future<void> _submitComment() async {
    final text = _controller.text.trim();

    if (text.isEmpty) return;

    final parent = _replyingTo;

    final comment = Comment(
      id: 'comment_${DateTime.now().microsecondsSinceEpoch}',
      contentId: widget.contentId,
      authorId: currentUserId,
      authorUsername: 'You',
      text: text,
      parentCommentId: parent?.id,
      createdAt: DateTime.now(),
    );

    await _commentService.addComment(comment);

    if (!mounted) return;

    setState(() {
      if (parent == null) {
        comments.insert(0, comment);
        times.insert(0, 'now');
      } else {
        _replies.putIfAbsent(parent.id, () => []);
        _replies[parent.id]!.add(comment);
      }

      _replyingTo = null;
      _controller.clear();
    });

    _focusNode.unfocus();
  }

  Future<void> _toggleCommentLike(Comment comment) async {
    final currentlyLiked = await _likeService.isLiked(
      userId: currentUserId,
      contentId: comment.id,
      contentType: 'comment',
    );

    if (currentlyLiked) {
      await _likeService.unlike(
        userId: currentUserId,
        contentId: comment.id,
        contentType: 'comment',
      );
    } else {
      await _likeService.like(
        userId: currentUserId,
        contentId: comment.id,
        contentType: 'comment',
      );
    }

    if (!mounted) return;

    setState(() {
      final newLikedState = !currentlyLiked;
      _likedComments[comment.id] = newLikedState;

      final currentCount = _commentLikeCounts[comment.id] ?? comment.likeCount;

      _commentLikeCounts[comment.id] = newLikedState
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
      backgroundColor: const Color(0xFF0B0B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0B1A),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Comments',
          style: TextStyle(
            color: Colors.white,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : Column(
              children: [
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
                    itemCount: comments.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 18),
                    itemBuilder: (context, index) {
                      final comment = comments[index];

                      return Column(
                        children: [
                          _commentTile(
                            comment,
                            index < times.length ? times[index] : 'now',
                            showReplyButton: true,
                          ),
                          if ((_replies[comment.id] ?? []).isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(left: 42, top: 10),
                              child: Column(
                                children: _replies[comment.id]!
                                    .map(
                                      (reply) => Padding(
                                        padding: const EdgeInsets.only(
                                          bottom: 10,
                                        ),
                                        child: _commentTile(
                                          reply,
                                          'now',
                                          showReplyButton: false,
                                        ),
                                      ),
                                    )
                                    .toList(),
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                ),
                if (_replyingTo != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
                    color: const Color(0xFF11162B),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Replying to ${_replyingTo!.authorUsername}',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 11,
                            ),
                          ),
                        ),
                        GestureDetector(
                          onTap: _cancelReply,
                          child: const Icon(
                            Icons.close,
                            color: Colors.white54,
                            size: 18,
                          ),
                        ),
                      ],
                    ),
                  ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
                    child: Row(
                      children: [
                        const CircleAvatar(
                          radius: 18,
                          backgroundColor: Color(0xFF6C63FF),
                          child: Icon(
                            Icons.person,
                            color: Colors.white,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextField(
                            controller: _controller,
                            focusNode: _focusNode,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                            ),
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _submitComment(),
                            decoration: InputDecoration(
                              hintText: _replyingTo == null
                                  ? 'Add a comment...'
                                  : 'Write a reply...',
                              hintStyle: const TextStyle(
                                color: Colors.white38,
                                fontSize: 13,
                              ),
                              filled: true,
                              fillColor: const Color(0xFF171D35),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(22),
                                borderSide: BorderSide.none,
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 11,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          onPressed: _submitComment,
                          icon: const Icon(
                            Icons.send_outlined,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _commentTile(
    Comment comment,
    String time, {
    required bool showReplyButton,
  }) {
    final username = comment.authorUsername;
    final isYou = username == 'You';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: isYou ? null : () => _openProfile(username),
          child: const CircleAvatar(
            radius: 20,
            backgroundColor: Color(0xFF6C63FF),
            child: Icon(Icons.person, color: Colors.white, size: 20),
          ),
        ),
        const SizedBox(width: 11),
        Expanded(
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 11),
            decoration: BoxDecoration(
              color: const Color(0xFF171D35),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  onTap: isYou ? null : () => _openProfile(username),
                  child: Text(
                    username,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  comment.text,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 13,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 7),
                Row(
                  children: [
                    Text(
                      time,
                      style: const TextStyle(
                        color: Colors.white38,
                        fontSize: 10,
                      ),
                    ),
                    const SizedBox(width: 15),
                    GestureDetector(
                      onTap: () => _toggleCommentLike(comment),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _likedComments[comment.id] == true
                                ? Icons.favorite
                                : Icons.favorite_border,
                            color: _likedComments[comment.id] == true
                                ? Colors.white
                                : Colors.white54,
                            size: 13,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            ((_commentLikeCounts[comment.id] ??
                                        comment.likeCount) >
                                    0)
                                ? '${_commentLikeCounts[comment.id] ?? comment.likeCount}'
                                : 'Like',
                            style: const TextStyle(
                              color: Colors.white54,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (showReplyButton) ...[
                      const SizedBox(width: 15),
                      GestureDetector(
                        onTap: () => _startReply(comment),
                        child: const Text(
                          'Reply',
                          style: TextStyle(
                            color: Colors.white54,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
