import 'package:flutter/material.dart';

import 'content_view.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  final TextEditingController _searchController = TextEditingController();

  final List<Map<String, dynamic>> content = [
    {
      'title': 'Future of Technology',
      'category': 'Technology',
      'icon': Icons.computer,
    },
    {
      'title': 'Gaming Community',
      'category': 'Gaming',
      'icon': Icons.sports_esports,
    },
    {
      'title': 'Creative Minds',
      'category': 'Art',
      'icon': Icons.palette_outlined,
    },
    {
      'title': 'Explore the World',
      'category': 'Travel',
      'icon': Icons.travel_explore,
    },
    {'title': 'Music & Culture', 'category': 'Music', 'icon': Icons.music_note},
    {
      'title': 'Science Today',
      'category': 'Science',
      'icon': Icons.science_outlined,
    },
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF080B1A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Explore',
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
      ),

      body: SafeArea(
        child: Column(
          children: [
            // Search
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 18),
              child: Container(
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFF151A2E),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: TextField(
                  controller: _searchController,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                  decoration: const InputDecoration(
                    hintText: 'Search Nexora...',
                    hintStyle: TextStyle(color: Colors.white54),
                    prefixIcon: Icon(Icons.search, color: Colors.white70),
                    border: InputBorder.none,
                  ),
                ),
              ),
            ),

            // Categories
            SizedBox(
              height: 42,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                children: [
                  _category('For You', true),
                  _category('Technology', false),
                  _category('Gaming', false),
                  _category('Music', false),
                  _category('Art', false),
                  _category('Science', false),
                ],
              ),
            ),

            const SizedBox(height: 18),

            // Explore content
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 0.9,
                ),
                itemCount: content.length,
                itemBuilder: (context, index) {
                  final item = content[index];

                  return GestureDetector(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => ContentViewerScreen(
                            title: item['title'].toString(),
                            category: item['category'].toString(),
                          ),
                        ),
                      );
                    },
                    child: Container(
                      decoration: BoxDecoration(
                        color: const Color(0xFF171D35),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Container(
                              width: double.infinity,
                              decoration: const BoxDecoration(
                                color: Color(0xFF252B45),
                                borderRadius: BorderRadius.vertical(
                                  top: Radius.circular(18),
                                ),
                              ),
                              child: Icon(
                                item['icon'],
                                color: const Color(0xFF6C8CFF),
                                size: 48,
                              ),
                            ),
                          ),

                          Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item['title'],
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  item['category'],
                                  style: const TextStyle(
                                    color: Colors.white54,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _category(String text, bool selected) {
    return Container(
      margin: const EdgeInsets.only(right: 10),
      padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 10),
      decoration: BoxDecoration(
        gradient: selected
            ? const LinearGradient(
                colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
              )
            : null,
        color: selected ? null : const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
        ),
      ),
    );
  }
}
