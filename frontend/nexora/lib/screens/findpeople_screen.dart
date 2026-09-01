import 'package:flutter/material.dart';

import 'main_nav.dart';

class FindPeopleScreen extends StatefulWidget {
  const FindPeopleScreen({super.key});

  @override
  State<FindPeopleScreen> createState() => _FindPeopleScreenState();
}

class _FindPeopleScreenState extends State<FindPeopleScreen> {
  final Set<int> followedUsers = {};

  final List<Map<String, dynamic>> people = const [
    {
      'name': 'Aarav Sharma',
      'username': '@aarav',
      'bio': 'Photography • Travel • Stories',
    },
    {
      'name': 'Maya Kapoor',
      'username': '@maya',
      'bio': 'Designing things worth remembering.',
    },
    {
      'name': 'Arjun Mehta',
      'username': '@arjun',
      'bio': 'Tech • Ideas • Late night thoughts',
    },
    {
      'name': 'Ananya Singh',
      'username': '@ananya',
      'bio': 'Finding beauty in ordinary moments.',
    },
    {
      'name': 'Rohan Verma',
      'username': '@rohan',
      'bio': 'Music • Films • Good conversations',
    },
    {
      'name': 'Kiara Patel',
      'username': '@kiara',
      'bio': 'Creator • Explorer • Dreamer',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0B1A),
      body: SafeArea(
        child: Column(
          children: [
            _topBar(),

            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                children: [
                  _hero(),

                  const SizedBox(height: 26),

                  const Text(
                    'People you may know',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),

                  const SizedBox(height: 5),

                  const Text(
                    'Follow people to personalize your Nexora experience.',
                    style: TextStyle(color: Colors.white54, fontSize: 12),
                  ),

                  const SizedBox(height: 16),

                  ...List.generate(
                    people.length,
                    (index) => _personCard(
                      index: index,
                      name: people[index]['name'] as String,
                      username: people[index]['username'] as String,
                      bio: people[index]['bio'] as String,
                    ),
                  ),

                  const SizedBox(height: 15),

                  _continueButton(),

                  const SizedBox(height: 10),

                  TextButton(
                    onPressed: _skip,
                    child: const Text(
                      'Skip for now',
                      style: TextStyle(
                        color: Colors.white54,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),

                  const SizedBox(height: 15),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _topBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
      child: Row(
        children: [
          _logo(),

          const Spacer(),

          TextButton(
            onPressed: _skip,
            child: const Text(
              'Skip',
              style: TextStyle(
                color: Colors.white54,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _logo() {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        gradient: const LinearGradient(
          colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Icon(
        Icons.auto_awesome_rounded,
        color: Colors.white,
        size: 22,
      ),
    );
  }

  Widget _hero() {
    return Column(
      children: [
        Container(
          width: 82,
          height: 82,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF7C3AED).withOpacity(0.25),
                blurRadius: 25,
                spreadRadius: 2,
              ),
            ],
          ),
          child: const Icon(
            Icons.people_alt_outlined,
            color: Colors.white,
            size: 39,
          ),
        ),

        const SizedBox(height: 20),

        const Text(
          'Find your people',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white,
            fontSize: 27,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
          ),
        ),

        const SizedBox(height: 8),

        const Text(
          'Connect with people, creators and friends\n'
          'who make Nexora more interesting.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white54, fontSize: 13, height: 1.45),
        ),
      ],
    );
  }

  Widget _personCard({
    required int index,
    required String name,
    required String username,
    required String bio,
  }) {
    final isFollowed = followedUsers.contains(index);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(17),
        border: Border.all(
          color: isFollowed
              ? const Color(0xFF7C3AED).withOpacity(0.35)
              : Colors.white.withOpacity(0.05),
        ),
      ),
      child: Row(
        children: [
          _avatar(index),

          const SizedBox(width: 12),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),

                const SizedBox(height: 3),

                Text(
                  username,
                  style: const TextStyle(color: Colors.white54, fontSize: 11),
                ),

                const SizedBox(height: 4),

                Text(
                  bio,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white38, fontSize: 10),
                ),
              ],
            ),
          ),

          const SizedBox(width: 10),

          SizedBox(
            height: 36,
            child: isFollowed
                ? OutlinedButton.icon(
                    onPressed: () {
                      setState(() {
                        followedUsers.remove(index);
                      });
                    },
                    icon: const Icon(Icons.check, size: 15),
                    label: const Text(
                      'Following',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF9B8CFF),
                      side: BorderSide(
                        color: const Color(0xFF7C3AED).withOpacity(0.4),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(11),
                      ),
                    ),
                  )
                : ElevatedButton(
                    onPressed: () {
                      setState(() {
                        followedUsers.add(index);
                      });
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF3157D5),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(horizontal: 15),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(11),
                      ),
                    ),
                    child: const Text(
                      'Follow',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _avatar(int index) {
    final gradients = [
      const [Color(0xFF3157D5), Color(0xFF7C3AED)],
      const [Color(0xFF16A34A), Color(0xFFEAB308)],
      const [Color(0xFFEC4899), Color(0xFF22C55E)],
      const [Color(0xFFF97316), Color(0xFF8B5CF6)],
      const [Color(0xFF0891B2), Color(0xFF6366F1)],
      const [Color(0xFFDB2777), Color(0xFFF59E0B)],
    ];

    return Container(
      width: 50,
      height: 50,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: gradients[index % gradients.length],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Icon(Icons.person, color: Colors.white, size: 25),
    );
  }

  Widget _continueButton() {
    final count = followedUsers.length;

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
        ),
        child: ElevatedButton(
          onPressed: () {
            Navigator.pushAndRemoveUntil(
              context,
              MaterialPageRoute(builder: (context) => const MainNavigation()),
              (route) => false,
            );
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          child: Text(
            count == 0
                ? 'Continue'
                : 'Continue with $count ${count == 1 ? 'follow' : 'follows'}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }

  void _skip() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (context) => const MainNavigation(startWithEmptyHome: true),
      ),
      (route) => false,
    ); // Navigation to Home will be connected after the Home screen is finalized.
  }
}
