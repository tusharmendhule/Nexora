import 'dart:io' show Platform;

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:shared_preferences/shared_preferences.dart';

/// API configuration for Nexora.
///
/// Web production builds must pass:
/// --dart-define=API_BASE_URL=https://nexora-backend-tznf.onrender.com
///
/// Android and other native platforms continue using the configured host
/// and port, including the in-app Server address setting.
class ApiConfig {
  ApiConfig._();

  /// Native backend host override.
  ///
  /// Example:
  /// flutter run --dart-define=API_HOST=192.168.1.50
  static const String _envHostOverride =
      String.fromEnvironment('API_HOST');

  /// Backend URL for Flutter web.
  ///
  /// Example:
  /// --dart-define=API_BASE_URL=https://nexora-backend-tznf.onrender.com
  static const String _envApiBaseUrl =
      String.fromEnvironment('API_BASE_URL');

  /// Native backend port.
  static const int _port = 5000;

  /// SharedPreferences key for the saved native server address.
  static const String _savedHostKey = 'server_host_override';

  /// Saved native host override.
  static String? _savedHost;

  /// Normalized backend origin for web requests.
  ///
  /// Removes trailing slashes to prevent malformed URLs.
  static String get _webApiOrigin {
    final value = _envApiBaseUrl.trim();

    if (value.isEmpty) {
      throw StateError(
        'API_BASE_URL is missing. Build the web app with '
        '--dart-define=API_BASE_URL=https://nexora-backend-tznf.onrender.com',
      );
    }

    final uri = Uri.tryParse(value);

    if (uri == null ||
        !uri.hasAuthority ||
        (uri.scheme != 'https' && uri.scheme != 'http') ||
        uri.host.isEmpty) {
      throw StateError(
        'Invalid API_BASE_URL: $value. '
        'Provide a valid backend URL.',
      );
    }

    if (uri.path.isNotEmpty && uri.path != '/') {
      throw StateError(
        'API_BASE_URL must contain only the backend origin, '
        'without an API path. Received: $value',
      );
    }

    if (uri.hasQuery || uri.hasFragment) {
      throw StateError(
        'API_BASE_URL must not contain a query or fragment.',
      );
    }

    return uri.origin;
  }

  /// Host currently saved in the in-app server settings.
  static String get configuredHost => _savedHost ?? '';

  /// Backend port for native platforms.
  static int get port => _port;

  /// Loads the saved native server address.
  ///
  /// Call once during app startup before making network requests.
  static Future<void> loadServerHostOverride() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_savedHostKey);

      _savedHost =
          (saved == null || saved.trim().isEmpty)
              ? null
              : normalizeHostInput(saved);
    } catch (_) {
      _savedHost = null;
    }
  }

  /// Saves a native server address entered in app settings.
  ///
  /// Supply a hostname or IP address, optionally with a scheme or port.
  /// Example: 192.168.1.50
  /// Example: http://192.168.1.50:5000
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
      // The in-memory value still applies for this session.
    }
  }

  /// Converts user-entered server addresses to a bare hostname.
  ///
  /// This setting is intended for native/local backend addresses.
  static String normalizeHostInput(String input) {
    var host = input.trim();

    if (host.isEmpty) return '';

    final schemeIdx = host.indexOf('://');

    if (schemeIdx != -1) {
      host = host.substring(schemeIdx + 3);
    }

    final slashIdx = host.indexOf('/');

    if (slashIdx != -1) {
      host = host.substring(0, slashIdx);
    }

    if (!host.startsWith('[')) {
      final colonIdx = host.indexOf(':');

      if (colonIdx != -1) {
        host = host.substring(0, colonIdx);
      }
    }

    return host.trim();
  }

  /// Resolves the native backend host.
  ///
  /// Priority:
  /// 1. Saved in-app server address.
  /// 2. API_HOST build-time override.
  /// 3. Android emulator host alias.
  /// 4. Localhost.
  static String get _host {
    if (_savedHost != null && _savedHost!.isNotEmpty) {
      return _savedHost!;
    }

    if (_envHostOverride.isNotEmpty) {
      return _envHostOverride;
    }

    return Platform.isAndroid ? '10.0.2.2' : 'localhost';
  }

  /// Version 1 API base URL.
  ///
  /// Web: https://nexora-backend-tznf.onrender.com/api/v1
  /// Native: http://HOST:5000/api/v1
  static String get baseUrl {
    if (kIsWeb) {
      return '$_webApiOrigin/api/v1';
    }

    return 'http://$_host:$_port/api/v1';
  }

  /// Legacy API base URL.
  ///
  /// Used by modules that call endpoints such as /api/messages
  /// and /api/conversations.
  static String get legacyBaseUrl {
    if (kIsWeb) {
      return '$_webApiOrigin/api';
    }

    return 'http://$_host:$_port/api';
  }

  /// Origin for Socket.IO connections.
  ///
  /// Uses the same backend origin as the HTTP API on web.
  static String get socketUrl {
    if (kIsWeb) {
      return _webApiOrigin;
    }

    return 'http://$_host:$_port';
  }

  /// HTTP request timeout.
  static const Duration timeout = Duration(seconds: 15);

  /// Default headers with the current Firebase ID token, if available.
  static Future<Map<String, String>> get headers async {
    final result = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    try {
      final user = fb.FirebaseAuth.instance.currentUser;

      if (user != null) {
        final token = await user.getIdToken();

        if (token != null && token.isNotEmpty) {
          result['Authorization'] = 'Bearer $token';
        }
      }
    } catch (_) {
      // No available Firebase token; continue without Authorization.
    }

    return result;
  }
}