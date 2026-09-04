import 'dart:convert';
import 'dart:typed_data';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
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

  Future<String?> _getIdToken() async {
    String? token = await _getFirebaseToken();
    if (token == null || token.isEmpty) {
      token = await _getJwtToken();
    }
    return token;
  }

  Future<Map<String, String>> _headers({bool includeAuth = true}) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (includeAuth) {
      final token = await _getIdToken();
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

  /// MIME type used for the multipart "avatar" field when the picked file's
  /// extension is unknown.
  static const Map<String, String> _avatarMimeByExtension = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'bmp': 'image/bmp',
  };

  /// Upload an avatar image to the backend (Cloudinary via API).
  ///
  /// The image is sent as raw bytes so the same code works on mobile and on
  /// the web (where `dart:io` file paths are unavailable). Returns the
  /// updated [User] on success, or null on failure.
  Future<User?> uploadAvatar(
    Uint8List imageBytes, {
    String filename = 'avatar.jpg',
  }) async {
    try {
      final token = await _getIdToken();
      if (token == null || token.isEmpty) return null;

      final extension = filename.contains('.')
          ? filename.split('.').last.toLowerCase()
          : 'jpg';
      final mime = _avatarMimeByExtension[extension] ?? 'image/jpeg';
      if (filename.isEmpty) filename = 'avatar.jpg';

      final url = Uri.parse('${ApiConfig.baseUrl}/users/me/avatar');
      final request = http.MultipartRequest('PATCH', url);
      request.headers['Authorization'] = 'Bearer $token';
      request.files.add(
        http.MultipartFile.fromBytes(
          'avatar',
          imageBytes,
          filename: filename,
          contentType: MediaType.parse(mime),
        ),
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

  // ─── GET /api/v1/users/by-username/:username ─────────

  /// Get current authenticated user's MongoDB _id.
  Future<String?> getCurrentUserId() async {
    try {
      final user = await getMyProfile();
      return user?.id;
    } catch (_) {
      return null;
    }
  }

  // ─── User list (share/mention pickers) ──────────────

  /// Fetch real users (excluding self and blocked) for share pickers.
  /// Optional [query] filters by name/username on the backend.
  Future<List<User>> fetchAllUsers({String? query}) async {
    try {
      final q = query?.trim() ?? '';
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/users${q.isNotEmpty ? '?q=${Uri.encodeComponent(q)}' : ''}',
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

  // ─── Search ─────────────────────────────────────────

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
    try {
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/users/by-username/${Uri.encodeComponent(username)}',
      );
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

    // Fallback: try search
    try {
      final users = await searchUsers(username);
      for (final u in users) {
        if (u.username.toLowerCase() == username.toLowerCase()) {
          return u;
        }
      }
    } catch (_) {}

    return _getCachedProfile();
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

  /// Permanently delete the current user's account (backend removes
  /// the account and its related data). Returns null on success or an
  /// error message on failure.
  Future<String?> deleteUser() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/me');
      final response = await http
          .delete(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        return null; // success
      }
      return body['message'] as String? ?? 'Failed to delete account';
    } catch (_) {
      return 'Network error. Please try again.';
    }
  }

  /// Create user (registration is handled by AuthService, not here).
  Future<void> createUser(User user) async {}

  // ─── Account management ───────────────────────────────

  /// Add/update the current user's phone number on the backend.
  /// Returns null on success or an error message on failure.
  Future<String?> updatePhone(String phone) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/me/phone');
      final response = await http
          .patch(
            url,
            headers: await _headers(),
            body: jsonEncode({'phone': phone.trim()}),
          )
          .timeout(ApiConfig.timeout);

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        if (body['user'] != null) {
          await _cacheProfile(User.fromJson(body['user'] as Map<String, dynamic>));
        }
        return null;
      }
      return body['message'] as String? ?? 'Failed to update phone number';
    } catch (_) {
      return 'Network error. Please try again.';
    }
  }

  /// Change the current user's email address (local accounts require
  /// the current password). Returns null on success or an error message.
  Future<String?> updateEmail({
    required String newEmail,
    String? currentPassword,
  }) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/me/email');
      final response = await http
          .patch(
            url,
            headers: await _headers(),
            body: jsonEncode({
              'newEmail': newEmail.trim(),
              if (currentPassword != null) 'currentPassword': currentPassword,
            }),
          )
          .timeout(ApiConfig.timeout);

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        if (body['user'] != null) {
          await _cacheProfile(User.fromJson(body['user'] as Map<String, dynamic>));
        }
        return null;
      }
      return body['message'] as String? ?? 'Failed to update email';
    } catch (_) {
      return 'Network error. Please try again.';
    }
  }

  /// Fetch the current user's account history from the backend.
  Future<List<Map<String, dynamic>>> getAccountHistory() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/me/history');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['history'] != null) {
          return (body['history'] as List)
              .map((h) => Map<String, dynamic>.from(h as Map))
              .toList();
        }
      }
    } catch (_) {}

    return [];
  }

  /// Deactivate the current user's account. Returns null on success
  /// or an error message on failure.
  Future<String?> deactivateAccount() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/me/deactivate');
      final response = await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        return null;
      }
      return body['message'] as String? ?? 'Failed to deactivate account';
    } catch (_) {
      return 'Network error. Please try again.';
    }
  }

  /// Reactivate a deactivated account. Returns null on success or an
  /// error message on failure.
  Future<String?> reactivateAccount() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/me/reactivate');
      final response = await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        return null;
      }
      return body['message'] as String? ?? 'Failed to reactivate account';
    } catch (_) {
      return 'Network error. Please try again.';
    }
  }

  /// Request the authenticated user's data export.
  /// Returns a map with `filename` and `data` (the exported JSON map).
  Future<Map<String, dynamic>?> exportAccountData() async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/me/export');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(Duration(seconds: 60));

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['data'] != null) {
          return {
            'filename': body['filename'] as String? ?? 'nexora-export.json',
            'data': body['data'] as Map<String, dynamic>,
          };
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── Follow API ─────────────────────────────────────

  /// Follow a user. Returns true if the follow was successful.
  Future<bool> followUser(String targetUserId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/$targetUserId/follow');
      final response = await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return json['success'] == true;
      }
    } catch (_) {}

    return false;
  }

  /// Unfollow a user. Returns true if the unfollow was successful.
  Future<bool> unfollowUser(String targetUserId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/$targetUserId/unfollow');
      final response = await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return json['success'] == true;
      }
    } catch (_) {}

    return false;
  }

  /// Check if the current user is following a target user.
  Future<bool> isFollowingUser(String targetUserId) async {
    try {
      final url = Uri.parse(
        '${ApiConfig.baseUrl}/users/$targetUserId/is-following',
      );
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return json['isFollowing'] == true;
      }
    } catch (_) {}

    return false;
  }

  /// Get a user's followers list.
  Future<List<User>> getFollowers(String userId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/$userId/followers');
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

  /// Get a user's following list.
  Future<List<User>> getFollowing(String userId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/$userId/following');
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

  /// Get the count of posts by a user.
  Future<int> getUserPostsCount(String userId) async {
    // The postsCount is already included in user profile responses from
    // getById/getMyProfile. This method is for cases where we only need the count.
    final user = await getUserById(userId);
    return user?.postsCount ?? 0;
  }

  // ─── Block API ──────────────────────────────────────

  /// Block a user. Returns true on success.
  Future<bool> blockUser(String targetUserId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/$targetUserId/block');
      final response = await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return json['success'] == true;
      }
    } catch (_) {}

    return false;
  }

  /// Unblock a user. Returns true on success.
  Future<bool> unblockUser(String targetUserId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/$targetUserId/unblock');
      final response = await http
          .post(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return json['success'] == true;
      }
    } catch (_) {}

    return false;
  }

  /// Check if there is a block relationship between current user and target.
  Future<bool> isBlocked(String targetUserId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/users/$targetUserId/is-blocked');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return json['isBlocked'] == true;
      }
    } catch (_) {}

    return false;
  }

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
  Future<User?> _getCachedProfile() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final id = prefs.getString('cached_user_id');
      if (id == null || id.isEmpty) return null;

      return User(
        id: id,
        username: prefs.getString('cached_user_username') ?? '',
        displayName: prefs.getString('cached_user_name'),
        bio: prefs.getString('cached_user_bio'),
        profileImageUrl: prefs.getString('cached_user_avatar'),
        isVerified: prefs.getBool('cached_user_verified') ?? false,
        followersCount: prefs.getInt('cached_followers') ?? 0,
        followingCount: prefs.getInt('cached_following') ?? 0,
        email: prefs.getString('cached_user_email'),
        createdAt: prefs.getString('cached_created_at') != null
            ? DateTime.tryParse(prefs.getString('cached_created_at')!)
            : null,
      );
    } catch (_) {
      return null;
    }
  }
}
