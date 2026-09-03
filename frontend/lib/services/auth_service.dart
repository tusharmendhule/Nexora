import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

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

      // Step 3: Try backend login first (uses Firebase token → looks up by firebaseUid)
      try {
        final loginResponse = await _api.post(
          '/auth/login',
          body: {'idToken': idToken},
          auth: false,
        );

        if (loginResponse.success) {
          await _storeUserData(loginResponse.data!);
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
        },
      );

      if (!registerResponse.success) {
        throw AuthException(
          registerResponse.message ?? 'Failed to create account with Google',
        );
      }

      await _storeUserData(registerResponse.data!);
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

  // ─── Logout ───────────────────────────────────────────

  /// Sign out from Firebase (if applicable) and clear all local auth data.
  Future<void> logout() async {
    try {
      await _auth.signOut();
    } finally {
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
