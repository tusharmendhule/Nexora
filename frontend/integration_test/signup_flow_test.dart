import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexora/main.dart' as app;
import 'package:nexora/screens/main_nav.dart';
import 'package:nexora/screens/signup_screen.dart';

/// End-to-end signup flow on a real device.
///
/// Run with the backend reachable, e.g. via adb reverse:
///   adb reverse tcp:5000 tcp:5000
///   flutter test integration_test/signup_flow_test.dart \
///     -d `<device>` --dart-define=API_HOST=localhost
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('signup completes and lands on the main app', (tester) async {
    // Clear any leftover local session so the app boots into onboarding.
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    await prefs.remove('user_id');
    await prefs.remove('user_username');
    await prefs.remove('user_name');
    await prefs.remove('user_email');
    await prefs.remove('user_role');
    await prefs.remove('user_avatar');
    await prefs.remove('saved_accounts');

    // Launch the real app (splash → onboarding / session restore).
    app.main();

    // Wait for the app to boot and reach a screen we recognize.
    final booted = await _waitForAny(
      tester,
      [
        find.widgetWithText(ElevatedButton, 'Next'), // onboarding 1
        find.text('Welcome back'), // login (session present)
        find.byType(MainNavigation), // already signed in
      ],
      timeout: const Duration(seconds: 30),
    );
    expect(booted, isTrue, reason: 'App did not reach onboarding/login');

    // Walk through the onboarding pages (Next → Next → Get Started).
    var guard = 0;
    while (find.widgetWithText(ElevatedButton, 'Next').evaluate().isNotEmpty &&
        guard < 4) {
      await tester.tap(find.widgetWithText(ElevatedButton, 'Next'));
      await tester.pumpAndSettle();
      guard++;
    }

    final getStarted = find.widgetWithText(ElevatedButton, 'Get Started');
    if (getStarted.evaluate().isNotEmpty) {
      await tester.tap(getStarted);
      await tester.pumpAndSettle();
    }

    // Login screen: tap the "Create Account" link at the bottom.
    final signupLink = find.text('Create Account');
    final linkShown =
        await _waitForAny(tester, [signupLink], timeout: const Duration(seconds: 10));
    expect(linkShown, isTrue, reason: 'No Create Account link on login screen');
    await tester.ensureVisible(signupLink);
    await tester.tap(signupLink);
    await tester.pumpAndSettle();

    final onSignup =
        await _waitForAny(tester, [find.byType(SignUpScreen)], timeout: const Duration(seconds: 10));
    expect(onSignup, isTrue, reason: 'Expected to reach the SignUpScreen');

    // Unique credentials so the run never collides with an earlier one.
    final suffix = DateTime.now().millisecondsSinceEpoch;
    final email = 'e2e$suffix@example.com';
    final name = 'E2E Tester';
    final password = 'Password123!';

    final fields = find.descendant(
      of: find.byType(SignUpScreen),
      matching: find.byType(TextField),
    );
    expect(fields.evaluate().length, 3,
        reason: 'SignUpScreen should show Name/Email/Password fields');

    await tester.enterText(fields.at(0), name);
    await tester.enterText(fields.at(1), email);
    await tester.enterText(fields.at(2), password);
    await tester.testTextInput.receiveAction(TextInputAction.done);

    // Submit.
    final submit = find.widgetWithText(ElevatedButton, 'Create Account');
    await tester.ensureVisible(submit);
    await tester.pumpAndSettle();
    await tester.tap(submit);

    // Registration hits the backend; wait for navigation to the main app.
    final landed = await _waitForAny(
      tester,
      [find.byType(MainNavigation)],
      timeout: const Duration(seconds: 40),
      failOnSnackBar: true,
    );
    expect(landed, isTrue, reason: 'Timed out waiting for MainNavigation');
  });
}

/// Poll until [finders] matches (with real elapsed time), or timeout.
Future<bool> _waitForAny(
  WidgetTester tester,
  List<Finder> finders, {
  required Duration timeout,
  bool failOnSnackBar = false,
}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 100));
    for (final f in finders) {
      if (f.evaluate().isNotEmpty) return true;
    }
    if (failOnSnackBar) {
      final snackbar = find.byType(SnackBar);
      if (snackbar.evaluate().isNotEmpty) {
        final text = find
            .descendant(of: snackbar, matching: find.byType(Text))
            .evaluate()
            .map((e) => (e.widget as Text).data)
            .whereType<String>()
            .join(' | ');
        fail('Signup failed with snackbar: $text');
      }
    }
    // Small real-time sleep so real timers/network progress.
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  return false;
}
