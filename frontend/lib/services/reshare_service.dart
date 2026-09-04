import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';

/// Backend-connected reshare service.
///
/// Toggles a real Reshare record in MongoDB (unique per user + post),
/// increments/decrements the post's sharesCount, and notifies the owner.
class ReshareService {
  ReshareService._internal();

  static final ReshareService _instance = ReshareService._internal();
  factory ReshareService() => _instance;

  Future<String?> _getFirebaseToken() async {
    try {
      final user = fb.FirebaseAuth.instance.currentUser;
      if (user == null) return null;
      return await user.getIdToken(true);
    } catch (_) {
      return null;
    }
  }

  Future<String?> _getJwtToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  Future<Map<String, String>> _headers() async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    String? token = await _getFirebaseToken();
    if (token == null || token.isEmpty) {
      token = await _getJwtToken();
    }
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  /// Toggle reshare on a post. Returns `{ isReshared, reshareCount }`
  /// on success, or `null` on failure (caller decides how to surface it).
  Future<Map<String, dynamic>?> toggleReshare({required String postId}) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/posts/$postId/reshare');
      final response = await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        if (json['success'] == true) {
          return {
            'isReshared': json['isReshared'] as bool? ?? false,
            'reshareCount': (json['reshareCount'] as num?)?.toInt() ?? 0,
          };
        }
      }
    } catch (_) {}

    return null;
  }
}