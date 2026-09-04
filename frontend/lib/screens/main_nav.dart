import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../services/appearance_controller.dart';
import 'home_screen.dart';
import 'msg_screen.dart';
import 'explore_screen.dart';
import 'clips_screen.dart';
import 'profile_screen.dart';

class MainNavigation extends StatefulWidget {
  final bool startWithEmptyHome;

  const MainNavigation({super.key, this.startWithEmptyHome = false});

  @override
  State<MainNavigation> createState() => _MainNavigationState();
}

class _MainNavigationState extends State<MainNavigation> {
  late int currentIndex;
  int previousIndex = 0;

  @override
  void initState() {
    super.initState();

    // Refresh appearance settings now that a user is signed in, so their
    // per-account theme/gradient/animations/text size apply.
    AppearanceController.instance.load();

    currentIndex = 0;
  }

  void changeTab(int index) {
    debugPrint('BOTTOM NAV TAPPED: $index');

    setState(() {
      if (index != currentIndex) {
        previousIndex = currentIndex;
      }
      currentIndex = index;
    });
  }

  /// The tab screens, rebuilt on every navigation so each one knows
  /// whether it is currently active (e.g. Clips pauses its audio when it
  /// is not the visible tab). Widget state is preserved because the order
  /// and types of the children never change.
  List<Widget> _screens() {
    return [
      HomeScreen(
        isEmpty: widget.startWithEmptyHome,
        onExploreClips: () => changeTab(2),
      ),
      MessagesScreen(),
      ClipsScreen(active: currentIndex == 2),
      ExploreScreen(),
      ProfileScreen(
        onBack: () {
          setState(() {
            currentIndex = previousIndex;
          });
        },
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: currentIndex, children: _screens()),

      bottomNavigationBar: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
        child: Container(
          height: 64,
          decoration: BoxDecoration(
            color: context.nexora.card,
            borderRadius: BorderRadius.circular(32),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _navItem(Icons.home_outlined, 0),
              _navItem(Icons.chat_bubble_outline, 1),
              _navItem(Icons.play_circle_outline, 2),
              _navItem(Icons.search, 3),
              _navItem(Icons.person_outline, 4),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem(IconData icon, int index) {
    final selected = currentIndex == index;

    return GestureDetector(
      onTap: () => changeTab(index),
      child: Icon(
        icon,
        size: 25,
        color: selected ? const Color(0xFF6C63FF) : context.nexora.textSecondary,
      ),
    );
  }
}
