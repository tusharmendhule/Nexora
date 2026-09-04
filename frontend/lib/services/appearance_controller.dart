import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'settings_service.dart';

/// The six Nexora gradient options shown in the Appearance settings screen.
///
/// Single source of truth for gradient definitions — the order and colors
/// must match the existing UI exactly (index 0 is the default "Nexora"
/// brand gradient).
const List<List<Color>> kNexoraGradients = [
  [Color(0xFF3157D5), Color(0xFF7C3AED)], // Nexora
  [Color(0xFF16A34A), Color(0xFFEAB308)], // Green Sunrise
  [Color(0xFFEF4444), Color(0xFFF59E0B)], // Solar
  [Color(0xFFEC4899), Color(0xFF22C55E)], // Pink Meadow
  [Color(0xFFF59E0B), Color(0xFFEC4899)], // Sunset Pink
  [Color(0xFFF97316), Color(0xFF8B5CF6)], // Orange Purple
];

/// Display names for [kNexoraGradients], matching the existing UI labels.
const List<String> kNexoraGradientNames = [
  'Nexora',
  'Green Sunrise',
  'Solar',
  'Pink Meadow',
  'Sunset Pink',
  'Orange Purple',
];

/// Returns the currently selected Nexora gradient colors so any screen can
/// apply the user's chosen gradient to brand components.
List<Color> nexoraGradient() => AppearanceController.instance.gradientColors;

/// Centralized appearance state for Nexora.
///
/// Single source of truth for: darkMode, selectedGradient, reduceAnimations
/// and textSize. Persists through the existing backend [SettingsService]
/// (per-user, MongoDB) and mirrors to SharedPreferences as a local cache so
/// settings survive restarts even when the backend is unreachable or the
/// user is not signed in.
class AppearanceController extends ChangeNotifier {
  AppearanceController._internal();

  static final AppearanceController instance = AppearanceController._internal();

  factory AppearanceController() => instance;

  static const String _prefsKey = 'appearance_settings';

  static const List<String> _textSizes = ['small', 'medium', 'large'];

  static const double _smallTextScale = 0.9;
  static const double _largeTextScale = 1.15;

  /// How long to wait for the backend before falling back to local values.
  static const Duration _serverTimeout = Duration(seconds: 5);

  final SettingsService _settingsService = SettingsService();

  // ─── State (defaults match the existing first-run values) ────────────

  bool _darkMode = true; // backend default: theme 'dark'
  int _selectedGradient = 0; // Nexora (default)
  bool _reduceAnimations = false;
  String _textSize = 'medium';

  // ─── Getters ─────────────────────────────────────────────────────────

  bool get darkMode => _darkMode;

  int get selectedGradient => _selectedGradient;

  bool get reduceAnimations => _reduceAnimations;

  String get textSize => _textSize;

  ThemeMode get themeMode => _darkMode ? ThemeMode.dark : ThemeMode.light;

  List<Color> get gradientColors =>
      kNexoraGradients[_selectedGradient.clamp(0, kNexoraGradients.length - 1)];

  double get textScaleFactor {
    switch (_textSize) {
      case 'small':
        return _smallTextScale;
      case 'large':
        return _largeTextScale;
      default:
        return 1.0;
    }
  }

  // ─── Loading ─────────────────────────────────────────────────────────

  /// Loads saved appearance settings.
  ///
  /// Applies the local cache first (instant, works offline and before
  /// sign-in), then the backend value when available (authoritative for
  /// the signed-in user). Never throws — failures fall back to defaults
  /// or the last known values.
  Future<void> load() async {
    await _loadLocalCache();

    try {
      final settings =
          await _settingsService.getSettings().timeout(_serverTimeout);
      if (settings.isNotEmpty) {
        _applySettingsMap(settings);
        notifyListeners();
        await _saveLocalCache();
      }
    } catch (_) {
      // Offline / not signed in / server error — keep local values.
    }
  }

  /// Resets in-memory state to first-run defaults (used by tests only;
  /// does not touch persisted values).
  @visibleForTesting
  void resetForTesting() {
    _darkMode = true;
    _selectedGradient = 0;
    _reduceAnimations = false;
    _textSize = 'medium';
    notifyListeners();
  }

  // ─── Mutators (update state, notify UI, persist) ─────────────────────

  Future<void> setDarkMode(bool value) async {
    if (_darkMode == value) return;
    _darkMode = value;
    notifyListeners();
    await _persist();
  }

  Future<void> setSelectedGradient(int index) async {
    final safe = index.clamp(0, kNexoraGradients.length - 1);
    if (_selectedGradient == safe) return;
    _selectedGradient = safe;
    notifyListeners();
    await _persist();
  }

  Future<void> setReduceAnimations(bool value) async {
    if (_reduceAnimations == value) return;
    _reduceAnimations = value;
    notifyListeners();
    await _persist();
  }

  Future<void> setTextSize(String value) async {
    if (!_textSizes.contains(value) || _textSize == value) return;
    _textSize = value;
    notifyListeners();
    await _persist();
  }

  // ─── Persistence ─────────────────────────────────────────────────────

  Future<void> _persist() async {
    // Local cache first — always available and restart-safe.
    await _saveLocalCache();

    // Backend is best-effort; never crash the app or block the UI on it.
    try {
      await _settingsService.updateSettings({
        'darkMode': _darkMode,
        'theme': _darkMode ? 'dark' : 'light',
        'reduceAnimations': _reduceAnimations,
        'selectedGradient': _selectedGradient,
        'textSize': _textSize,
      });
    } catch (_) {
      // Persistence failure — in-memory state stays applied for the
      // session; nothing is falsely reported as saved.
    }
  }

  Future<void> _saveLocalCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _prefsKey,
        jsonEncode({
          'darkMode': _darkMode,
          'selectedGradient': _selectedGradient,
          'reduceAnimations': _reduceAnimations,
          'textSize': _textSize,
        }),
      );
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
        _applySettingsMap(decoded);
        notifyListeners();
      }
    } catch (_) {
      // Corrupt/legacy cache — fall through to defaults.
    }
  }

  /// Applies known appearance keys from a settings map (local cache or
  /// backend response). Unknown/invalid values are ignored so safe
  /// defaults or previously loaded values are kept.
  void _applySettingsMap(Map<String, dynamic> map) {
    if (map['darkMode'] is bool) {
      _darkMode = map['darkMode'] as bool;
    } else if (map['theme'] is String) {
      // Legacy 'theme' field — 'light' means dark mode is off.
      _darkMode = map['theme'] != 'light';
    }

    if (map['selectedGradient'] is num) {
      final index = (map['selectedGradient'] as num).toInt();
      _selectedGradient = index.clamp(0, kNexoraGradients.length - 1);
    }

    if (map['reduceAnimations'] is bool) {
      _reduceAnimations = map['reduceAnimations'] as bool;
    }

    if (map['textSize'] is String && _textSizes.contains(map['textSize'])) {
      _textSize = map['textSize'] as String;
    }
  }
}