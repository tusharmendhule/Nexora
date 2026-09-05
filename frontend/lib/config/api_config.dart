import 'dart:io' show Platform;

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:shared_preferences/shared_preferences.dart';

/// API configuration for Nexora backend.
///
/// Base URL points to the v1 API.
/// Change [baseUrl] to your deployed backend URL in production.
class ApiConfig {
  ApiConfig._();

  /// Backend host override, passed at build/run time:
  ///
  ///   flutter run --dart-define=API_HOST=192.168.1.50
  ///
  /// `10.0.2.2` (the default on Android) only works inside the Android
  /// emulator. When running on a physical phone, set this to the LAN IP of
  /// the machine running the backend (e.g. 192.168.1.50), or use the
  /// in-app Server address setting (gear icon) instead — no rebuild needed.
  static const String _envHostOverride = String.fromEnvironment('API_HOST');

  /// Port the backend listens on.
  static const int _port = 5000;

  /// SharedPreferences key backing the in-app Server address setting.
  static const String _savedHostKey = 'server_host_override';

  /// Host saved from the in-app Server address dialog. Takes precedence
  /// over the `--dart-define=API_HOST` override and the platform default,
  /// so a physical phone can point at a different backend without a rebuild.
  static String? _savedHost;

  /// The currently configured host override ('' = none configured; the
  /// build default or `--dart-define=API_HOST` applies).
  static String get configuredHost => _savedHost ?? '';

  /// The port the backend listens on (hosts are entered without it).
  static int get port => _port;

  /// Load the persisted server-host override from disk. Call once at
  /// startup before any network request so a saved address is honored
  /// immediately. Failures fall back to the default host.
  static Future<void> loadServerHostOverride() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_savedHostKey);
      _savedHost =
          (saved == null || saved.trim().isEmpty) ? null : saved.trim();
    } catch (_) {
      _savedHost = null;
    }
  }

  /// Persist a new server-host override. An empty [host] clears the
  /// override and reverts to the `--dart-define=API_HOST` value or the
  /// platform default.
  static Future<void> saveServerHostOverride(String host) async {
    final clean = normalizeHostInput(host);
    _savedHost = clean.isEmpty ? null : clean;
    try {
      final prefs = await SharedPreferences.getInstance();
      if (clean.isEmpty) {
        await prefs.remove(_savedHostKey);
      } else {
        await prefs.setString(_savedHostKey, clean);
      }
    } catch (_) {
      // Non-critical — the in-memory value still applies for this session.
    }
  }

  /// Tolerate sloppy input in the Server address dialog: strip a scheme
  /// (`http://`, `https://`), a port (`:5000`) and any trailing path so
  /// only the bare host remains (the port is fixed at [_port]).
  static String normalizeHostInput(String input) {
    var host = input.trim();
    final schemeIdx = host.indexOf('://');
    if (schemeIdx != -1) host = host.substring(schemeIdx + 3);
    final slashIdx = host.indexOf('/');
    if (slashIdx != -1) host = host.substring(0, slashIdx);
    if (!host.startsWith('[')) {
      // Strip a trailing :port (leave bracketed IPv6 literals alone).
      final colonIdx = host.indexOf(':');
      if (colonIdx != -1) host = host.substring(0, colonIdx);
    }
    return host.trim();
  }

  /// Host that can reach the backend.
  /// - Saved in-app Server address (wins over everything)
  /// - `--dart-define=API_HOST=...`
  /// - Android emulator: 10.0.2.2 (alias for the host machine's localhost)
  /// - Everything else: localhost
  static String get _host {
    if (_savedHost != null && _savedHost!.isNotEmpty) return _savedHost!;
    if (_envHostOverride.isNotEmpty) return _envHostOverride;
    return Platform.isAndroid ? '10.0.2.2' : 'localhost';
  }

  /// Backend base URL — change this for production.
  /// On web, use a relative URL (same origin when served from Express).
  /// On Android emulator, use 10.0.2.2 to reach localhost.
  static String get baseUrl {
    if (kIsWeb) return '/api/v1';
    return 'http://$_host:$_port/api/v1';
  }

  /// Legacy API base URL (pre-v1 endpoints such as /api/messages and
  /// /api/conversations that the messaging module uses).
  static String get legacyBaseUrl {
    if (kIsWeb) return '/api';
    return 'http://$_host:$_port/api';
  }

  /// Origin used for the Socket.IO connection (no path).
  static String get socketUrl {
    if (kIsWeb) return Uri.base.origin;
    return 'http://$_host:$_port';
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
