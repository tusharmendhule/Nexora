import 'dart:async';

import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import '../models/conversation.dart';
import '../models/user.dart';
import '../services/conversation_service.dart';
import '../services/socket_service.dart';
import '../services/user_service.dart';
import 'chat_screen.dart';

class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  final ConversationService _conversationService = ConversationService();
  final UserService _userService = UserService();
  final SocketService _socketService = SocketService();

  final TextEditingController _searchController = TextEditingController();

  List<Conversation> conversations = [];
  bool isLoading = true;
  String? loadError;

  // ─── Search state ────────────────────────────────────
  Timer? _searchDebounce;
  bool _isSearchActive = false;
  bool _isSearchLoading = false;
  String? _searchError;
  List<Conversation> _searchConversations = [];
  List<User> _searchUsers = [];

  // ─── Socket subscriptions ────────────────────────────
  StreamSubscription? _newMsgSub;
  StreamSubscription? _readSub;
  StreamSubscription? _deletedSub;
  StreamSubscription? _clearedSub;

  @override
  void initState() {
    super.initState();
    _loadConversations();
    _setupSocket();
  }

  Future<void> _loadConversations() async {
    setState(() {
      isLoading = true;
      loadError = null;
    });

    try {
      final loaded = await _conversationService.fetchConversations();
      if (!mounted) return;
      setState(() {
        conversations = loaded;
        isLoading = false;
      });
      _applyLocalSearchFilter();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        isLoading = false;
        loadError = e.toString();
      });
    }
  }

  /// Silent background refresh used after socket events / returning from a chat.
  Future<void> _refreshConversations() async {
    try {
      final loaded = await _conversationService.fetchConversations();
      if (!mounted) return;
      setState(() {
        conversations = loaded;
        loadError = null;
      });
      _applyLocalSearchFilter();
    } catch (_) {
      // Keep the last known list — the next socket event or manual
      // reload will retry. Never fake data here.
    }
  }

  void _setupSocket() {
    _socketService.connect();

    _newMsgSub = _socketService.newMessages.listen((_) => _refreshConversations());
    _readSub = _socketService.messagesRead.listen((_) => _refreshConversations());
    _deletedSub = _socketService.messageDeleted.listen((_) => _refreshConversations());
    _clearedSub = _socketService.conversationCleared.listen((_) => _refreshConversations());
  }

  // ─── Search ──────────────────────────────────────────

  void _onSearchChanged(String query) {
    _searchDebounce?.cancel();

    final trimmed = query.trim();

    if (trimmed.isEmpty) {
      setState(() {
        _isSearchActive = false;
        _isSearchLoading = false;
        _searchError = null;
        _searchConversations = [];
        _searchUsers = [];
      });
      return;
    }

    setState(() {
      _isSearchActive = true;
      _isSearchLoading = true;
      _searchError = null;
    });

    // Filter already-fetched real conversations locally (by participant
    // name/username and by latest message text).
    _applyLocalSearchFilter();

    // Debounce the real user search API call.
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      _searchUsersApi(trimmed);
    });
  }

  void _applyLocalSearchFilter() {
    if (!_isSearchActive) return;
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) {
      _searchConversations = [];
      return;
    }

    final filtered = conversations.where((c) {
      final name = c.otherName.toLowerCase();
      final username = c.otherUsername.toLowerCase();
      final lastMsg = (c.lastMessageText ?? '').toLowerCase();
      return name.contains(query) || username.contains(query) || lastMsg.contains(query);
    }).toList();

    if (mounted) {
      setState(() => _searchConversations = filtered);
    }
  }

  Future<void> _searchUsersApi(String query) async {
    try {
      final users = await _userService.searchUsers(query);
      if (!mounted) return;
      setState(() {
        _searchUsers = users;
        _isSearchLoading = false;
        _searchError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _searchUsers = [];
        _isSearchLoading = false;
        _searchError = 'Search failed. Please try again.';
      });
    }
  }

  void _openChat({
    required String otherUserId,
    required String username,
    String name = '',
    String avatarUrl = '',
  }) async {
    if (otherUserId.isEmpty) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ChatScreen(
          username: username,
          targetUserId: otherUserId,
          name: name,
          avatarUrl: avatarUrl,
        ),
      ),
    );
    // Refresh after returning — unread counts / ordering may have changed.
    if (mounted) _refreshConversations();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _newMsgSub?.cancel();
    _readSub?.cancel();
    _deletedSub?.cancel();
    _clearedSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.backgroundAlt,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 10),
              child: Container(
                height: 48,
                decoration: BoxDecoration(
                  color: context.nexora.field,
                  borderRadius: BorderRadius.circular(25),
                ),
                child: TextField(
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  style: TextStyle(color: context.nexora.textPrimary, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Search messages...',
                    hintStyle: TextStyle(color: context.nexora.textMuted, fontSize: 14),
                    prefixIcon: Icon(Icons.search, color: context.nexora.textSecondary),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ),

            Padding(
              padding: EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Messages',
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),

            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    // Search results (real users / matching conversations)
    if (_isSearchActive) {
      final resultCount = _searchConversations.length + _searchUsers.length;

      if (_isSearchLoading && resultCount == 0) {
        return Center(
          child: CircularProgressIndicator(color: context.nexora.textPrimary),
        );
      }

      if (_searchError != null && resultCount == 0) {
        return Center(
          child: Text(
            _searchError!,
            style: TextStyle(color: context.nexora.textMuted, fontSize: 14),
          ),
        );
      }

      if (resultCount == 0) {
        return Center(
          child: Text(
            'No users or conversations found',
            style: TextStyle(color: context.nexora.textMuted, fontSize: 14),
          ),
        );
      }

      return ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        itemCount: resultCount,
        itemBuilder: (context, index) {
          if (index < _searchConversations.length) {
            return _buildConversationTile(_searchConversations[index]);
          }
          final user = _searchUsers[index - _searchConversations.length];
          return _buildUserTile(user);
        },
      );
    }

    // Initial load
    if (isLoading) {
      return Center(
        child: CircularProgressIndicator(color: context.nexora.textPrimary),
      );
    }

    // Load error — never silently show an empty list
    if (loadError != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.wifi_off, color: context.nexora.textDim, size: 40),
            SizedBox(height: 12),
            Text(
              'Could not load conversations',
              style: TextStyle(color: context.nexora.textMuted, fontSize: 15),
            ),
            SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40),
              child: Text(
                loadError!,
                textAlign: TextAlign.center,
                style: TextStyle(color: context.nexora.textHint, fontSize: 12),
              ),
            ),
            SizedBox(height: 14),
            TextButton(
              onPressed: _loadConversations,
              child: Text(
                'Retry',
                style: TextStyle(color: Color(0xFF6C8CFF), fontSize: 14),
              ),
            ),
          ],
        ),
      );
    }

    // Empty state (existing UI)
    if (conversations.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.chat_bubble_outline,
              color: context.nexora.textDim,
              size: 48,
            ),
            SizedBox(height: 16),
            Text(
              'No conversations yet',
              style: TextStyle(
                color: context.nexora.textMuted,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'Start a conversation by messaging someone!',
              style: TextStyle(
                color: context.nexora.textHint,
                fontSize: 13,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      itemCount: conversations.length,
      itemBuilder: (context, index) =>
          _buildConversationTile(conversations[index]),
    );
  }

  Widget _buildConversationTile(Conversation conversation) {
    final bool unread = conversation.unreadCount > 0;

    return GestureDetector(
      onTap: () => _openChat(
        otherUserId: conversation.otherUserId,
        username: conversation.otherUsername,
        name: conversation.otherName,
        avatarUrl: conversation.otherAvatar,
      ),
      child: _messageTile(
        name: conversation.displayName,
        message: conversation.lastMessageText ?? '',
        time: _formatTime(conversation.lastMessageAt),
        unread: unread,
        avatarUrl: conversation.otherAvatar,
      ),
    );
  }

  Widget _buildUserTile(User user) {
    final name = user.displayName?.isNotEmpty == true
        ? user.displayName!
        : user.username;
    final avatarUrl = user.profileImageUrl ?? '';

    return GestureDetector(
      onTap: () => _openChat(
        otherUserId: user.id,
        username: user.username,
        name: user.displayName ?? '',
        avatarUrl: avatarUrl,
      ),
      child: _messageTile(
        name: name,
        message: '@${user.username}',
        time: '',
        unread: false,
        avatarUrl: avatarUrl,
      ),
    );
  }

  String _formatTime(DateTime? time) {
    if (time == null) return '';

    final difference = DateTime.now().difference(time);

    if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m';
    }

    if (difference.inHours < 24) {
      return '${difference.inHours}h';
    }

    if (difference.inDays < 7) {
      return '${difference.inDays}d';
    }

    return '${difference.inDays ~/ 7}w';
  }

  Widget _messageTile({
    required String name,
    required String message,
    required String time,
    required bool unread,
    String avatarUrl = '',
  }) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 3),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: context.nexora.surfaceSelected,
              border: Border.all(
                color: unread
                    ? const Color(0xFF3157D5)
                    : context.nexora.surfaceSubtle,
                width: 2,
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: avatarUrl.isNotEmpty
                ? Image.network(
                    avatarUrl,
                    width: 52,
                    height: 52,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) =>
                        Icon(Icons.person, color: context.nexora.textMuted, size: 26),
                  )
                : Icon(Icons.person, color: context.nexora.textMuted, size: 26),
          ),

          SizedBox(width: 13),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(height: 5),
                Text(
                  message,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: unread ? context.nexora.textSecondary : context.nexora.textHint,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),

          if (time.isNotEmpty || unread) ...[
            SizedBox(width: 8),

            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  time,
                  style: TextStyle(color: context.nexora.textMuted, fontSize: 11),
                ),
                SizedBox(height: 8),
                if (unread)
                  Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Color(0xFF5C7CFF),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}