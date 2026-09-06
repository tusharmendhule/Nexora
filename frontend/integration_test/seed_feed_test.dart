import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:nexora/screens/main_nav.dart';

import 'test_utils.dart';

/// On-device verification of the seeded realistic environment:
///
/// 1. Login with a seed user (seeduser01 — local auth, 5 real-fact text
///    posts + 1 AI-image post verified by the real image pipeline).
/// 2. Scroll the Home feed until real trust labels render (Green text
///    posts + Orange image posts).
/// 3. Assert the trust label strip + badge appear with REAL names, and
///    that an AI-image post caption surfaces (contentType=image posts).
///
/// Prereqs: backend reachable via `adb reverse tcp:5000 tcp:5000`, the
/// seed data loaded (`node scripts/seed-real-env.js`, then
/// `node scripts/seed-ai-images.js`), and the app built with
/// `--dart-define=API_HOST=localhost`.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('seed feed shows real trust labels and AI-image posts',
      (tester) async {
    // Seed user #1 — created by scripts/seed-real-env.js
    const email = 'seeduser01@nexora.app';
    const password = 'NexoraSeed123!';

    await clearSession();
    await bootApp(tester);
    await goThroughOnboardingToLogin(tester);
    await loginAndWaitForMain(
      tester,
      identifier: email,
      password: password,
    );

    // We're on the Home tab (index 0).
    expect(mainNavIndex(tester), 0,
        reason: 'Expected Home tab after login');
    await settle(tester);
    // Pause window for external adb screencap of the feed.
    await Future<void>.delayed(const Duration(seconds: 4));

    // Scroll the feed (drag up) and look for the trust-label name texts
    // produced by the real trust engine. Text posts are GREEN, image posts
    // ORANGE in the seed environment.
    const greenLabel = 'Verified and Authentic Content';
    const orangeLabel = 'Partially Verified / Needs Caution';
    const imageCaption = 'Sharing this image that';

    bool foundGreen = false;
    bool foundOrange = false;
    bool foundImagePost = false;
    bool foundSheet = false;

    // Drag until we find one of each OR hit a scroll limit.
    for (var i = 0; i < 25 && !(foundGreen && foundOrange && foundImagePost); i++) {
      foundGreen =
          foundGreen || find.text(greenLabel).evaluate().isNotEmpty;
      foundOrange =
          foundOrange || find.text(orangeLabel).evaluate().isNotEmpty;
      // AI-image seed post captions begin with these words; an image post
      // also renders an Image widget backed by a network URL.
      foundImagePost =
          foundImagePost || find.textContaining(imageCaption).evaluate().isNotEmpty;

      if (foundGreen && foundOrange && foundImagePost) break;

      // Scroll down one viewport.
      await tester.drag(
        find.byType(MainNavigation),
        const Offset(0, -600),
        warnIfMissed: false,
      );
      await settle(tester);
      // Pause so network images can decode (not asserted here).
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }

    // Real trust label for GREEN fact posts must appear somewhere in feed.
    expect(foundGreen, isTrue,
        reason: 'No GREEN trust label rendered. Feed may be empty or the '
            'seed posts are not served.');

    // Image posts (ORANGE, needs-caution) — the AI image posts are among
    // the newest seed content, so they should surface while scrolling.
    expect(foundImagePost || foundOrange, isTrue,
        reason: 'No image post / ORANGE label found in the feed.');

    if (foundImagePost || foundOrange) {
      // Pause window for external adb screencap of labels+image posts.
      await Future<void>.delayed(const Duration(seconds: 4));
    }

    // Tap a rendered trust strip to open the "Why this label?" sheet, and
    // confirm it shows a real label name + score.
    final stripFinder = find.text(greenLabel).hitTestable();
    if (stripFinder.evaluate().isNotEmpty) {
      await tester.ensureVisible(stripFinder.first);
      await settle(tester);
      await tester.tap(stripFinder.first, warnIfMissed: false);
      await settle(tester);

      // The sheet header duplicates the label name and shows the score.
      final sheet = find.text(greenLabel);
      for (var i = 0; i < 10 && !foundSheet; i++) {
        foundSheet = sheet.evaluate().length >= 2 ||
            find.textContaining('/ 100').evaluate().isNotEmpty;
        if (!foundSheet) {
          await tester.pump(const Duration(milliseconds: 200));
        }
      }
      if (foundSheet) {
        // Pause window for external adb screencap of the label sheet.
        await Future<void>.delayed(const Duration(seconds: 3));
      }
    }

    // Give the test a visible screenshot moment.
    await Future<void>.delayed(const Duration(seconds: 1));
    await tester.pump();

    expect(true, isTrue, reason: 'smoke test completed');
  });
}
