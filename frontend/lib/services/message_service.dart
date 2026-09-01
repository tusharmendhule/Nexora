import '../models/message.dart';

class MessageService {
  final List<Message> _messages = [
    // User1
    Message(
      id: 'message_101',
      conversationId: 'conversation_1',
      senderId: 'User1',
      receiverId: 'You',
      text: 'Hey! 👋',
      createdAt: DateTime(2026, 8, 29, 16, 40),
    ),
    Message(
      id: 'message_102',
      conversationId: 'conversation_1',
      senderId: 'User1',
      receiverId: 'You',
      text: 'How are you?',
      createdAt: DateTime(2026, 8, 29, 16, 42),
    ),
    Message(
      id: 'message_103',
      conversationId: 'conversation_1',
      senderId: 'User1',
      receiverId: 'You',
      text: 'Are we meeting today?',
      createdAt: DateTime(2026, 8, 29, 16, 45),
    ),
    Message(
      id: 'message_104',
      conversationId: 'conversation_1',
      senderId: 'You',
      receiverId: 'User1',
      text: 'Yeah, around 5.',
      createdAt: DateTime(2026, 8, 29, 16, 47),
    ),
    Message(
      id: 'message_105',
      conversationId: 'conversation_1',
      senderId: 'User1',
      receiverId: 'You',
      text: 'Okay, see you then.',
      createdAt: DateTime(2026, 8, 29, 16, 49),
    ),
    Message(
      id: 'message_106',
      conversationId: 'conversation_1',
      senderId: 'You',
      receiverId: 'User1',
      text: 'Perfect!',
      createdAt: DateTime(2026, 8, 29, 16, 50),
    ),

    // User2
    Message(
      id: 'message_201',
      conversationId: 'conversation_2',
      senderId: 'User2',
      receiverId: 'You',
      text: 'Hey!',
      createdAt: DateTime(2026, 8, 29, 16, 25),
    ),
    Message(
      id: 'message_202',
      conversationId: 'conversation_2',
      senderId: 'User2',
      receiverId: 'You',
      text: 'I broke my leg 😭',
      createdAt: DateTime(2026, 8, 29, 16, 26),
    ),
    Message(
      id: 'message_203',
      conversationId: 'conversation_2',
      senderId: 'You',
      receiverId: 'User2',
      text: 'Oh no! Are you okay?',
      createdAt: DateTime(2026, 8, 29, 16, 28),
    ),
    Message(
      id: 'message_204',
      conversationId: 'conversation_2',
      senderId: 'User2',
      receiverId: 'You',
      text: 'Yeah, I am recovering.',
      createdAt: DateTime(2026, 8, 29, 16, 30),
    ),
    Message(
      id: 'message_205',
      conversationId: 'conversation_2',
      senderId: 'You',
      receiverId: 'User2',
      text: 'Take care!',
      createdAt: DateTime(2026, 8, 29, 16, 31),
    ),

    // User3
    Message(
      id: 'message_301',
      conversationId: 'conversation_3',
      senderId: 'User3',
      receiverId: 'You',
      text: 'Hi!',
      createdAt: DateTime(2026, 8, 29, 15, 40),
    ),
    Message(
      id: 'message_302',
      conversationId: 'conversation_3',
      senderId: 'You',
      receiverId: 'User3',
      text: 'Hey User3 👋',
      createdAt: DateTime(2026, 8, 29, 15, 42),
    ),
    Message(
      id: 'message_303',
      conversationId: 'conversation_3',
      senderId: 'User3',
      receiverId: 'You',
      text: 'What are you doing?',
      createdAt: DateTime(2026, 8, 29, 15, 44),
    ),
    Message(
      id: 'message_304',
      conversationId: 'conversation_3',
      senderId: 'You',
      receiverId: 'User3',
      text: 'Just chilling.',
      createdAt: DateTime(2026, 8, 29, 15, 45),
    ),

    // User4
    Message(
      id: 'message_401',
      conversationId: 'conversation_4',
      senderId: 'User4',
      receiverId: 'You',
      text: 'You have 3+ new messages.',
      createdAt: DateTime(2026, 8, 27, 12, 00),
    ),
    Message(
      id: 'message_402',
      conversationId: 'conversation_4',
      senderId: 'User4',
      receiverId: 'You',
      text: 'Hey, are you free?',
      createdAt: DateTime(2026, 8, 27, 12, 02),
    ),
    Message(
      id: 'message_403',
      conversationId: 'conversation_4',
      senderId: 'User4',
      receiverId: 'You',
      text: 'I wanted to show you something.',
      createdAt: DateTime(2026, 8, 27, 12, 04),
    ),

    // User5
    Message(
      id: 'message_501',
      conversationId: 'conversation_5',
      senderId: 'User5',
      receiverId: 'You',
      text: 'Seen your post 👀',
      createdAt: DateTime(2026, 8, 27, 11, 00),
    ),
    Message(
      id: 'message_502',
      conversationId: 'conversation_5',
      senderId: 'User5',
      receiverId: 'You',
      text: 'That looks really cool!',
      createdAt: DateTime(2026, 8, 27, 11, 02),
    ),
    Message(
      id: 'message_503',
      conversationId: 'conversation_5',
      senderId: 'You',
      receiverId: 'User5',
      text: 'Thanks! 😄',
      createdAt: DateTime(2026, 8, 27, 11, 04),
    ),

    // User6
    Message(
      id: 'message_601',
      conversationId: 'conversation_6',
      senderId: 'User6',
      receiverId: 'You',
      text: 'Sent you a message.',
      createdAt: DateTime(2026, 8, 26, 10, 00),
    ),
    Message(
      id: 'message_602',
      conversationId: 'conversation_6',
      senderId: 'User6',
      receiverId: 'You',
      text: 'Hey!',
      createdAt: DateTime(2026, 8, 26, 10, 02),
    ),
    Message(
      id: 'message_603',
      conversationId: 'conversation_6',
      senderId: 'User6',
      receiverId: 'You',
      text: 'Did you check the latest update?',
      createdAt: DateTime(2026, 8, 26, 10, 04),
    ),

    // User7
    Message(
      id: 'message_701',
      conversationId: 'conversation_7',
      senderId: 'User7',
      receiverId: 'You',
      text: 'Hey 👋',
      createdAt: DateTime(2026, 8, 23, 10, 00),
    ),
    Message(
      id: 'message_702',
      conversationId: 'conversation_7',
      senderId: 'User7',
      receiverId: 'You',
      text: 'Long time no see!',
      createdAt: DateTime(2026, 8, 23, 10, 02),
    ),
    Message(
      id: 'message_703',
      conversationId: 'conversation_7',
      senderId: 'You',
      receiverId: 'User7',
      text: 'Yeah haha 😄',
      createdAt: DateTime(2026, 8, 23, 10, 04),
    ),

    // User8
    Message(
      id: 'message_801',
      conversationId: 'conversation_8',
      senderId: 'User8',
      receiverId: 'You',
      text: 'Sent a post.',
      createdAt: DateTime(2026, 7, 29, 10, 00),
    ),
    Message(
      id: 'message_802',
      conversationId: 'conversation_8',
      senderId: 'User8',
      receiverId: 'You',
      text: 'Check this out!',
      createdAt: DateTime(2026, 7, 29, 10, 02),
    ),
    Message(
      id: 'message_803',
      conversationId: 'conversation_8',
      senderId: 'User8',
      receiverId: 'You',
      text: 'Wow, this is interesting.',
      createdAt: DateTime(2026, 7, 29, 10, 04),
    ),
  ];

  List<Message> get messages => List.unmodifiable(_messages);

  Future<List<Message>> fetchMessages(String conversationId) async {
    return _messages
        .where((message) => message.conversationId == conversationId)
        .toList();
  }

  Future<Message?> getMessageById(String messageId) async {
    for (final message in _messages) {
      if (message.id == messageId) {
        return message;
      }
    }

    return null;
  }

  Future<void> sendMessage(Message message) async {
    _messages.add(message);
  }

  Future<void> markAsRead(String messageId) async {
    final index = _messages.indexWhere((message) => message.id == messageId);

    if (index == -1) return;

    final message = _messages[index];

    _messages[index] = Message(
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      text: message.text,
      createdAt: message.createdAt,
      isRead: true,
    );
  }
}
