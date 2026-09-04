import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/api_config.dart';

/// Singleton Socket.IO client for real-time messaging.
///
/// The Nexora backend authenticates sockets with the same bearer token
/// used by the REST API (Firebase ID token or JWT) and automatically joins
/// each socket to a `user:<id>` room. This service:
///  - connects with the authenticated user's token
///  - exposes streams for new messages, read receipts, deletions
///  - joins/leaves conversation rooms (backend also emits to these)
///  - relies on socket_io_client's built-in reconnection, refreshing the
///    token on reconnect attempts
class SocketService {
  SocketService._internal();

  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;

  io.Socket? _socket;
  bool _connecting = false;

  final _newMessageController = StreamController<Map<String, dynamic>>.broadcast();
  final _messagesReadController = StreamController<Map<String, dynamic>>.broadcast();
  final _messageDeletedController = StreamController<Map<String, dynamic>>.broadcast();
  final _conversationClearedController = StreamController<Map<String, dynamic>>.broadcast();
  final _presenceController = StreamController<Map<String, dynamic>>.broadcast();
  final _connectionStatusController = StreamController<bool>.broadcast();

  /// Emitted with payload `{ message, conversation }` on `new_message`.
  Stream<Map<String, dynamic>> get newMessages => _newMessageController.stream;

  /// Emitted with payload `{ readBy, count }` on `messages_read`.
  Stream<Map<String, dynamic>> get messagesRead => _messagesReadController.stream;

  /// Emitted with payload `{ messageId, deletedBy }` on `message_deleted`.
  Stream<Map<String, dynamic>> get messageDeleted => _messageDeletedController.stream;

  /// Emitted with payload `{ clearedBy, targetUserId }` on `conversation_cleared`.
  Stream<Map<String, dynamic>> get conversationCleared => _conversationClearedController.stream;

  /// Emitted with payload `{ userId, online }` when any user connects/disconnects.
  Stream<Map<String, dynamic>> get presence => _presenceController.stream;

  /// Emits `true` when connected, `false` when disconnected/reconnecting.
  Stream<bool> get connectionStatus => _connectionStatusController.stream;

  bool get isConnected => _socket?.connected ?? false;

  Future<String?> _getAuthToken() async {
    try {
      final user = fb.FirebaseAuth.instance.currentUser;
      if (user != null) {
        final token = await user.getIdToken(true);
        if (token != null && token.isNotEmpty) return token;
      }
    } catch (_) {}
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  /// Connect (or reconnect) the socket with a fresh auth token.
  Future<void> connect() async {
    if (_connecting) return;
    if (_socket != null) {
      // A socket already exists — either connected or being reconnected
      // by socket.io's built-in logic. The connect_error handler clears
      // _socket before forcing a fresh-token reconnect.
      return;
    }

    final token = await _getAuthToken();
    if (token == null || token.isEmpty) {
      _connectionStatusController.add(false);
      return;
    }

    _connecting = true;
    try {
      _socket?.dispose();
      _socket = null;

      final socket = io.io(
        ApiConfig.socketUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth(<String, dynamic>{'token': token})
            .enableReconnection()
            .setReconnectionDelay(1000)
            .setReconnectionDelayMax(5000)
            .build(),
      );

      socket.onConnect((_) {
        _connectionStatusController.add(true);
      });

      socket.onDisconnect((_) {
        _connectionStatusController.add(false);
      });

      socket.onConnectError((_) {
        _connectionStatusController.add(false);
        // Stop this socket's retries (its token may be stale/expired) and
        // reconnect once with a freshly fetched token.
        socket.dispose();
        if (identical(_socket, socket)) {
          _socket = null;
        }
        _connecting = false;
        Timer(const Duration(seconds: 2), () => connect());
      });

      socket.on('new_message', (data) {
        if (data is Map) {
          _newMessageController.add(Map<String, dynamic>.from(data));
        }
      });

      socket.on('messages_read', (data) {
        if (data is Map) {
          _messagesReadController.add(Map<String, dynamic>.from(data));
        }
      });

      socket.on('message_deleted', (data) {
        if (data is Map) {
          _messageDeletedController.add(Map<String, dynamic>.from(data));
        }
      });

      socket.on('conversation_cleared', (data) {
        if (data is Map) {
          _conversationClearedController.add(Map<String, dynamic>.from(data));
        }
      });

      socket.on('presence', (data) {
        if (data is Map) {
          _presenceController.add(Map<String, dynamic>.from(data));
        }
      });

      socket.connect();
      _socket = socket;
    } finally {
      _connecting = false;
    }
  }

  /// Join a conversation room (backend also delivers events to these rooms).
  void joinConversation(String conversationId) {
    _socket?.emit('join_conversation', conversationId);
  }

  /// Leave a conversation room.
  void leaveConversation(String conversationId) {
    _socket?.emit('leave_conversation', conversationId);
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _connectionStatusController.add(false);
  }

  void dispose() {
    disconnect();
    _newMessageController.close();
    _messagesReadController.close();
    _messageDeletedController.close();
    _conversationClearedController.close();
    _presenceController.close();
    _connectionStatusController.close();
  }
}