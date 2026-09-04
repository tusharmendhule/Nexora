import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import 'package:image_picker/image_picker.dart';

import '../models/conversation.dart';
import '../models/message.dart';
import '../services/conversation_service.dart';
import '../services/message_service.dart';
import '../services/socket_service.dart';
import '../services/user_service.dart';
import 'user_profile_screen.dart';

class ChatScreen extends StatefulWidget {
  final String username;

  /// The MongoDB _id of the target user (preferred over username lookup).
  final String? targetUserId;

  /// Real display name of the target user (falls back to username).
  final String name;

  /// Real avatar URL of the target user (empty → default avatar).
  final String avatarUrl;

  const ChatScreen({
    super.key,
    required this.username,
    this.targetUserId,
    this.name = '',
    this.avatarUrl = '',
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  final ConversationService _conversationService = ConversationService();
  final MessageService _messageService = MessageService();
  final UserService _userService = UserService();
  final SocketService _socketService = SocketService();

  List<Message> messages = [];
  Conversation? conversation;
  bool isLoading = true;
  String? _loadError;
  String _currentUserId = '';
  String _targetUserId = '';
  bool _isSending = false;
  bool _isSendingImage = false;

  /// Real presence of the other user (null = unknown until checked).
  bool? _isOnline;

  final ImagePicker _picker = ImagePicker();

  /// Local bytes of optimistic image messages (keyed by temp message id)
  /// so they render instantly before the Cloudinary URL arrives.
  final Map<String, Uint8List> _pendingImages = {};

  StreamSubscription? _newMsgSub;
  StreamSubscription? _readSub;
  StreamSubscription? _deletedSub;
  StreamSubscription? _clearedSub;
  StreamSubscription? _presenceSub;

  @override
  void initState() {
    super.initState();
    _setupSocket();
    _loadChat();
  }

  Future<void> _loadChat() async {
    setState(() {
      isLoading = true;
      _loadError = null;
    });

    try {
      // Get current user ID
      final currentId = await _userService.getCurrentUserId();
      if (!mounted) return;
      _currentUserId = currentId ?? '';

      // Resolve target user ID
      if (widget.targetUserId != null && widget.targetUserId!.isNotEmpty) {
        _targetUserId = widget.targetUserId!;
      } else {
        // Look up by username
        final targetUser = await _userService.getUserByUsername(widget.username);
        if (!mounted) return;
        _targetUserId = targetUser?.id ?? '';
      }

      if (_targetUserId.isEmpty) {
        if (!mounted) return;
        setState(() {
          isLoading = false;
          _loadError = 'User not found';
        });
        return;
      }

      // Real presence — checked once on open, then kept fresh via socket
      _checkPresence();

      // Create or find conversation (backend prevents duplicates)
      final foundConversation =
          await _conversationService.createOrFindConversation(_targetUserId);

      if (foundConversation == null) {
        if (!mounted) return;
        setState(() {
          isLoading = false;
          _loadError = 'Could not open conversation';
        });
        return;
      }

      // Join the conversation room for real-time events
      _socketService.joinConversation(foundConversation.id);

      // Fetch real chat history
      final loadedMessages = await _messageService.fetchMessages(_targetUserId);

      if (!mounted) return;

      setState(() {
        conversation = foundConversation;
        messages = loadedMessages;
        isLoading = false;
      });

      // Mark messages as read (persists to backend)
      await _messageService.markAsRead(_targetUserId);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        isLoading = false;
        _loadError = e.toString();
      });
    }
  }

  void _setupSocket() {
    _socketService.connect();

    _newMsgSub = _socketService.newMessages.listen(_handleNewMessage);
    _readSub = _socketService.messagesRead.listen(_handleMessagesRead);
    _deletedSub = _socketService.messageDeleted.listen(_handleMessageDeleted);
    _clearedSub = _socketService.conversationCleared.listen(_handleConversationCleared);
    _presenceSub = _socketService.presence.listen(_handlePresence);
  }

  void _handlePresence(Map<String, dynamic> payload) {
    if (payload['userId']?.toString() != _targetUserId) return;
    if (!mounted) return;
    setState(() {
      _isOnline = payload['online'] == true;
    });
  }

  Future<void> _checkPresence() async {
    final online = await _messageService.checkPresence(_targetUserId);
    if (!mounted || online == null) return;
    setState(() {
      _isOnline = online;
    });
  }

  void _handleNewMessage(Map<String, dynamic> payload) {
    final messageData = payload['message'];
    if (messageData is! Map<String, dynamic>) return;

    final message = Message.fromJson(messageData);

    // Only handle messages belonging to this conversation
    final bool belongs = message.senderId == _targetUserId ||
        (message.senderId == _currentUserId && message.receiverId == _targetUserId);
    if (!belongs) return;

    // Duplicate prevention — the real MongoDB _id is the source of truth
    if (messages.any((m) => m.id == message.id)) return;

    if (!mounted) return;

    setState(() {
      if (message.senderId == _currentUserId) {
        // Our own message echoed back via the conversation room: the socket
        // event can beat the HTTP response, so replace the matching
        // optimistic message instead of appending a duplicate.
        final optimisticIdx = messages.indexWhere(
          (m) => m.id.startsWith('temp_') && m.text == message.text,
        );
        if (optimisticIdx != -1) {
          messages[optimisticIdx] = message;
          return;
        }
      }

      messages.add(message);
      if (conversation != null) {
        conversation = Conversation(
          id: conversation!.id,
          otherUserId: conversation!.otherUserId,
          otherUsername: conversation!.otherUsername,
          otherName: conversation!.otherName,
          otherAvatar: conversation!.otherAvatar,
          lastMessageText: message.text,
          lastMessageAt: message.createdAt,
          lastMessageSenderId: message.senderId,
          unreadCount: 0,
        );
      }
    });

    _scrollToBottomIfNear();

    // We're viewing the chat, so mark incoming messages as read immediately
    if (message.senderId == _targetUserId) {
      _messageService.markAsRead(_targetUserId);
    }
  }

  void _handleMessagesRead(Map<String, dynamic> payload) {
    // payload: { readBy, count } — the other user read our messages
    if (payload['readBy']?.toString() != _targetUserId) return;
    if (!mounted) return;

    setState(() {
      messages = messages
          .map((m) =>
              m.senderId == _currentUserId ? m.copyWith(isRead: true, status: 'read') : m)
          .toList();
    });
  }

  void _handleMessageDeleted(Map<String, dynamic> payload) {
    final messageId = payload['messageId']?.toString();
    if (messageId == null || messageId.isEmpty) return;
    if (!mounted) return;

    setState(() {
      messages.removeWhere((m) => m.id == messageId);
    });
  }

  void _handleConversationCleared(Map<String, dynamic> payload) {
    // The other user cleared the thread on their side
    if (payload['clearedBy']?.toString() != _targetUserId) return;
    if (!mounted) return;
    setState(() => messages.clear());
  }

  void _scrollToBottomIfNear() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.maxScrollExtent - position.pixels < 200) {
      _scrollController.jumpTo(position.maxScrollExtent);
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();

    if (text.isEmpty || _targetUserId.isEmpty || _isSending) {
      return;
    }

    // Clear input immediately for better UX
    _messageController.clear();

    setState(() {
      _isSending = true;
    });

    // Optimistically add the message to the list
    final optimisticMessage = Message(
      id: 'temp_${DateTime.now().millisecondsSinceEpoch}',
      senderId: _currentUserId,
      receiverId: _targetUserId,
      text: text,
      createdAt: DateTime.now(),
      isRead: false,
    );

    setState(() {
      messages.add(optimisticMessage);
    });

    _scrollToBottomIfNear();

    // Send to backend
    final sentMessage = await _messageService.sendMessage(
      recipientId: _targetUserId,
      text: text,
    );

    if (!mounted) return;

    if (sentMessage != null) {
      // Replace optimistic message with the real one (real MongoDB ID)
      setState(() {
        final idx = messages.indexWhere((m) => m.id == optimisticMessage.id);
        if (idx != -1) {
          messages[idx] = sentMessage;
        }
        if (conversation != null) {
          conversation = Conversation(
            id: conversation!.id,
            otherUserId: conversation!.otherUserId,
            otherUsername: conversation!.otherUsername,
            otherName: conversation!.otherName,
            otherAvatar: conversation!.otherAvatar,
            lastMessageText: sentMessage.text,
            lastMessageAt: sentMessage.createdAt,
            lastMessageSenderId: sentMessage.senderId,
            unreadCount: 0,
          );
        }
      });
    } else {
      // Failed to send — remove optimistic message and show error
      setState(() {
        messages.removeWhere((m) => m.id == optimisticMessage.id);
        _isSending = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to send message. Please try again.')),
      );
      // Re-add text to controller so user can retry
      _messageController.text = text;
    }

    setState(() {
      _isSending = false;
    });
  }

  Future<void> _sendImageMessage() async {
    if (_targetUserId.isEmpty || _isSendingImage) return;

    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    final bytes = await picked.readAsBytes();
    if (!mounted) return;

    setState(() {
      _isSendingImage = true;
    });

    // Optimistic message rendered from local bytes
    final optimisticMessage = Message(
      id: 'temp_img_${DateTime.now().millisecondsSinceEpoch}',
      senderId: _currentUserId,
      receiverId: _targetUserId,
      text: '',
      createdAt: DateTime.now(),
      isRead: false,
    );
    _pendingImages[optimisticMessage.id] = bytes;

    setState(() {
      messages.add(optimisticMessage);
    });
    _scrollToBottomIfNear();

    // Upload to backend (Cloudinary via /api/messages/image)
    final sentMessage = await _messageService.sendImageMessage(
      recipientId: _targetUserId,
      imagePath: picked.path,
    );

    if (!mounted) return;

    if (sentMessage != null) {
      setState(() {
        final idx = messages.indexWhere((m) => m.id == optimisticMessage.id);
        if (idx != -1) {
          messages[idx] = sentMessage;
        }
        if (conversation != null) {
          conversation = Conversation(
            id: conversation!.id,
            otherUserId: conversation!.otherUserId,
            otherUsername: conversation!.otherUsername,
            otherName: conversation!.otherName,
            otherAvatar: conversation!.otherAvatar,
            lastMessageText: sentMessage.text.isNotEmpty ? sentMessage.text : '📷 Photo',
            lastMessageAt: sentMessage.createdAt,
            lastMessageSenderId: sentMessage.senderId,
            unreadCount: 0,
          );
        }
      });
    } else {
      setState(() {
        messages.removeWhere((m) => m.id == optimisticMessage.id);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to send image. Please try again.')),
      );
    }

    _pendingImages.remove(optimisticMessage.id);
    setState(() {
      _isSendingImage = false;
    });
  }

  Future<void> _blockUser() async {
    final blocked = await _userService.blockUser(_targetUserId);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(blocked ? 'User blocked' : 'Failed to block user. Please try again.'),
      ),
    );
  }

  Future<void> _clearConversation() async {
    final cleared = await _messageService.clearThread(_targetUserId);
    if (!mounted) return;
    if (cleared) {
      setState(() => messages.clear());
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Conversation cleared')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to clear conversation. Please try again.')),
      );
    }
  }

  @override
  void dispose() {
    if (conversation != null) {
      _socketService.leaveConversation(conversation!.id);
    }
    _newMsgSub?.cancel();
    _readSub?.cancel();
    _deletedSub?.cancel();
    _clearedSub?.cancel();
    _presenceSub?.cancel();
    _scrollController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  String get _displayName {
    if (widget.name.isNotEmpty) return widget.name;
    return widget.username;
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
          onPressed: () {
            Navigator.pop(context);
          },
        ),
        titleSpacing: 0,
        title: Row(
          children: [
            _ChatAvatar(url: widget.avatarUrl, size: 40),
            SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _displayName,
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  _isOnline == true ? 'Active now' : 'Offline',
                  style: TextStyle(
                    color: _isOnline == true
                        ? const Color(0xFF6C8CFF)
                        : context.nexora.textHint,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () {
              showModalBottomSheet(
                context: context,
                backgroundColor: context.nexora.sheet,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                ),
                builder: (ctx) => SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 36,
                          height: 4,
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: context.nexora.textDim,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        ListTile(
                          leading: Icon(Icons.block_outlined, color: Color(0xFFE74C3C), size: 22),
                          title: Text('Block user', style: TextStyle(color: context.nexora.textPrimary, fontSize: 15)),
                          onTap: () {
                            Navigator.pop(ctx);
                            _blockUser();
                          },
                        ),
                        ListTile(
                          leading: Icon(Icons.delete_outline, color: Color(0xFFF39C12), size: 22),
                          title: Text('Clear conversation', style: TextStyle(color: context.nexora.textPrimary, fontSize: 15)),
                          onTap: () {
                            Navigator.pop(ctx);
                            _clearConversation();
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
            icon: Icon(Icons.more_vert),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: _buildMessagesArea()),

          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  IconButton(
                    onPressed: _sendImageMessage,
                    icon: Icon(
                      Icons.add_circle_outline,
                      color: context.nexora.textSecondary,
                    ),
                  ),

                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: context.nexora.field,
                        borderRadius: BorderRadius.circular(25),
                      ),
                      child: TextField(
                        controller: _messageController,
                        style: TextStyle(
                          color: context.nexora.textPrimary,
                          fontSize: 14,
                        ),
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _sendMessage(),
                        decoration: InputDecoration(
                          hintText: 'Type a message...',
                          hintStyle: TextStyle(color: context.nexora.textHint),
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: 18,
                            vertical: 13,
                          ),
                        ),
                      ),
                    ),
                  ),

                  SizedBox(width: 6),

                  GestureDetector(
                    onTap: _sendMessage,
                    child: Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
                        ),
                      ),
                      child: Icon(
                        Icons.send,
                        color: Colors.white,
                        size: 20,
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

  Widget _buildMessagesArea() {
    if (isLoading) {
      return Center(
        child: CircularProgressIndicator(color: context.nexora.textPrimary),
      );
    }

    if (_loadError != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, color: context.nexora.textDim, size: 40),
            SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40),
              child: Text(
                _loadError!,
                textAlign: TextAlign.center,
                style: TextStyle(color: context.nexora.textMuted, fontSize: 14),
              ),
            ),
            SizedBox(height: 14),
            TextButton(
              onPressed: _loadChat,
              child: Text(
                'Retry',
                style: TextStyle(color: Color(0xFF6C8CFF), fontSize: 14),
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
      itemCount: messages.length,
      itemBuilder: (context, index) {
        final message = messages[index];
        final bool isMine = message.senderId == _currentUserId;

        return _messageBubble(message, isMine);
      },
    );
  }

  /// Inline preview of a shared post inside a message bubble.
  Widget _sharedPostBlock(Message message, bool isMine) {
    final post = message.sharedPost;
    final postUser = post?['user'] is Map<String, dynamic>
        ? post!['user'] as Map<String, dynamic>
        : null;
    final postAuthor = postUser?['name']?.toString() ??
        postUser?['username']?.toString() ??
        '';
    final postAuthorUsername = postUser?['username']?.toString() ?? '';
    final postText = post?['text']?.toString() ?? '';
    final postMedia = post?['media'] is List ? post!['media'] as List : const [];
    String? thumbUrl;
    if (postMedia.isNotEmpty && postMedia.first is Map<String, dynamic>) {
      thumbUrl = (postMedia.first as Map<String, dynamic>)['url']?.toString();
    }

    return GestureDetector(
      onTap: postAuthorUsername.isNotEmpty
          ? () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      UserProfileScreen(username: postAuthorUsername),
                ),
              );
            }
          : null,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: isMine ? Colors.black26 : context.nexora.surfaceSubtle,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.repeat,
                    size: 13,
                    color: isMine ? Colors.white70 : context.nexora.textSecondary),
                SizedBox(width: 5),
                Text(
                  'Shared a post',
                  style: TextStyle(
                    color: isMine ? Colors.white70 : context.nexora.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            if (postAuthor.isNotEmpty) ...[
              SizedBox(height: 7),
              Text(
                postAuthor,
                style: TextStyle(
                  color: isMine ? Colors.white : context.nexora.textPrimary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            if (postText.isNotEmpty) ...[
              SizedBox(height: 3),
              Text(
                postText,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: isMine ? Colors.white70 : context.nexora.textSecondary,
                  fontSize: 12,
                  height: 1.3,
                ),
              ),
            ],
            if (thumbUrl != null && thumbUrl.isNotEmpty) ...[
              SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.network(
                  thumbUrl,
                  width: 180,
                  height: 100,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) =>
                      const SizedBox.shrink(),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _messageBubble(Message message, bool isMine) {
    final bool hasImage = message.image.isNotEmpty ||
        _pendingImages.containsKey(message.id);
    final bool isShare = message.type == 'share' &&
        message.sharedPostId.isNotEmpty;
    // Custom caption on a share (backend default text is 'Shared a post')
    final bool showShareText = isShare &&
        message.text.isNotEmpty &&
        message.text != 'Shared a post';

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 280),
        margin: const EdgeInsets.only(bottom: 10),
        padding: EdgeInsets.symmetric(
          // Text-only bubbles keep the original 15/11 padding; image
          // bubbles use a tighter 6px frame around the picture.
          horizontal: hasImage ? 6 : 15,
          vertical: hasImage ? 6 : 11,
        ),
        decoration: BoxDecoration(
          gradient: isMine
              ? LinearGradient(
                  colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
                )
              : null,
          color: isMine ? null : context.nexora.card,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(isMine ? 18 : 4),
            bottomRight: Radius.circular(isMine ? 4 : 18),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isShare) _sharedPostBlock(message, isMine),
            if (isShare && showShareText) SizedBox(height: 6),
            if (hasImage)
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: message.image.isNotEmpty
                    ? Image.network(
                        message.image,
                        width: 220,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Container(
                          width: 220,
                          height: 120,
                          color: isMine ? Colors.black26 : context.nexora.surfaceSubtle,
                          child: Icon(Icons.broken_image_outlined,
                              color: isMine ? Colors.white38 : context.nexora.textMuted),
                        ),
                      )
                    : Image.memory(
                        _pendingImages[message.id]!,
                        width: 220,
                        fit: BoxFit.cover,
                      ),
              ),
            if (hasImage && message.text.isNotEmpty && !isShare)
              SizedBox(height: 6),
            // Render text for plain/image bubbles and for share captions,
            // but not the redundant default 'Shared a post' text.
            if (message.text.isNotEmpty &&
                !(isShare && !showShareText))
              Padding(
                padding: hasImage
                    ? const EdgeInsets.symmetric(horizontal: 9, vertical: 5)
                    : EdgeInsets.zero,
                child: Text(
                  message.text,
                  style: TextStyle(
                    color: isMine ? Colors.white : context.nexora.textPrimary,
                    fontSize: 14,
                    height: 1.3,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Avatar with real profile image, falling back to the existing
/// default avatar (person icon on a colored circle).
class _ChatAvatar extends StatelessWidget {
  final String url;
  final double size;

  const _ChatAvatar({required this.url, this.size = 40});

  @override
  Widget build(BuildContext context) {
    Widget fallback() => Container(
          width: size,
          height: size,
          color: context.nexora.surfaceSelected,
          child: Icon(Icons.person, color: context.nexora.textMuted),
        );

    return ClipOval(
      child: url.isEmpty
          ? fallback()
          : Image.network(
              url,
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => fallback(),
            ),
    );
  }
}