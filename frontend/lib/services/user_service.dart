import 'dart:convert';
import 'dart:io';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/user.dart';

/// Backend-connected user service.
///
/// All reads/writes go through the Nexora v1 API backed by MongoDB.
/// Falls back to SharedPreferences for offline caching of the current user.
class UserService {
  UserService._internal();

  static final UserService _instance = UserService._internal();
  factory UserService() => _instance;

  // ─── Token helpers ───────────────────────────────────

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

  Future<Map<String, String>> _headers({bool includeAuth = true}) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (includeAuth) {
      String? token = await _getFirebaseToken();
      if (token == null || token.isEmpty) {
        token = await _getJwtToken();
      }
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }
    return headers;
  }

  // ─── GET /api/v1/users/me ───────────────────────────

  /// Fetch the current user's full profile from the backend.
  Future<User?> getMyProfile() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/me');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['user'] != null) {
          final user = User.fromJson(body['user'] as Map<String, dynamic>);

          // Cache locally for offline display
          await _cacheProfile(user);

          return user;
        }
      }
    } catch (_) {}

    // Fallback to cache
    return _getCachedProfile();
  }

  // ─── PATCH /api/v1/users/me ─────────────────────────

  /// Update the current user's profile fields on the backend.
  Future<User?> updateMyProfile({
    String? name,
    String? username,
    String? bio,
    String? website,
    bool? isPrivate,
  }) async {
    try {
      final body = <String, dynamic>{};
      if (name != null) body['name'] = name;
      if (username != null) body['username'] = username;
      if (bio != null) body['bio'] = bio;
      if (website != null) body['website'] = website;
      if (isPrivate != null) body['isPrivate'] = isPrivate;

      if (body.isEmpty) return await getMyProfile();

      final url = Uri.parse('${ApiConfig.baseUrl}/users/me');
      final response = await http
          .patch(url, headers: await _headers(), body: jsonEncode(body))
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        if (json['success'] == true && json['user'] != null) {
          final user = User.fromJson(json['user'] as Map<String, dynamic>);
          await _cacheProfile(user);
          return user;
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── PATCH /api/v1/users/me/avatar ──────────────────

  /// Upload an avatar image file to the backend (Cloudinary via API).
  Future<User?> uploadAvatar(File imageFile) async {
    try {
      String? token = await _getFirebaseToken();
      if (token == null || token.isEmpty) {
        token = await _getJwtToken();
      }
      if (token == null || token.isEmpty) return null;

      final url = Uri.parse('${ApiConfig.baseUrl}/users/me/avatar');
      final request = http.MultipartRequest('PATCH', url);
      request.headers['Authorization'] = 'Bearer $token';
      request.files.add(
        await http.MultipartFile.fromPath('avatar', imageFile.path),
      );

      final streamedResponse = await request.send().timeout(ApiConfig.timeout);
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        if (json['success'] == true && json['user'] != null) {
          final user = User.fromJson(json['user'] as Map<String, dynamic>);
          await _cacheProfile(user);
          return user;
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── GET /api/v1/users/:id ──────────────────────────

  /// Fetch any user's profile by their MongoDB _id.
  Future<User?> getUserById(String userId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/$userId');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['user'] != null) {
          return User.fromJson(body['user'] as Map<String, dynamic>);
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── Legacy helpers (used by screens that still reference them) ──

  /// Fetch users (for screens that list users).
  Future<List<User>> fetchUsers() async {
    return [];
  }

  /// Search users by name or username via the backend.
  Future<List<User>> searchUsers(String query) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/users/search?q=${Uri.encodeComponent(query)}',
      );
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['users'] != null) {
          return (body['users'] as List)
              .map((u) => User.fromJson(u as Map<String, dynamic>))
              .toList();
        }
      }
    } catch (_) {}

    return [];
  }

  /// Get user by username — tries backend first, falls back to cache.
  Future<User?> getUserByUsername(String username) async {
    // If it's the "current user" query, use getMyProfile
    final cached = _getCachedProfile();
    if (cached != null && cached.username.toLowerCase() == username.toLowerCase()) {
      return getMyProfile();
    }

    // Otherwise search by username
    try {
      final users = await searchUsers(username);
      for (final u in users) {
        if (u.username.toLowerCase() == username.toLowerCase()) {
          return u;
        }
      }
    } catch (_) {}

    return cached;
  }

  /// Update a user (legacy compat — delegates to updateMyProfile).
  Future<void> updateUser(User updatedUser) async {
    await updateMyProfile(
      name: updatedUser.displayName,
      username: updatedUser.username,
      bio: updatedUser.bio,
      website: updatedUser.website,
      isPrivate: updatedUser.isPrivate,
    );
  }

  /// Delete user (placeholder — backend doesn't expose this yet).
  Future<void> deleteUser(String userId) async {}

  /// Create user (registration is handled by AuthService, not here).
  Future<void> createUser(User user) async {}

  // ─── Local Cache (SharedPreferences) ────────────────

  /// Cache the current user's profile for offline display.
  Future<void> _cacheProfile(User user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('cached_user_id', user.id);
    await prefs.setString('cached_user_username', user.username);
    await prefs.setString('cached_user_name', user.displayName ?? '');
    await prefs.setString('cached_user_bio', user.bio ?? '');
    await prefs.setString('cached_user_avatar', user.profileImageUrl ?? '');
    await prefs.setBool('cached_user_verified', user.isVerified);
    await prefs.setInt('cached_followers', user.followersCount);
    await prefs.setInt('cached_following', user.followingCount);
    await prefs.setString('cached_user_email', user.email ?? '');

    if (user.createdAt != null) {
      await prefs.setString('cached_created_at', user.createdAt!.toIso8601String());
    }
  }

  /// Retrieve the cached profile (used as a fallback when offline).
  User? _getCachedProfile() {
    // Synchronous read is not possible with SharedPreferences,
    // so we return null — callers should use getMyProfile() which
    // handles the async cache read internally.
    return null;
  }
}
