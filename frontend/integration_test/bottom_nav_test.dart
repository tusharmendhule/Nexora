import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'test_utils.dart';

/// On-device bottom-navigation test: after login, every tab (Home, Messages,
/// Clips, Explore, Profile) can be selected and renders without error.
///
/// Prereqs: backend reachable (e.g. `adb reverse tcp:5000 tcp:5000`) and the
/// app built with `--dart-define=API_HOST=localhost`.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('all bottom tabs switch and render after login', (tester) async {
    final suffix = DateTime.now().millisecondsSinceEpoch;
    final username = 'nav$suffix';
    final email = '$username@example.com';
    final password = 'Password123!';

    await clearSession();
    await registerLocalUser(
      email: email,
      password: password,
      name: 'Nav Tester',
      username: username,
    );

    await bootApp(tester);
    await goThroughOnboardingToLogin(tester);
    await loginAndWaitForMain(
      tester,
      identifier: username,
      password: password,
    );

    // Nav icons in order: Home, Messages, Clips, Explore, Profile.
    const tabs = <(IconData, int)>[
      (Icons.home_outlined, 0),
      (Icons.chat_bubble_outline, 1),
      (Icons.play_circle_outline, 2),
      (Icons.search, 3),
      (Icons.person_outline, 4),
    ];

    for (final (icon, expectedIndex) in tabs) {
      await tapBottomNav(tester, icon);
      await settle(tester);

      expect(
        mainNavIndex(tester),
        expectedIndex,
        reason: 'Tab $expectedIndex did not become active after tapping '
            '$icon',
      );
    }

    // Profile is the final tab — confirm the signed-in user rendered there.
    final handleShown = await waitForAny(
      tester,
      [find.text('@$username')],
      timeout: const Duration(seconds: 15),
    );
    expect(handleShown, isTrue,
        reason: 'Profile tab did not show @$username');
  });
}
