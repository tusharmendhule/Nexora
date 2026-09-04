import 'dart:io' show Platform;

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/foundation.dart' show kIsWeb;

/// API configuration for Nexora backend.
///
/// Base URL points to the v1 API.
/// Change [baseUrl] to your deployed backend URL in production.
class ApiConfig {
  ApiConfig._();

  /// Backend base URL — change this for production.
  /// On web, use a relative URL (same origin when served from Express).
  /// On Android emulator, use 10.0.2.2 to reach localhost.
  static String get baseUrl {
    if (kIsWeb) return '/api/v1';
    final host = Platform.isAndroid ? '10.0.2.2' : 'localhost';
    return 'http://$host:5000/api/v1';
  }

  /// Legacy API base URL (pre-v1 endpoints such as /api/messages and
  /// /api/conversations that the messaging module uses).
  static String get legacyBaseUrl {
    if (kIsWeb) return '/api';
    final host = Platform.isAndroid ? '10.0.2.2' : 'localhost';
    return 'http://$host:5000/api';
  }

  /// Origin used for the Socket.IO connection (no path).
  static String get socketUrl {
    if (kIsWeb) return Uri.base.origin;
    final host = Platform.isAndroid ? '10.0.2.2' : 'localhost';
    return 'http://$host:5000';
  }

  /// Timeout for HTTP requests.
  static const Duration timeout = Duration(seconds: 15);

  /// Default HTTP headers with Firebase auth token.
  /// Returns a Future because token retrieval is async.
  static Future<Map<String, String>> get headers async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    try {
      final user = fb.FirebaseAuth.instance.currentUser;
      if (user != null) {
        final token = await user.getIdToken(true);
        if (token != null) {
          headers['Authorization'] = 'Bearer $token';
        }
      }
    } catch (_) {
      // No authenticated user — proceed without auth header
    }
    return headers;
  }
}
