import 'package:firebase_auth/firebase_auth.dart' as fb;

/// API configuration for Nexora backend.
///
/// Base URL points to the v1 API.
/// Change [baseUrl] to your deployed backend URL in production.
class ApiConfig {
  ApiConfig._();

  /// Backend base URL — change this for production.
  static const String baseUrl = 'http://10.0.2.2:5000/api/v1';

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
