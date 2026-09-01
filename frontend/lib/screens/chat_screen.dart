import 'package:flutter/material.dart';

import '../models/conversation.dart';
import '../models/message.dart';
import '../services/conversation_service.dart';
import '../services/message_service.dart';

class ChatScreen extends StatefulWidget {
  final String username;

  const ChatScreen({super.key, required this.username});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _messageController = TextEditingController();

  final ConversationService _conversationService = ConversationService();
  final MessageService _messageService = MessageService();

  List<Message> messages = [];
  Conversation? conversation;
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadChat();
  }

  Future<void> _loadChat() async {
    final foundConversation = await _conversationService
        .findConversationBetween('You', widget.username);

    if (foundConversation == null) {
      if (!mounted) return;

      setState(() {
        conversation = null;
        messages = [];
        isLoading = false;
      });

      return;
    }

    final loadedMessages = await _messageService.fetchMessages(
      foundConversation.id,
    );

    if (!mounted) return;

    setState(() {
      conversation = foundConversation;
      messages = loadedMessages;
      isLoading = false;
    });
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();

    if (text.isEmpty || conversation == null) {
      return;
    }

    final message = Message(
      id: 'message_${DateTime.now().millisecondsSinceEpoch}',
      conversationId: conversation!.id,
      senderId: 'You',
      receiverId: widget.username,
      text: text,
      createdAt: DateTime.now(),
      isRead: false,
    );

    await _messageService.sendMessage(message);

    if (!mounted) return;

    setState(() {
      messages.add(message);
      _messageController.clear();
    });
  }

  @override
  void dispose() {
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
