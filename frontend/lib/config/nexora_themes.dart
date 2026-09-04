import 'package:flutter/material.dart';

/// Nexora light and dark Material themes.
///
/// The dark theme preserves the app's existing look. The light theme is its
/// counterpart, used when Dark Mode is turned off. These themes drive
/// Material-level defaults (scaffold background, dialogs, switches, text
/// fields, snackbars, ...).
class NexoraThemes {
  NexoraThemes._();

  /// Existing dark appearance (unchanged from the original app theme).
  static final ThemeData dark = ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: const Color(0xFF0B1020),
    fontFamily: 'Arial',
  );

  /// Light appearance used when Dark Mode is off.
  static final ThemeData light = ThemeData(
    brightness: Brightness.light,
    scaffoldBackgroundColor: const Color(0xFFF4F4FA),
    fontFamily: 'Arial',
  );
}

/// Semantic color palette that adapts to the active theme.
///
/// Screens used to hardcode dark-mode colors (e.g. `Color(0xFF0B0B1A)` or
/// `Colors.white`). Routing those through `context.nexora.*` lets the whole
/// app respond to Dark Mode. In dark mode every token resolves to the exact
/// color the screens used before, so nothing changes visually; in light mode
/// the same widgets get a proper light appearance.
class NexoraPalette {
  final BuildContext context;

  NexoraPalette(this.context);

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;

  // ─── Surfaces ────────────────────────────────────────────────────────

  /// Main screen background (`0xFF0B0B1A`).
  Color get background =>
      _isDark ? const Color(0xFF0B0B1A) : const Color(0xFFF4F4FA);

  /// Alternate screen background used by chat/post scaffolds (`0xFF080B1A`).
  Color get backgroundAlt =>
      _isDark ? const Color(0xFF080B1A) : const Color(0xFFF4F4FA);

  /// Card / tile background (`0xFF171D35`).
  Color get card =>
      _isDark ? const Color(0xFF171D35) : const Color(0xFFFFFFFF);

  /// Input field / text box background (`0xFF151A2E`).
  Color get field =>
      _isDark ? const Color(0xFF151A2E) : const Color(0xFFECECF5);

  /// Bottom sheet / modal background (`0xFF11162B`, `0xFF11162A`).
  Color get sheet =>
      _isDark ? const Color(0xFF11162B) : const Color(0xFFFFFFFF);

  /// Media placeholder / link preview background (`0xFF252B45`).
  Color get placeholder =>
      _isDark ? const Color(0xFF252B45) : const Color(0xFFE3E3EE);

  /// Selected chip / avatar background (`0xFF242A46`, `0xFF242A43`).
  Color get surfaceSelected =>
      _isDark ? const Color(0xFF242A46) : const Color(0xFFE8E8F2);

  /// Subtle fill for faint chips and dividers (`Colors.white10/12`).
  Color get surfaceSubtle =>
      _isDark ? Colors.white12 : const Color(0xFFEDEEF5);

  /// Switch inactive track (`0xFF30364F`).
  Color get switchTrack =>
      _isDark ? const Color(0xFF30364F) : const Color(0xFFD3D3E0);

  /// Destructive-action surface, e.g. the logout card (`0xFF211724`).
  Color get dangerSurface =>
      _isDark ? const Color(0xFF211724) : const Color(0xFFFFF0F2);

  /// Disabled button surface (`0xFF343441`).
  Color get disabled =>
      _isDark ? const Color(0xFF343441) : const Color(0xFFE1E1EA);

  // ─── Text & icons ────────────────────────────────────────────────────

  /// Primary text / icons on themed surfaces (`Colors.white`).
  Color get textPrimary =>
      _isDark ? Colors.white : const Color(0xFF171A26);

  /// Secondary text (`Colors.white70`).
  Color get textSecondary =>
      _isDark ? Colors.white70 : const Color(0xFF3D4357);

  /// Muted text / secondary icons (`Colors.white54`).
  Color get textMuted =>
      _isDark ? Colors.white54 : const Color(0xFF5E6578);

  /// Faint text / hints (`Colors.white38` / `Colors.white30`).
  Color get textHint =>
      _isDark ? Colors.white38 : const Color(0xFF7E8496);

  /// Very faint text / placeholders (`Colors.white24`).
  Color get textDim =>
      _isDark ? Colors.white24 : const Color(0xFF9BA1B0);
}

/// Exposes the adaptive palette as `context.nexora.background`, etc.
extension NexoraPaletteContext on BuildContext {
  NexoraPalette get nexora => NexoraPalette(this);
}