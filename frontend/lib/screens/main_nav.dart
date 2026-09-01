import 'package:flutter/material.dart';

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

  late final List<Widget> screens;

  @override
  void initState() {
    super.initState();

    currentIndex = 0;

    screens = [
      HomeScreen(
        isEmpty: widget.startWithEmptyHome,
        onExploreClips: () => changeTab(2),
      ),
      MessagesScreen(),
      const ClipsScreen(),
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

  void changeTab(int index) {
    debugPrint('BOTTOM NAV TAPPED: $index');

    setState(() {
      if (index != currentIndex) {
        previousIndex = currentIndex;
      }
      currentIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: currentIndex, children: screens),

      bottomNavigationBar: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
        child: Container(
          height: 64,
          decoration: BoxDecoration(
            color: const Color(0xFF171D35),
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
        color: selected ? const Color(0xFF6C63FF) : Colors.white70,
      ),
    );
  }
}
