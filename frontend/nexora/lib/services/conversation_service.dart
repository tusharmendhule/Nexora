import '../models/conversation.dart';

class ConversationService {
  final List<Conversation> _conversations = [
    const Conversation(
      id: 'conversation_1',
      participantIds: ['You', 'User1'],
      lastMessageText: 'are we meeting today?',
      unreadCount: 1,
    ),
    const Conversation(
      id: 'conversation_2',
      participantIds: ['You', 'User2'],
      lastMessageText: 'i broke my leg',
      unreadCount: 0,
    ),
    const Conversation(
      id: 'conversation_3',
      participantIds: ['You', 'User3'],
      lastMessageText: 'hi',
      unreadCount: 1,
    ),
    const Conversation(
      id: 'conversation_4',
      participantIds: ['You', 'User4'],
      lastMessageText: '3+ new messages',
      unreadCount: 3,
    ),
    const Conversation(
      id: 'conversation_5',
      participantIds: ['You', 'User5'],
      lastMessageText: 'seen',
      unreadCount: 0,
    ),
    const Conversation(
      id: 'conversation_6',
      participantIds: ['You', 'User6'],
      lastMessageText: 'sent',
      unreadCount: 0,
    ),
    const Conversation(
      id: 'conversation_7',
      participantIds: ['You', 'User7'],
      lastMessageText: 'sent',
      unreadCount: 0,
    ),
    const Conversation(
      id: 'conversation_8',
      participantIds: ['You', 'User8'],
      lastMessageText: 'sent a post',
      unreadCount: 1,
    ),
  ];

  List<Conversation> get conversations => List.unmodifiable(_conversations);

  Future<List<Conversation>> fetchConversations() async {
    return List.unmodifiable(_conversations);
  }

  Future<Conversation?> getConversationById(String conversationId) async {
    for (final conversation in _conversations) {
      if (conversation.id == conversationId) {
        return conversation;
      }
    }

    return null;
  }

  Future<Conversation?> findConversationBetween(
    String userId,
    String otherUserId,
  ) async {
    for (final conversation in _conversations) {
      if (conversation.participantIds.contains(userId) &&
          conversation.participantIds.contains(otherUserId)) {
        return conversation;
      }
    }

    return null;
  }

  Future<void> createConversation(Conversation conversation) async {
    _conversations.add(conversation);
  }

  Future<void> updateConversation(Conversation updatedConversation) async {
    final index = _conversations.indexWhere(
      (conversation) => conversation.id == updatedConversation.id,
    );

    if (index == -1) return;

    _conversations[index] = updatedConversation;
  }

  Future<void> deleteConversation(String conversationId) async {
    _conversations.removeWhere(
      (conversation) => conversation.id == conversationId,
    );
  }
}
