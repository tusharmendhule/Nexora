import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'settings_service.dart';

/// A supported app language: [code] is the BCP-47 tag used by MaterialApp,
/// [name] is the language's English name (shown in pickers), and [native]
/// is how the language writes its own name.
class NexoraLanguage {
  final String code;
  final String name;
  final String native;

  const NexoraLanguage({
    required this.code,
    required this.name,
    required this.native,
  });
}

/// The languages Nexora ships translations for. Order is the order shown
/// in the Language settings screen.
const List<NexoraLanguage> kSupportedLanguages = [
  NexoraLanguage(code: 'en', name: 'English', native: 'English'),
  NexoraLanguage(code: 'hi', name: 'Hindi', native: 'हिन्दी'),
  NexoraLanguage(code: 'bn', name: 'Bengali', native: 'বাংলা'),
  NexoraLanguage(code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ'),
  NexoraLanguage(code: 'de', name: 'German', native: 'Deutsch'),
  NexoraLanguage(code: 'it', name: 'Italian', native: 'Italiano'),
  NexoraLanguage(code: 'pt', name: 'Portuguese', native: 'Português'),
];

/// Looks up a supported language by its BCP-47 code. Returns English when
/// the code is unknown so the app always has a valid locale.
NexoraLanguage languageByCode(String code) {
  return kSupportedLanguages.firstWhere(
    (l) => l.code == code,
    orElse: () => kSupportedLanguages.first,
  );
}

/// Legacy: settings stored the language's English *name* (e.g. "Hindi")
/// instead of a code. Accept both so previously saved accounts still load.
NexoraLanguage? languageByNameOrCode(String value) {
  for (final l in kSupportedLanguages) {
    if (l.code == value || l.name == value) return l;
  }
  return null;
}

/// Centralized app-language state for Nexora.
///
/// Single source of truth for the UI language. Persists through the backend
/// [SettingsService] (per-user) and mirrors to SharedPreferences as a local
/// cache so the choice survives restarts even when the backend is offline.
/// Listeners are notified so the whole app rebuilds in the new locale.
class LanguageController extends ChangeNotifier {
  LanguageController._internal();

  static final LanguageController instance = LanguageController._internal();

  factory LanguageController() => instance;

  static const String _prefsKey = 'app_language';

  /// How long to wait for the backend before falling back to local values.
  static const Duration _serverTimeout = Duration(seconds: 5);

  final SettingsService _settingsService = SettingsService();

  String _languageCode = 'en';

  String get languageCode => _languageCode;

  NexoraLanguage get language => languageByCode(_languageCode);

  /// English name of the current language (used by Settings rows).
  String get languageName => language.name;

  /// Native name of the current language.
  String get languageNativeName => language.native;

  /// Loads the saved language: local cache first (instant, offline-safe),
  /// then the backend value when available (authoritative per account).
  /// Never throws — failures fall back to the last known language.
  Future<void> load() async {
    await _loadLocalCache();

    try {
      final settings =
          await _settingsService.getSettings().timeout(_serverTimeout);
      if (settings.isNotEmpty && settings['language'] != null) {
        final loaded = languageByNameOrCode(settings['language'].toString());
        if (loaded != null && loaded.code != _languageCode) {
          _languageCode = loaded.code;
          notifyListeners();
        }
        await _saveLocalCache();
      }
    } catch (_) {
      // Offline / not signed in / server error — keep local value.
    }
  }

  /// Resets in-memory state to English (used by tests only).
  @visibleForTesting
  void resetForTesting() {
    if (_languageCode == 'en') return;
    _languageCode = 'en';
    notifyListeners();
  }

  /// Switches the app language, notifying listeners immediately so the UI
  /// updates, then persists locally and (best-effort) to the backend.
  Future<void> setLanguage(String code) async {
    final supported = languageByCode(code);
    if (_languageCode == supported.code) return;
    _languageCode = supported.code;
    notifyListeners();
    await _persist();
  }

  Future<void> _persist() async {
    await _saveLocalCache();

    // Backend is best-effort; never crash or block the UI on it.
    try {
      await _settingsService.updateSettings({'language': _languageCode});
    } catch (_) {
      // Persistence failure — in-memory state stays applied.
    }
  }

  Future<void> _saveLocalCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, jsonEncode({'language': _languageCode}));
    } catch (_) {
      // Ignore — cache is optional.
    }
  }

  Future<void> _loadLocalCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_prefsKey);
      if (raw == null || raw.isEmpty) return;

      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        final value = decoded['language']?.toString();
        final loaded = value == null ? null : languageByNameOrCode(value);
        if (loaded != null && loaded.code != _languageCode) {
          _languageCode = loaded.code;
          notifyListeners();
        }
      }
    } catch (_) {
      // Corrupt/legacy cache — fall through to defaults.
    }
  }
}
