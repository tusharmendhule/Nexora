import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

/// Firebase-backed authentication service for Nexora.
///
/// Handles:
/// - Registration (Firebase Auth + backend profile creation)
/// - Login (Firebase Auth + backend profile retrieval)
/// - Logout (Firebase sign-out + local cleanup)
/// - Session restoration (check if Firebase user exists on app launch)
/// - Username-to-email resolution for login
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

  /// Whether a user is currently signed in.
  bool get isSignedIn => _auth.currentUser != null;

  // ─── Register ─────────────────────────────────────────

  /// Register a new user with Firebase Auth and create their backend profile.
  ///
  /// 1. Creates a Firebase Auth user with email + password
  /// 2. Gets the Firebase ID token
  /// 3. Sends the token + profile data to the backend
  ///
  /// Returns the user profile from the backend on success.
  /// Throws [AuthException] on failure.
  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String name,
    required String username,
  }) async {
    try {
      // Step 1: Create Firebase Auth user
      final credential = await _auth.createUserWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );

      // Step 2: Update display name
      await credential.user?.updateDisplayName(name.trim());

      // Step 3: Get Firebase ID token
      final idToken = await credential.user?.getIdToken();
      if (idToken == null) {
        throw AuthException('Failed to get authentication token');
      }

      // Step 4: Create backend profile
      final response = await _api.post(
        '/auth/register',
        body: {
          'idToken': idToken,
          'name': name.trim(),
          'username': username.trim(),
        },
      );

      if (!response.success) {
        // If backend fails, clean up the Firebase user
        await credential.user?.delete();
        throw AuthException(response.message ?? 'Registration failed');
      }

      // Store user data locally
      await _storeUserData(response.data!);

      return response.data!;
    } on fb.FirebaseAuthException catch (e) {
      throw AuthException(_firebaseAuthErrorMessage(e));
    } on AuthException {
      rethrow;
    } catch (e) {
      throw AuthException('Registration failed: ${e.toString()}');
    }
  }

  // ─── Login ────────────────────────────────────────────

  /// Login an existing user with Firebase Auth.
  ///
  /// If [identifier] is a username (no `@`), it is resolved to an email
  /// via the backend `/auth/lookup-email` endpoint first.
  ///
  /// Returns the user profile from the backend on success.
  /// Throws [AuthException] on failure.
  Future<Map<String, dynamic>> login({
    required String identifier,
    required String password,
  }) async {
    try {
      String email;

      // Resolve username → email if needed
      if (identifier.contains('@')) {
        email = identifier.trim();
      } else {
        final resolveResponse = await _api.post(
          '/auth/lookup-email',
          body: {'identifier': identifier.trim()},
          auth: false,
        );

        if (!resolveResponse.success) {
          throw AuthException(
            resolveResponse.message ?? 'No account found with that username',
          );
        }

        email = resolveResponse.data!['email'] as String;
      }

      // Step 1: Sign in with Firebase Auth
      final credential = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      // Step 2: Get Firebase ID token
      final idToken = await credential.user?.getIdToken();
      if (idToken == null) {
        throw AuthException('Failed to get authentication token');
      }

      // Step 3: Get backend user profile
      final response = await _api.post(
        '/auth/login',
        body: {'idToken': idToken},
        auth: false,
      );

      if (!response.success) {
        throw AuthException(response.message ?? 'Login failed');
      }

      // Store user data locally
      await _storeUserData(response.data!);

      return response.data!;
    } on fb.FirebaseAuthException catch (e) {
      throw AuthException(_firebaseAuthErrorMessage(e));
    } on AuthException {
      rethrow;
    } catch (e) {
      throw AuthException('Login failed: ${e.toString()}');
    }
  }

  // ─── Logout ───────────────────────────────────────────

  /// Sign out from Firebase and clear all local auth data.
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
  /// Checks if Firebase Auth has an existing user. If so, verifies the
  /// token is still valid by calling the backend `/auth/me` endpoint.
  ///
  /// Returns the user profile if the session is valid, or null if not.
  Future<Map<String, dynamic>?> restoreSession() async {
    try {
      final user = _auth.currentUser;
      if (user == null) return null;

      // Refresh the ID token if it's about to expire
      await user.getIdToken(true);

      // Verify with backend
      final response = await _api.get('/auth/me');

      if (!response.success) {
        // Backend rejected the token — sign out
        await _auth.signOut();
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
