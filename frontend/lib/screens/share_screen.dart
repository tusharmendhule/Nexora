import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/user.dart';
import '../services/message_service.dart';
import '../services/user_service.dart';

/// Share screen with REAL users from MongoDB and REAL message delivery.
///
/// The user list is fetched from the backend (`GET /api/v1/users`, with
/// debounced search via `?q=`). Selecting users sends an actual Message
/// (type 'share') through the existing messaging system — Socket.IO
/// delivers it to the recipient in real time.
class ShareScreen extends StatefulWidget {
  /// MongoDB _id of the post being shared (null → plain text share).
  final String? postId;
  final String postText;
  final String postAuthor;

  /// Optional image URL of the post (used only for the copy-link label).
  final String? postImageUrl;

  const ShareScreen({
    super.key,
    this.postId,
    this.postText = '',
    this.postAuthor = '',
    this.postImageUrl,
  });

  @override
  State<ShareScreen> createState() => _ShareScreenState();
}

class _ShareScreenState extends State<ShareScreen> {
  final TextEditingController _searchController = TextEditingController();
  final Set<String> selectedUserIds = {};
  final Set<String> selectedUsernames = {};

  final UserService _userService = UserService();
  final MessageService _messageService = MessageService();

  List<User> users = [];
  bool isLoading = true;
  String? loadError;
  bool isSending = false;

  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers({String? query}) async {
    setState(() {
      isLoading = true;
      loadError = null;
    });

    try {
      final fetched = await _userService.fetchAllUsers(query: query);
      if (!mounted) return;
      setState(() {
        users = fetched;
        isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        isLoading = false;
        loadError = 'Could not load users. Please try again.';
      });
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    final query = value.trim();

    if (query.isEmpty) {
      _loadUsers();
      return;
    }

    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      _loadUsers(query: query);
    });
  }

  void _toggleUser(User user) {
    setState(() {
      if (selectedUserIds.contains(user.id)) {
        selectedUserIds.remove(user.id);
        selectedUsernames.remove(user.username);
      } else {
        selectedUserIds.add(user.id);
        selectedUsernames.add(user.username);
      }
    });
  }

  Future<void> _copyLink() async {
    if (widget.postId == null || widget.postId!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nothing to copy')),
      );
      return;
    }

    final link = '${_appOrigin()}/post/${widget.postId}';
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Post link copied: $link')),
    );
  }

  String _appOrigin() {
    if (Uri.base.hasScheme) return Uri.base.origin;
    return 'https://nexora.app';
  }

  Future<void> _send() async {
    if (selectedUserIds.isEmpty || isSending) return;

    // Capture recipients before sending — the selection clears on success
    final recipientIds = selectedUserIds.toList();
    final recipientNames = selectedUsernames.toList();

    setState(() {
      isSending = true;
    });

    final shareText = widget.postId != null
        ? 'Shared a post'
        : (widget.postText.isNotEmpty
            ? 'Check out: ${widget.postText}'
            : (widget.postAuthor.isNotEmpty
                ? 'Check out ${widget.postAuthor} on Nexora'
                : 'Shared with you on Nexora'));

    var sentCount = 0;
    var failedCount = 0;

    for (final recipientId in recipientIds) {
      final message = await _messageService.sharePost(
        recipientId: recipientId,
        postId: widget.postId,
        text: shareText,
      );
      if (message != null) {
        sentCount++;
      } else {
        failedCount++;
      }
    }

    if (!mounted) return;

    setState(() {
      isSending = false;
      if (failedCount == 0) {
        selectedUserIds.clear();
        selectedUsernames.clear();
      }
    });

    if (failedCount > 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            failedCount == sentCount
                ? 'Could not send. Please try again.'
                : 'Sent to $sentCount user(s); $failedCount failed.',
          ),
        ),
      );
    } else if (sentCount == 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            recipientNames.isNotEmpty
                ? 'Sent to ${recipientNames.first}'
                : 'Sent',
          ),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Sent to $sentCount user(s)')),
      );
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0B1A),
        elevation: 0,
        title: const Text(
          'Share',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w700,
          ),
        ),
        centerTitle: true,
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search people',
                hintStyle: const TextStyle(color: Colors.white38),
                prefixIcon: const Icon(Icons.search, color: Colors.white54),
                filled: true,
                fillColor: const Color(0xFF171D35),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),

          const Padding(
            padding: EdgeInsets.fromLTRB(18, 0, 18, 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Send to',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),

          Expanded(child: _buildUserList()),

          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
              child: Column(
                children: [
                  OutlinedButton.icon(
                    onPressed: _copyLink,
                    icon: const Icon(Icons.link, color: Colors.white70),
                    label: const Text(
                      'Copy link',
                      style: TextStyle(color: Colors.white70),
                    ),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 48),
                      side: BorderSide(color: Colors.white.withOpacity(0.12)),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: (selectedUserIds.isEmpty || isSending)
                          ? null
                          : _send,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3157D5),
                        disabledBackgroundColor: const Color(0xFF20243A),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: isSending
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              selectedUserIds.isEmpty
                                  ? 'Select people'
                                  : 'Send (${selectedUserIds.length})',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
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

  Widget _buildUserList() {
    if (isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }

    if (loadError != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.wifi_off, color: Colors.white24, size: 40),
            const SizedBox(height: 12),
            Text(
              loadError!,
              style: const TextStyle(color: Colors.white54, fontSize: 14),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => _loadUsers(
                query: _searchController.text.trim().isEmpty
                    ? null
                    : _searchController.text.trim(),
              ),
              child: const Text(
                'Retry',
                style: TextStyle(color: Color(0xFF6C8CFF), fontSize: 14),
              ),
            ),
          ],
        ),
      );
    }

    if (users.isEmpty) {
      return const Center(
        child: Text(
          'No users found',
          style: TextStyle(color: Colors.white54, fontSize: 14),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: users.length,
      itemBuilder: (context, index) {
        final user = users[index];
        final selected = selectedUserIds.contains(user.id);

        return GestureDetector(
          onTap: () => _toggleUser(user),
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 10,
            ),
            decoration: BoxDecoration(
              color: selected
                  ? const Color(0xFF20294A)
                  : const Color(0xFF171D35),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: selected
                    ? const Color(0xFF3157D5)
                    : Colors.transparent,
              ),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: const Color(0xFF6C63FF),
                  backgroundImage:
                      (user.profileImageUrl != null && user.profileImageUrl!.isNotEmpty)
                          ? NetworkImage(user.profileImageUrl!)
                          : null,
                  child: (user.profileImageUrl == null ||
                          user.profileImageUrl!.isEmpty)
                      ? const Icon(Icons.person, color: Colors.white)
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.displayName?.isNotEmpty == true
                            ? user.displayName!
                            : user.username,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '@${user.username}',
                        style: const TextStyle(
                          color: Colors.white38,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  selected
                      ? Icons.check_circle
                      : Icons.radio_button_unchecked,
                  color: selected
                      ? const Color(0xFF6C63FF)
                      : Colors.white38,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}