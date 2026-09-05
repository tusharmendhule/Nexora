import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:nexora/screens/login_screen.dart';
import 'package:nexora/screens/main_nav.dart';

import 'test_utils.dart';

/// On-device Google sign-in: Continue with Google → native account picker →
/// MainNavigation.
///
/// The test cannot operate the native (non-Flutter) account picker, so run it
/// while driving the picker over adb (see README). Prereqs: backend reachable
/// via `adb reverse tcp:5000 tcp:5000` and the app built with
/// `--dart-define=API_HOST=localhost`.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Continue with Google completes on device', (tester) async {
    await clearSession();
    await bootApp(tester);

    // A leftover Firebase session (from a prior Google sign-in) boots the app
    // straight to MainNavigation. Log out through the UI first so the flow
    // below starts from a clean state at the login screen.
    if (find.byType(MainNavigation).evaluate().isNotEmpty) {
      await tapBottomNav(tester, Icons.person_outline);
      await settle(tester);

      await tester.tap(find.byIcon(Icons.more_vert).hitTestable());
      await settle(tester);
      expect(find.text('Settings'), findsOneWidget);

      final logOutTile = find.text('Log Out');
      await tester.scrollUntilVisible(
        logOutTile,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await settle(tester);
      expect(logOutTile.evaluate().isNotEmpty, isTrue);
      await tester.tap(logOutTile);
      await settle(tester);

      final confirm = find.widgetWithText(TextButton, 'Log Out');
      expect(confirm.evaluate().isNotEmpty, isTrue);
      await tester.tap(confirm);
      await settle(tester);
    }

    // If we ended up on onboarding (no session at all), walk to login.
    final onLogin = await waitForAny(
      tester,
      [find.text('Welcome back'), find.byType(LoginScreen)],
      timeout: const Duration(seconds: 15),
    );
    if (!onLogin) {
      await goThroughOnboardingToLogin(tester);
    }
    expect(find.text('Welcome back'), findsOneWidget);

    final googleButton = find.text('Continue with Google');
    await tester.ensureVisible(googleButton);
    await settle(tester);
    await tester.tap(googleButton);

    // Poll (real time) for MainNavigation. The native Google account picker
    // is operated externally over adb while this loop runs.
    final end = DateTime.now().add(const Duration(minutes: 4));
    var landed = false;
    String? lastSnack;
    while (DateTime.now().isBefore(end)) {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      try {
        await tester.pump(const Duration(milliseconds: 100));
      } catch (_) {}
      if (find.byType(MainNavigation).evaluate().isNotEmpty) {
        landed = true;
        break;
      }
      final snackbar = find.byType(SnackBar);
      if (snackbar.evaluate().isNotEmpty) {
        lastSnack = find
            .descendant(of: snackbar, matching: find.byType(Text))
            .evaluate()
            .map((e) => (e.widget as Text).data)
            .whereType<String>()
            .join(' | ');
      }
    }
    if (lastSnack != null && lastSnack.isNotEmpty) {
      fail('Google sign-in failed: $lastSnack');
    }
    expect(landed, isTrue,
        reason: 'Timed out waiting for Google sign-in to complete');
  });
}
