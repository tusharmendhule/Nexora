import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import 'user_profile_screen.dart';
import '../models/comment.dart';
import '../services/comment_service.dart';
import '../services/user_service.dart';

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
  final UserService _userService = UserService();

  final Map<String, bool> _likedComments = {};
  final Map<String, int> _commentLikeCounts = {};
  final Map<String, List<Comment>> _replies = {};

  List<Comment> comments = [];
  List<String> times = [];
  bool isLoading = true;
  String _currentUserId = '';

  Comment? _replyingTo;

  @override
  void initState() {
    super.initState();
    _loadCurrentUser();
    _loadComments();
  }

  Future<void> _loadCurrentUser() async {
    final id = await _userService.getCurrentUserId();
    if (!mounted) return;
    setState(() {
      _currentUserId = id ?? '';
    });
  }

  Future<void> _loadComments() async {
    final loadedComments = await _commentService.fetchComments(
      widget.contentId,
    );

    if (!mounted) return;

    setState(() {
      comments = loadedComments;

      times = loadedComments.map((c) {
        final diff = DateTime.now().difference(c.createdAt);
        if (diff.inMinutes < 1) return 'now';
        if (diff.inMinutes < 60) return '${diff.inMinutes}m';
        if (diff.inHours < 24) return '${diff.inHours}h';
        return '${diff.inDays}d';
      }).toList();

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

    final createdComment = await _commentService.createComment(
      postId: widget.contentId,
      text: text,
      parentCommentId: parent?.id,
    );

    if (!mounted) return;

    if (createdComment != null) {
      setState(() {
        if (parent == null) {
          comments.insert(0, createdComment);
          times.insert(0, 'now');
        }

        _replyingTo = null;
        _controller.clear();
      });
    } else {
      _showMessage('Could not post comment. Please try again.');
    }

    _focusNode.unfocus();
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<void> _deleteComment(Comment comment) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: context.nexora.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
        ),
        title: Text(
          'Delete comment',
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        content: Text(
          'Are you sure you want to delete this comment?',
          style: TextStyle(
            color: context.nexora.textSecondary,
            fontSize: 14,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              'Cancel',
              style: TextStyle(color: context.nexora.textMuted),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              'Delete',
              style: TextStyle(
                color: Color(0xFFE74C3C),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    final deleted = await _commentService.deleteComment(comment.id);

    if (!mounted) return;

    if (!deleted) {
      _showMessage('Could not delete comment. Please try again.');
      return;
    }

    setState(() {
      comments.removeWhere((c) => c.id == comment.id);
      times.removeWhere((t) => t == 'now');
    });

    _showMessage('Comment deleted');
  }

  Future<void> _toggleCommentLike(Comment comment) async {
    // Comment-level likes are not supported by the current backend API.
    // Toggle the local visual state as a placeholder until backend support is added.
    if (!mounted) return;

    setState(() {
      final currentlyLiked = _likedComments[comment.id] ?? false;
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
      backgroundColor: context.nexora.background,
      appBar: AppBar(
        backgroundColor: context.nexora.background,
        elevation: 0,
        centerTitle: true,
        title: Text(
          'Comments',
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: isLoading
          ? Center(child: CircularProgressIndicator(color: context.nexora.textPrimary))
          : Column(
              children: [
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
                    itemCount: comments.length,
                    separatorBuilder: (_, __) => SizedBox(height: 18),
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
                    color: context.nexora.sheet,
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Replying to ${_replyingTo!.authorUsername}',
                            style: TextStyle(
                              color: context.nexora.textSecondary,
                              fontSize: 11,
                            ),
                          ),
                        ),
                        GestureDetector(
                          onTap: _cancelReply,
                          child: Icon(
                            Icons.close,
                            color: context.nexora.textMuted,
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
                        CircleAvatar(
                          radius: 18,
                          backgroundColor: Color(0xFF6C63FF),
                          child: Icon(
                            Icons.person,
                            color: context.nexora.textPrimary,
                            size: 18,
                          ),
                        ),
                        SizedBox(width: 10),
                        Expanded(
                          child: TextField(
                            controller: _controller,
                            focusNode: _focusNode,
                            style: TextStyle(
                              color: context.nexora.textPrimary,
                              fontSize: 13,
                            ),
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _submitComment(),
                            decoration: InputDecoration(
                              hintText: _replyingTo == null
                                  ? 'Add a comment...'
                                  : 'Write a reply...',
                              hintStyle: TextStyle(
                                color: context.nexora.textHint,
                                fontSize: 13,
                              ),
                              filled: true,
                              fillColor: context.nexora.card,
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
                        SizedBox(width: 8),
                        IconButton(
                          onPressed: _submitComment,
                          icon: Icon(
                            Icons.send_outlined,
                            color: context.nexora.textPrimary,
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
    final isOwner = _currentUserId.isNotEmpty && comment.authorId == _currentUserId;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: isYou ? null : () => _openProfile(username),
          child: CircleAvatar(
            radius: 20,
            backgroundColor: Color(0xFF6C63FF),
            child: Icon(Icons.person, color: context.nexora.textPrimary, size: 20),
          ),
        ),
        SizedBox(width: 11),
        Expanded(
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 11),
            decoration: BoxDecoration(
              color: context.nexora.card,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    GestureDetector(
                      onTap: isYou ? null : () => _openProfile(username),
                      child: Text(
                        username,
                        style: TextStyle(
                          color: context.nexora.textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const Spacer(),
                    if (isOwner)
                      GestureDetector(
                        onTap: () => _deleteComment(comment),
                        child: Icon(
                          Icons.delete_outline,
                          color: context.nexora.textMuted,
                          size: 16,
                        ),
                      ),
                  ],
                ),
                SizedBox(height: 5),
                Text(
                  comment.text,
                  style: TextStyle(
                    color: context.nexora.textSecondary,
                    fontSize: 13,
                    height: 1.35,
                  ),
                ),
                SizedBox(height: 7),
                Row(
                  children: [
                    Text(
                      time,
                      style: TextStyle(
                        color: context.nexora.textHint,
                        fontSize: 10,
                      ),
                    ),
                    SizedBox(width: 15),
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
                                ? context.nexora.textPrimary
                                : context.nexora.textMuted,
                            size: 13,
                          ),
                          SizedBox(width: 4),
                          Text(
                            ((_commentLikeCounts[comment.id] ??
                                        comment.likeCount) >
                                    0)
                                ? '${_commentLikeCounts[comment.id] ?? comment.likeCount}'
                                : 'Like',
                            style: TextStyle(
                              color: context.nexora.textMuted,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (showReplyButton) ...[
                      SizedBox(width: 15),
                      GestureDetector(
                        onTap: () => _startReply(comment),
                        child: Text(
                          'Reply',
                          style: TextStyle(
                            color: context.nexora.textMuted,
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
