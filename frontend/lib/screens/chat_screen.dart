import 'dart:async';

import 'package:flutter/material.dart';

import '../models/conversation.dart';
import '../models/message.dart';
import '../services/conversation_service.dart';
import '../services/message_service.dart';
import '../services/user_service.dart';

class ChatScreen extends StatefulWidget {
  final String username;

  /// The MongoDB _id of the target user (preferred over username lookup).
  final String? targetUserId;

  const ChatScreen({super.key, required this.username, this.targetUserId});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _messageController = TextEditingController();

  final ConversationService _conversationService = ConversationService();
  final MessageService _messageService = MessageService();
  final UserService _userService = UserService();

  List<Message> messages = [];
  Conversation? conversation;
  bool isLoading = true;
  String _currentUserId = '';
  String _targetUserId = '';
  Timer? _pollTimer;
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    _loadChat();
  }

  Future<void> _loadChat() async {
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
        conversation = null;
        messages = [];
        isLoading = false;
      });
      return;
    }

    // Create or find conversation
    final foundConversation = await _conversationService.createOrFindConversation(_targetUserId);

    if (foundConversation == null) {
      if (!mounted) return;
      setState(() {
        conversation = null;
        messages = [];
        isLoading = false;
      });
      return;
    }

    // Fetch messages
    final loadedMessages = await _messageService.fetchMessages(_targetUserId);

    if (!mounted) return;

    setState(() {
      conversation = foundConversation;
      messages = loadedMessages;
      isLoading = false;
    });

    // Mark messages as read
    await _messageService.markAsRead(_targetUserId);

    // Start polling for new messages
    _startPolling();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      if (!mounted || _targetUserId.isEmpty) return;
      final newMessages = await _messageService.fetchMessages(_targetUserId);
      if (!mounted) return;

      setState(() {
        messages = newMessages;
      });

      // Mark new messages as read
      await _messageService.markAsRead(_targetUserId);
    });
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
      conversationId: conversation?.id ?? '',
      senderId: _currentUserId,
      receiverId: _targetUserId,
      text: text,
      createdAt: DateTime.now(),
      isRead: false,
    );

    setState(() {
      messages.add(optimisticMessage);
    });

    // Send to backend
    final sentMessage = await _messageService.sendMessage(
      recipientId: _targetUserId,
      text: text,
    );

    if (!mounted) return;

    if (sentMessage != null) {
      // Replace optimistic message with real one
      setState(() {
        final idx = messages.indexWhere((m) => m.id == optimisticMessage.id);
        if (idx != -1) {
          messages[idx] = sentMessage;
        }
      });
    } else {
      // Failed to send - remove optimistic message and show error
      setState(() {
        messages.removeWhere((m) => m.id == optimisticMessage.id);
        _isSending = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to send message. Please try again.')),
      );
      // Re-add text to controller so user can retry
      _messageController.text = text;
    }

    setState(() {
      _isSending = false;
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF080B1A),
        foregroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            Navigator.pop(context);
          },
        ),
        titleSpacing: 0,
        title: Row(
          children: [
            const CircleAvatar(
              radius: 20,
              backgroundColor: Color(0xFF242A43),
              child: Icon(Icons.person, color: Colors.white54),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.username,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Text(
                  'Active now',
                  style: TextStyle(color: Color(0xFF6C8CFF), fontSize: 11),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert)),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
                    itemCount: messages.length,
                    itemBuilder: (context, index) {
                      final message = messages[index];
                      final bool isMine = message.senderId == 'You';

                      return _messageBubble(message.text, isMine);
                    },
                  ),
          ),

          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () {},
                    icon: const Icon(
                      Icons.add_circle_outline,
                      color: Colors.white70,
                    ),
                  ),

                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF151A2E),
                        borderRadius: BorderRadius.circular(25),
                      ),
                      child: TextField(
                        controller: _messageController,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                        ),
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _sendMessage(),
                        decoration: const InputDecoration(
                          hintText: 'Type a message...',
                          hintStyle: TextStyle(color: Colors.white38),
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: 18,
                            vertical: 13,
                          ),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(width: 6),

                  GestureDetector(
                    onTap: _sendMessage,
                    child: Container(
                      width: 46,
                      height: 46,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
                        ),
                      ),
                      child: const Icon(
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

  Widget _messageBubble(String text, bool isMine) {
    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 280),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
        decoration: BoxDecoration(
          gradient: isMine
              ? const LinearGradient(
                  colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
                )
              : null,
          color: isMine ? null : const Color(0xFF171D35),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(isMine ? 18 : 4),
            bottomRight: Radius.circular(isMine ? 4 : 18),
          ),
        ),
        child: Text(
          text,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
            height: 1.3,
          ),
        ),
      ),
    );
  }
}
