import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:nexora/screens/login_screen.dart';
import 'package:nexora/screens/main_nav.dart';

import 'test_utils.dart';

/// On-device auth cycle: login → profile loads → open settings → logout.
///
/// Prereqs: backend reachable (e.g. `adb reverse tcp:5000 tcp:5000`) and the
/// app built with `--dart-define=API_HOST=localhost`.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('login, profile and logout round-trip', (tester) async {
    final suffix = DateTime.now().millisecondsSinceEpoch;
    final username = 'cycle$suffix';
    final email = '$username@example.com';
    final password = 'Password123!';

    // Fresh backend account + clean local state.
    await clearSession();
    await registerLocalUser(
      email: email,
      password: password,
      name: 'Cycle Tester',
      username: username,
    );

    // Boot → onboarding → login with those credentials.
    await bootApp(tester);
    await goThroughOnboardingToLogin(tester);
    await loginAndWaitForMain(
      tester,
      identifier: username,
      password: password,
    );
    expect(find.byType(MainNavigation), findsOneWidget);

    // Profile tab shows the logged-in user's handle.
    await tapBottomNav(tester, Icons.person_outline);
    await settle(tester);
    final handleShown = await waitForAny(
      tester,
      [find.text('@$username')],
      timeout: const Duration(seconds: 15),
    );
    expect(handleShown, isTrue,
        reason: 'Profile did not show @$username after login');

    // Open Settings from the profile header.
    await tester.tap(find.byIcon(Icons.more_vert).hitTestable());
    await settle(tester);
    expect(find.text('Settings'), findsOneWidget);

    // Scroll down the settings list to the Log Out tile.
    final logOutTile = find.text('Log Out');
    await tester.scrollUntilVisible(
      logOutTile,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await settle(tester);
    expect(logOutTile.evaluate().isNotEmpty, isTrue,
        reason: 'Settings should contain a Log Out entry');
    await tester.tap(logOutTile);
    await settle(tester);

    final confirm = find.widgetWithText(TextButton, 'Log Out');
    expect(confirm.evaluate().isNotEmpty, isTrue,
        reason: 'Logout confirmation dialog did not appear');
    await tester.tap(confirm);
    await settle(tester);

    // Back on the login screen, session fully cleared.
    final backAtLogin = await waitForAny(
      tester,
      [find.text('Welcome back'), find.byType(LoginScreen)],
      timeout: const Duration(seconds: 15),
    );
    expect(backAtLogin, isTrue, reason: 'Logout did not return to login');
  });
}
