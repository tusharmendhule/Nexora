// Nexora Appearance Settings Tests
// =================================
// Verifies the AppearanceController: dark mode, gradient selection,
// reduce animations and text size — including persistence via
// SharedPreferences (the backend is unreachable in tests, so the local
// cache is what makes settings survive a restart).
//
// Run with: flutter test test/appearance_controller_test.dart

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexora/services/appearance_controller.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final controller = AppearanceController.instance;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    controller.resetForTesting();
  });

  group('Defaults', () {
    test('first-run defaults match existing Nexora behavior', () {
      expect(controller.darkMode, isTrue);
      expect(controller.selectedGradient, 0);
      expect(controller.reduceAnimations, isFalse);
      expect(controller.textSize, 'medium');
      expect(controller.themeMode, ThemeMode.dark);
      expect(controller.textScaleFactor, 1.0);
    });

    test('six gradient options with the brand gradient as default', () {
      expect(kNexoraGradients.length, 6);
      expect(kNexoraGradientNames.length, 6);

      expect(kNexoraGradientNames[0], 'Nexora');
      expect(kNexoraGradientNames[1], 'Green Sunrise');
      expect(kNexoraGradientNames[2], 'Solar');
      expect(kNexoraGradientNames[3], 'Pink Meadow');
      expect(kNexoraGradientNames[4], 'Sunset Pink');
      expect(kNexoraGradientNames[5], 'Orange Purple');

      // Default gradient must be the existing brand gradient.
      expect(
        controller.gradientColors,
        [const Color(0xFF3157D5), const Color(0xFF7C3AED)],
      );
    });
  });

  group('Dark Mode', () {
    test('turning dark mode off switches theme mode to light', () async {
      await controller.setDarkMode(false);
      expect(controller.darkMode, isFalse);
      expect(controller.themeMode, ThemeMode.light);

      await controller.setDarkMode(true);
      expect(controller.themeMode, ThemeMode.dark);
    });

    test('dark mode state persists across a reload', () async {
      await controller.setDarkMode(false);
      await controller.load();
      expect(controller.darkMode, isFalse);
      expect(controller.themeMode, ThemeMode.light);

      await controller.setDarkMode(true);
      await controller.load();
      expect(controller.darkMode, isTrue);
    });
  });

  group('Gradient Selection', () {
    test('selecting a gradient updates the applied gradient', () async {
      await controller.setSelectedGradient(1); // Green Sunrise
      expect(controller.selectedGradient, 1);
      expect(controller.gradientColors, kNexoraGradients[1]);

      await controller.setSelectedGradient(4); // Sunset Pink
      expect(controller.gradientColors, kNexoraGradients[4]);
    });

    test('out-of-range gradient indices are clamped', () async {
      await controller.setSelectedGradient(99);
      expect(controller.selectedGradient, kNexoraGradients.length - 1);

      await controller.setSelectedGradient(-3);
      expect(controller.selectedGradient, 0);
    });

    test('selected gradient persists across a reload', () async {
      await controller.setSelectedGradient(3); // Pink Meadow
      await controller.load();
      expect(controller.selectedGradient, 3);
      expect(controller.gradientColors, kNexoraGradients[3]);
    });
  });

  group('Reduce Animations', () {
    test('toggling reduce animations updates state', () async {
      await controller.setReduceAnimations(true);
      expect(controller.reduceAnimations, isTrue);

      await controller.setReduceAnimations(false);
      expect(controller.reduceAnimations, isFalse);
    });

    test('reduce animations persists across a reload', () async {
      await controller.setReduceAnimations(true);
      await controller.load();
      expect(controller.reduceAnimations, isTrue);

      await controller.setReduceAnimations(false);
      await controller.load();
      expect(controller.reduceAnimations, isFalse);
    });
  });

  group('Text Size', () {
    test('changing text size updates the scale factor', () async {
      await controller.setTextSize('small');
      expect(controller.textSize, 'small');
      expect(controller.textScaleFactor, lessThan(1.0));

      await controller.setTextSize('medium');
      expect(controller.textScaleFactor, 1.0);

      await controller.setTextSize('large');
      expect(controller.textSize, 'large');
      expect(controller.textScaleFactor, greaterThan(1.0));
    });

    test('invalid text sizes are ignored', () async {
      await controller.setTextSize('huge');
      expect(controller.textSize, 'medium');
    });

    test('text size persists across a reload', () async {
      await controller.setTextSize('large');
      await controller.load();
      expect(controller.textSize, 'large');
      expect(controller.textScaleFactor, greaterThan(1.0));
    });
  });

  group('Notifications', () {
    test('controllers notify listeners on change', () async {
      var notified = 0;
      controller.addListener(() => notified++);

      await controller.setDarkMode(false);
      await controller.setReduceAnimations(true);
      await controller.setSelectedGradient(2);
      await controller.setTextSize('small');

      expect(notified, greaterThanOrEqualTo(4));
    });

    test('unchanged values do not notify', () async {
      var notified = 0;
      controller.addListener(() => notified++);

      await controller.setDarkMode(true); // already default
      expect(notified, 0);
    });
  });
}