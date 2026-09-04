import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'socket_service.dart';

/// Authentication service for Nexora.
///
/// Handles:
/// - Local registration (email/password → MongoDB only, no Firebase)
/// - Local login (email/password → MongoDB only, returns JWT)
/// - Google sign-in (Firebase Auth → both Firebase + MongoDB)
/// - Logout (Firebase sign-out + local cleanup)
/// - Session restoration
class AuthService {
  AuthService._internal();

  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;

  final fb.FirebaseAuth _auth = fb.FirebaseAuth.instance;
  final ApiClient _api = ApiClient();

  // ─── Current User ─────────────────────────────────────

  /// The currently signed-in Firebase user, or null.
  fb.User? get firebaseUser => _auth.currentUser;

  /// Stream of Firebase auth state changes.
  Stream<fb.User?> get authStateChanges => _auth.authStateChanges();

  /// Google serves profile photos at 96px by default (`=s96-c` suffix);
  /// request a larger size so avatars stay sharp in circles and headers.
  static String _googlePhotoUrl(String photoUrl) {
    if (photoUrl.isEmpty) return '';
    return photoUrl.replaceFirst(RegExp(r'=s\d+-c'), '=s512-c');
  }

  /// Whether a user is currently signed in (Firebase or local).
  Future<bool> get isSignedIn async {
    if (_auth.currentUser != null) return true;
    return await _api.isAuthenticated;
  }

  // ─── Register (email/password → MongoDB only) ──────────

  /// Register a new user with email + password.
  ///
  /// Stores credentials directly in MongoDB (no Firebase Auth).
  /// Returns the user profile and JWT token from the backend.
  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String name,
    required String username,
  }) async {
    try {
      final response = await _api.post(
        '/auth/register-local',
        body: {
          'email': email.trim(),
          'password': password,
          'name': name.trim(),
          'username': username.trim(),
        },
        auth: false,
      );

      if (!response.success) {
        throw AuthException(response.message ?? 'Registration failed');
      }

      // Store JWT token for future API calls
      final token = response.data?['token'] as String?;
      if (token != null) {
        await _api.setJwtToken(token);
      }

      // Store user data locally
      await _storeUserData(response.data!);

      // Track this account in the device's saved-accounts list
      await _saveCurrentAccountToSessionList(authMethod: 'local');

      return response.data!;
    } on AuthException {
      rethrow;
    } catch (e) {
      throw AuthException('Registration failed: ${e.toString()}');
    }
  }

  // ─── Login (email/password → MongoDB only) ────────────

  /// Login an existing user with email/username + password.
  ///
  /// Authenticates directly against MongoDB (no Firebase).
  /// Returns the user profile and JWT token from the backend.
  Future<Map<String, dynamic>> login({
    required String identifier,
    required String password,
  }) async {
    try {
      final response = await _api.post(
        '/auth/login-local',
        body: {
          'identifier': identifier.trim(),
          'password': password,
        },
        auth: false,
      );

      if (!response.success) {
        throw AuthException(response.message ?? 'Login failed');
      }

      // Store JWT token for future API calls
      final token = response.data?['token'] as String?;
      if (token != null) {
        await _api.setJwtToken(token);
      }

      // Store user data locally
      await _storeUserData(response.data!);

      // Track this account in the device's saved-accounts list
      await _saveCurrentAccountToSessionList(authMethod: 'local');

      return response.data!;
    } on AuthException {
      rethrow;
    } catch (e) {
      throw AuthException('Login failed: ${e.toString()}');
    }
  }

  // ─── Google Sign-In (Firebase + MongoDB both) ─────────

  /// Sign in with Google using Firebase Auth.
  ///
  /// Flow:
  ///  1. Opens Google sign-in popup via Firebase SDK
  ///  2. Gets the Firebase ID token
  ///  3. Tries backend login first
  ///  4. If user doesn't exist in backend, registers them (stored in both Firebase & MongoDB)
  ///
  /// Returns the user profile from the backend on success.
  Future<Map<String, dynamic>> signInWithGoogle() async {
    try {
      // Step 1: Create Google provider and sign in via popup
      final googleProvider = fb.GoogleAuthProvider();
      googleProvider.addScope('email');
      googleProvider.addScope('profile');

      final userCredential = await _auth.signInWithPopup(googleProvider);
      final user = userCredential.user;

      if (user == null) {
        throw AuthException('Google sign-in was cancelled');
      }

      // Step 2: Get Firebase ID token
      final idToken = await user.getIdToken();
      if (idToken == null) {
        throw AuthException('Failed to get authentication token');
      }

      // The Google profile photo becomes the Nexora avatar (the backend
      // backfills it only when the account doesn't have one yet).
      final photoUrl = _googlePhotoUrl(user.photoURL ?? '');

      // Step 3: Try backend login first (uses Firebase token → looks up by firebaseUid)
      try {
        final loginResponse = await _api.post(
          '/auth/login',
          body: {
            'idToken': idToken,
            if (photoUrl.isNotEmpty) 'avatar': photoUrl,
          },
          auth: false,
        );

        if (loginResponse.success) {
          await _storeUserData(loginResponse.data!);

          // Track this account in the device's saved-accounts list
          await _saveCurrentAccountToSessionList(authMethod: 'firebase');

          return loginResponse.data!;
        }
      } catch (_) {
        // Login failed — user probably doesn't exist in backend yet
      }

      // Step 4: Register new user (stored in both Firebase & MongoDB)
      final displayName = user.displayName ?? 'Google User';
      final email = user.email ?? '';

      // Generate a username from display name or email
      String username = displayName
          .toLowerCase()
          .replaceAll(RegExp(r'[^a-z0-9]'), '')
          .trim();
      if (username.isEmpty || username.length < 3) {
        username = email.split('@').first.replaceAll(RegExp(r'[^a-z0-9]'), '');
      }
      if (username.length < 3) {
        username = 'user${DateTime.now().millisecondsSinceEpoch}';
      }

      final registerResponse = await _api.post(
        '/auth/register',
        body: {
          'idToken': idToken,
          'name': displayName,
          'username': username,
          if (photoUrl.isNotEmpty) 'avatar': photoUrl,
        },
      );

      if (!registerResponse.success) {
        throw AuthException(
          registerResponse.message ?? 'Failed to create account with Google',
        );
      }

      await _storeUserData(registerResponse.data!);

      // Track this account in the device's saved-accounts list
      await _saveCurrentAccountToSessionList(authMethod: 'firebase');

      return registerResponse.data!;
    } on fb.FirebaseAuthException catch (e) {
      if (e.code == 'popup-blocked') {
        throw AuthException('Pop-up was blocked. Please allow pop-ups for this site.');
      }
      if (e.code == 'popup-closed-by-user') {
        throw AuthException('Sign-in cancelled');
      }
      throw AuthException(_firebaseAuthErrorMessage(e));
    } on AuthException {
      rethrow;
    } catch (e) {
      throw AuthException('Google sign-in failed: ${e.toString()}');
    }
  }

  // ─── Saved accounts (Switch Account) ─────────────────

  static const String _savedAccountsKey = 'saved_accounts';

  /// Accounts previously signed in on this device.
  /// Each entry: { username, name, avatar, authMethod, token? }
  Future<List<Map<String, String>>> getSavedAccounts() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_savedAccountsKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list
          .map((e) => Map<String, String>.from(e as Map))
          .where((e) => (e['username'] ?? '').isNotEmpty)
          .toList();
    } catch (_) {
      return [];
    }
  }

  /// Username of the currently active account.
  Future<String?> getCurrentUsername() async {
    final prefs = await SharedPreferences.getInstance();
    final username = prefs.getString('user_username');
    if (username != null && username.isNotEmpty) return username;
    return null;
  }

  /// Record the just-signed-in account in the saved-accounts list.
  /// Local (JWT) accounts keep their token so the user can switch back
  /// without re-entering credentials; Firebase accounts don't (their
  /// session lives in FirebaseAuth).
  Future<void> _saveCurrentAccountToSessionList({
    required String authMethod,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final username = prefs.getString('user_username') ?? '';
      if (username.isEmpty) return;

      final id = prefs.getString('user_id') ?? '';
      final name = prefs.getString('user_name') ?? '';
      final avatar = prefs.getString('user_avatar') ?? '';
      final token =
          authMethod == 'local' ? prefs.getString('auth_token') ?? '' : '';

      final accounts = await getSavedAccounts();
      accounts.removeWhere((a) => a['username'] == username);
      accounts.insert(0, {
        'username': username,
        'id': id,
        'name': name,
        'avatar': avatar,
        'authMethod': authMethod,
        if (token.isNotEmpty) 'token': token,
      });
      await prefs.setString(_savedAccountsKey, jsonEncode(accounts));
    } catch (_) {
      // Non-critical — switching just won't be seamless for this account
    }
  }

  /// Drop the current account's stored token (real logout) while keeping
  /// the account listed so the user can sign back in via Switch Account.
  Future<void> _removeCurrentAccountToken() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final username = prefs.getString('user_username') ?? '';
      if (username.isEmpty) return;

      final accounts = await getSavedAccounts();
      bool changed = false;
      for (final account in accounts) {
        if (account['username'] == username && account.containsKey('token')) {
          account.remove('token');
          changed = true;
        }
      }
      if (changed) {
        await prefs.setString(_savedAccountsKey, jsonEncode(accounts));
      }
    } catch (_) {
      // Non-critical
    }
  }

  /// Switch to another saved account.
  ///
  /// Returns:
  ///   'switched'    — session swapped and verified against the backend
  ///   'needs-login' — no usable token (Firebase account or expired JWT)
  ///   'error'       — unexpected failure
  Future<String> switchToAccount(String username) async {
    try {
      final accounts = await getSavedAccounts();
      final target = accounts.firstWhere(
        (a) => a['username'] == username,
        orElse: () => const {},
      );
      if (target.isEmpty) return 'error';

      final token = target['token'] ?? '';
      if (token.isEmpty) {
        // Firebase account (or logged-out account): full re-auth required
        return 'needs-login';
      }

      final prefs = await SharedPreferences.getInstance();

      // A local JWT session must not ride on top of a Firebase session —
      // the API layer prefers Firebase tokens, which would authenticate as
      // the wrong user.
      try {
        await _auth.signOut();
      } catch (_) {}

      // Swap the active JWT + cached profile to the target account
      await prefs.setString('auth_token', token);
      await prefs.setString('user_id', target['id'] ?? '');
      await prefs.setString('user_username', username);
      await prefs.setString('user_name', target['name'] ?? '');
      if ((target['avatar'] ?? '').isNotEmpty) {
        await prefs.setString('user_avatar', target['avatar']!);
      }

      // Verify the token is still valid and belongs to this account
      final response = await _api.get('/auth/me');
      if (!response.success || response.isUnauthorized) {
        // Token expired → drop it, require re-login
        await prefs.remove('auth_token');
        return 'needs-login';
      }

      final me = response.data?['user'] as Map<String, dynamic>?;
      if (me == null || me['username']?.toString() != username) {
        await prefs.remove('auth_token');
        return 'needs-login';
      }

      await _storeUserData({'user': me});

      // Reconnect realtime sockets under the new identity
      SocketService().disconnect();
      await SocketService().connect();

      return 'switched';
    } catch (_) {
      return 'error';
    }
  }

  // ─── Logout ───────────────────────────────────────────

  /// Sign out from Firebase (if applicable), notify the backend, drop the
  /// account's stored token, disconnect realtime sockets, and clear all
  /// local auth data.
  Future<void> logout() async {
    try {
      // Notify backend (fire-and-forget; never blocks logout)
      try {
        await _api.post('/auth/logout');
      } catch (_) {}
    } finally {
      try {
        await _auth.signOut();
      } catch (_) {}
      try {
        await _removeCurrentAccountToken();
      } catch (_) {}
      SocketService().disconnect();
      // Always clear local data, even if Firebase sign-out fails
      await _clearUserData();
    }
  }

  // ─── Session Restoration ──────────────────────────────

  /// Restore the user's session on app launch.
  ///
  /// Checks if there's an existing Firebase user or JWT token.
  /// Verifies the token is still valid by calling the backend `/auth/me` endpoint.
  ///
  /// Returns the user profile if the session is valid, or null if not.
  Future<Map<String, dynamic>?> restoreSession() async {
    try {
      // Check if we have a JWT token (local auth user)
      final jwt = await SharedPreferences.getInstance();
      final hasJwt = jwt.getString('auth_token')?.isNotEmpty ?? false;

      // Check if we have a Firebase user (Google sign-in user)
      final hasFirebase = _auth.currentUser != null;

      if (!hasJwt && !hasFirebase) return null;

      // Refresh Firebase token if available
      if (hasFirebase) {
        await _auth.currentUser!.getIdToken(true);
      }

      // Verify with backend (uses whichever token is available)
      final response = await _api.get('/auth/me');

      if (!response.success) {
        // Backend rejected the token — sign out
        try {
          await _auth.signOut();
        } catch (_) {}
        await _clearUserData();
        return null;
      }

      return response.data;
    } catch (e) {
      // Any error during session restore → sign out
      try {
        await _auth.signOut();
      } catch (_) {}
      await _clearUserData();
      return null;
    }
  }

  // ─── Get Current User Profile ─────────────────────────

  /// Fetch the current user's profile from the backend.
  Future<Map<String, dynamic>?> getCurrentUserProfile() async {
    try {
      final response = await _api.get('/auth/me');
      if (response.success) {
        return response.data;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  // ─── Token Refresh ────────────────────────────────────

  /// Force-refresh the Firebase ID token and return the new one.
  /// Useful before making API calls that require a fresh token.
  Future<String?> refreshIdToken() async {
    try {
      final user = _auth.currentUser;
      if (user == null) return null;
      return await user.getIdToken(true);
    } catch (_) {
      return null;
    }
  }

  // ─── Private Helpers ──────────────────────────────────

  /// Store user profile data in SharedPreferences.
  Future<void> _storeUserData(Map<String, dynamic> data) async {
    final prefs = await SharedPreferences.getInstance();
    final user = data['user'] as Map<String, dynamic>?;
    if (user != null) {
      await prefs.setString('user_id', user['_id']?.toString() ?? '');
      await prefs.setString('user_username', user['username']?.toString() ?? '');
      await prefs.setString('user_name', user['name']?.toString() ?? '');
      await prefs.setString('user_email', user['email']?.toString() ?? '');
      await prefs.setString('user_role', user['role']?.toString() ?? 'USER');
      if (user['avatar'] != null && (user['avatar'] as String).isNotEmpty) {
        await prefs.setString('user_avatar', user['avatar'] as String);
      }
    }
  }

  /// Clear all stored user data.
  Future<void> _clearUserData() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('user_id');
    await prefs.remove('user_username');
    await prefs.remove('user_name');
    await prefs.remove('user_email');
    await prefs.remove('user_role');
    await prefs.remove('user_avatar');
    await _api.clearToken();
  }

  /// Convert Firebase Auth errors to user-friendly messages.
  String _firebaseAuthErrorMessage(fb.FirebaseAuthException e) {
    switch (e.code) {
      case 'weak-password':
        return 'The password provided is too weak';
      case 'email-already-in-use':
        return 'An account already exists with this email';
      case 'user-not-found':
        return 'No account found with this email';
      case 'wrong-password':
        return 'Incorrect password';
      case 'invalid-email':
        return 'The email address is invalid';
      case 'user-disabled':
        return 'This account has been disabled';
      case 'too-many-requests':
        return 'Too many attempts. Please try again later';
      case 'network-request-failed':
        return 'Network error. Please check your connection';
      case 'invalid-credential':
        return 'Invalid email or password';
      default:
        return e.message ?? 'Authentication failed';
    }
  }
}

/// Custom exception for auth errors with user-friendly messages.
class AuthException implements Exception {
  final String message;
  const AuthException(this.message);

  @override
  String toString() => message;
}
