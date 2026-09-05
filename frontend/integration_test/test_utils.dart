import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexora/main.dart' as app;
import 'package:nexora/screens/login_screen.dart';
import 'package:nexora/screens/main_nav.dart';
import 'package:nexora/services/api_client.dart';

/// Shared helpers for on-device integration tests.

/// Keys that together make up a stored session.
const List<String> _sessionKeys = [
  'auth_token',
  'user_id',
  'user_username',
  'user_name',
  'user_email',
  'user_role',
  'user_avatar',
  'user_data',
  'saved_accounts',
];

/// Clear any stored session so the app boots into onboarding.
Future<void> clearSession() async {
  final prefs = await SharedPreferences.getInstance();
  for (final key in _sessionKeys) {
    await prefs.remove(key);
  }
}

/// Register a brand-new user straight against the backend (no UI), so a
/// test can exercise login/navigation without a prior signup run.
Future<void> registerLocalUser({
  required String email,
  required String password,
  required String name,
  required String username,
}) async {
  final response = await ApiClient().post(
    '/auth/register-local',
    body: {
      'email': email,
      'password': password,
      'name': name,
      'username': username,
    },
    auth: false,
  );
  if (!response.success) {
    fail('Backend register-local failed: ${response.message}');
  }
}

/// Launch the real app and wait until it reaches onboarding (or, if a
/// session exists, login/main).
Future<void> bootApp(WidgetTester tester) async {
  app.main();
  final ready = await waitForAny(
    tester,
    [
      find.widgetWithText(ElevatedButton, 'Next'), // onboarding
      find.text('Welcome back'), // login
      find.byType(MainNavigation), // signed in
    ],
    timeout: const Duration(seconds: 30),
  );
  expect(ready, isTrue, reason: 'App did not reach a known screen');
}

/// Walk through the three onboarding pages to the Login screen.
Future<void> goThroughOnboardingToLogin(WidgetTester tester) async {
  var guard = 0;
  while (find.widgetWithText(ElevatedButton, 'Next').evaluate().isNotEmpty &&
      guard < 4) {
    await tester.tap(find.widgetWithText(ElevatedButton, 'Next'));
    await settle(tester);
    guard++;
  }

  final getStarted = find.widgetWithText(ElevatedButton, 'Get Started');
  if (getStarted.evaluate().isNotEmpty) {
    await tester.tap(getStarted);
    await settle(tester);
  }

  final onLogin = await waitForAny(
    tester,
    [find.text('Welcome back')],
    timeout: const Duration(seconds: 10),
  );
  expect(onLogin, isTrue, reason: 'Expected the Login screen');
}

/// Fill the login form with [identifier] and [password] and submit,
/// waiting until the main app appears.
Future<void> loginAndWaitForMain(
  WidgetTester tester, {
  required String identifier,
  required String password,
}) async {
  final fields = find.descendant(
    of: find.byType(LoginScreen),
    matching: find.byType(TextField),
  );
  expect(fields.evaluate().length, greaterThanOrEqualTo(2),
      reason: 'Login screen should have identifier + password fields');

  await tester.enterText(fields.at(0), identifier);
  await tester.enterText(fields.at(1), password);
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await settle(tester);

  final signIn = find.widgetWithText(ElevatedButton, 'Sign In');
  expect(signIn.evaluate().isNotEmpty, isTrue, reason: 'No Sign In button');
  await tester.ensureVisible(signIn);
  await settle(tester);
  await tester.tap(signIn);

  final landed = await waitForAny(
    tester,
    [find.byType(MainNavigation)],
    timeout: const Duration(seconds: 40),
    failOnSnackBar: true,
  );
  expect(landed, isTrue, reason: 'Timed out waiting for MainNavigation');
}

/// Pump until no more frames are scheduled, bounded so an infinite
/// progress spinner can never hang the test.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 100));
    if (!tester.binding.hasScheduledFrame) break;
  }
  await Future<void>.delayed(const Duration(milliseconds: 100));
}

/// Poll (with real elapsed time) until one of [finders] matches or the
/// timeout elapses. Optionally fails fast when a SnackBar appears.
Future<bool> waitForAny(
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
        fail('Unexpected snackbar: $text');
      }
    }
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  return false;
}

/// Current index of the tab-level IndexedStack under [MainNavigation].
int mainNavIndex(WidgetTester tester) {
  final stack = tester.widget<IndexedStack>(
    find
        .descendant(
          of: find.byType(MainNavigation),
          matching: find.byType(IndexedStack),
        )
        .first,
  );
  return stack.index ?? -1;
}

/// Tap a bottom-nav item by its icon.
///
/// Nav items are icon-only, and the same icon can appear inside tab content
/// (e.g. a search box). The nav bar always sits at the very bottom of the
/// screen, so we tap the lowest hit-testable instance of the icon.
Future<void> tapBottomNav(WidgetTester tester, IconData icon) async {
  final matches = find.byIcon(icon).hitTestable().evaluate().toList();
  expect(matches, isNotEmpty, reason: 'No tappable icon ${icon.codePoint}');

  Offset? lowest;
  double maxDy = -1;
  for (final element in matches) {
    final box = element.renderObject! as RenderBox;
    final center = box.localToGlobal(box.size.center(Offset.zero));
    if (center.dy > maxDy) {
      maxDy = center.dy;
      lowest = center;
    }
  }
  await tester.tapAt(lowest!);
}
