import 'package:flutter/material.dart';

class SavedScreen extends StatefulWidget {
  const SavedScreen({super.key});

  @override
  State<SavedScreen> createState() => _SavedScreenState();
}

class _SavedScreenState extends State<SavedScreen> {
  bool isGridView = false;
  String selectedSort = 'Newest saved';

  final List<Map<String, dynamic>> savedPosts = [
    {
      'title': 'A quiet moment above the clouds.',
      'author': 'Aarav',
      'gradient': [const Color(0xFF3157D5), const Color(0xFF7C3AED)],
      'order': 4,
    },
    {
      'title': 'Build something worth remembering.',
      'author': 'Maya',
      'gradient': [const Color(0xFF16A34A), const Color(0xFFEAB308)],
      'order': 3,
    },
    {
      'title': 'Late nights. Big ideas.',
      'author': 'Arjun',
      'gradient': [const Color(0xFFEC4899), const Color(0xFF22C55E)],
      'order': 2,
    },
    {
      'title': 'Find beauty in the ordinary.',
      'author': 'Ananya',
      'gradient': [const Color(0xFFF97316), const Color(0xFF8B5CF6)],
      'order': 1,
    },
  ];

  List<Map<String, dynamic>> get sortedPosts {
    final posts = List<Map<String, dynamic>>.from(savedPosts);

    switch (selectedSort) {
      case 'Newest saved':
        posts.sort((a, b) => (b['order'] as int).compareTo(a['order'] as int));
        break;

      case 'Oldest saved':
        posts.sort((a, b) => (a['order'] as int).compareTo(b['order'] as int));
        break;

      case 'Creator A–Z':
        posts.sort(
          (a, b) => (a['author'] as String).compareTo(b['author'] as String),
        );
        break;

      case 'Recently viewed':
        posts.sort((a, b) => (b['order'] as int).compareTo(a['order'] as int));
        break;
    }

    return posts;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0B1A),
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_new,
            color: Colors.white,
            size: 20,
          ),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Saved',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            tooltip: isGridView ? 'List view' : 'Grid view',
            onPressed: () {
              setState(() {
                isGridView = !isGridView;
              });
            },
            icon: Icon(
              isGridView ? Icons.view_list_rounded : Icons.grid_view_rounded,
              color: Colors.white,
              size: 22,
            ),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: savedPosts.isEmpty
          ? _emptyState()
          : Column(
              children: [
                _sortBar(),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    child: isGridView ? _buildGrid() : _buildList(),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _sortBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 6, 18, 12),
      child: Row(
        children: [
          const Icon(Icons.sort_rounded, color: Colors.white54, size: 18),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              selectedSort,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          GestureDetector(
            onTap: _showSortOptions,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: const Color(0xFF171D35),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white.withOpacity(0.06)),
              ),
              child: const Row(
                children: [
                  Text(
                    'Sort',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  SizedBox(width: 4),
                  Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: Colors.white54,
                    size: 17,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    return ListView.builder(
      key: const ValueKey('list'),
      padding: const EdgeInsets.fromLTRB(18, 2, 18, 30),
      itemCount: sortedPosts.length,
      itemBuilder: (context, index) {
        final post = sortedPosts[index];

        return _savedPostCard(
          title: post['title'] as String,
          author: post['author'] as String,
          gradient: post['gradient'] as List<Color>,
        );
      },
    );
  }

  Widget _buildGrid() {
    return GridView.builder(
      key: const ValueKey('grid'),
      padding: const EdgeInsets.fromLTRB(18, 2, 18, 30),
      itemCount: sortedPosts.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.82,
      ),
      itemBuilder: (context, index) {
        final post = sortedPosts[index];

        return _savedGridCard(
          title: post['title'] as String,
          author: post['author'] as String,
          gradient: post['gradient'] as List<Color>,
        );
      },
    );
  }

  Widget _savedPostCard({
    required String title,
    required String author,
    required List<Color> gradient,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 180,
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(20),
              ),
              gradient: LinearGradient(
                colors: gradient,
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Stack(
              children: [
                Positioned(
                  left: 18,
                  right: 18,
                  bottom: 18,
                  child: Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      height: 1.15,
                    ),
                  ),
                ),
                const Positioned(
                  top: 14,
                  right: 14,
                  child: Icon(Icons.bookmark, color: Colors.white, size: 22),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            child: Row(
              children: [
                _avatar(gradient),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '@$author',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () {},
                  icon: const Icon(Icons.more_horiz, color: Colors.white54),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _savedGridCard({
    required String title,
    required String author,
    required List<Color> gradient,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: gradient,
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Stack(
                  children: [
                    Positioned(
                      top: 10,
                      right: 10,
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.16),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.bookmark,
                          color: Colors.white,
                          size: 18,
                        ),
                      ),
                    ),
                    Positioned(
                      left: 12,
                      right: 12,
                      bottom: 12,
                      child: Text(
                        title,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          height: 1.15,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(11, 10, 7, 10),
              child: Row(
                children: [
                  _avatar(gradient, size: 28),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      '@$author',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const Icon(Icons.more_horiz, color: Colors.white38, size: 19),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _avatar(List<Color> gradient, {double size = 34}) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Icon(Icons.person, color: Colors.white, size: size * 0.53),
    );
  }

  void _showSortOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF11162A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        final options = [
          'Newest saved',
          'Oldest saved',
          'Recently viewed',
          'Creator A–Z',
        ];

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 38,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Sort saved posts',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                ...options.map((option) {
                  final selected = option == selectedSort;

                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      selected
                          ? Icons.radio_button_checked
                          : Icons.radio_button_off,
                      color: selected
                          ? const Color(0xFF7C3AED)
                          : Colors.white38,
                    ),
                    title: Text(
                      option,
                      style: TextStyle(
                        color: selected ? Colors.white : Colors.white70,
                        fontSize: 14,
                        fontWeight: selected
                            ? FontWeight.w600
                            : FontWeight.w400,
                      ),
                    ),
                    onTap: () {
                      setState(() {
                        selectedSort = option;
                      });
                      Navigator.pop(context);
                    },
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _emptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 74,
              height: 74,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: const Icon(
                Icons.bookmark_border,
                color: Colors.white,
                size: 34,
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Nothing saved yet',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Posts you save will appear here so you can easily find them later.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white54,
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
