import 'dart:async';

import 'package:flutter/material.dart';

import '../models/post.dart';
import '../models/user.dart';
import '../services/post_service.dart';
import '../services/user_service.dart';
import 'content_view.dart';
import 'user_profile_screen.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  final TextEditingController _searchController = TextEditingController();
  final PostService _postService = PostService();
  final UserService _userService = UserService();

  Timer? _debounce;
  bool _isSearching = false;
  bool _hasSearched = false;

  List<Post> _searchPosts = [];
  List<User> _searchUsers = [];
  String _activeCategory = 'For You';

  // Categories with hashtags
  final List<Map<String, String>> _categories = [
    {'label': 'For You', 'hashtag': ''},
    {'label': 'Technology', 'hashtag': 'technology'},
    {'label': 'Gaming', 'hashtag': 'gaming'},
    {'label': 'Music', 'hashtag': 'music'},
    {'label': 'Art', 'hashtag': 'art'},
    {'label': 'Science', 'hashtag': 'science'},
  ];

  // Default explore content when not searching
  final List<Map<String, dynamic>> _defaultContent = [
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
    {'title': 'Science Today', 'category': 'Science', 'icon': Icons.science_outlined},
  ];

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      _performSearch(query);
    });
  }

  Future<void> _performSearch(String query) async {
    if (query.trim().isEmpty) {
      setState(() {
        _hasSearched = false;
        _searchPosts = [];
        _searchUsers = [];
      });
      return;
    }

    setState(() {
      _isSearching = true;
      _hasSearched = true;
    });

    // Search both posts and users in parallel
    final postResultsFuture = _postService.searchPosts(query);
    final userResultsFuture = _userService.searchUsers(query);

    final postResults = await postResultsFuture;
    final userResults = await userResultsFuture;

    if (!mounted) return;

    setState(() {
      _searchPosts = postResults['posts'] as List<Post>;
      _searchUsers = userResults;
      _isSearching = false;
    });
  }

  Future<void> _searchByCategory(String hashtag) async {
    if (hashtag.isEmpty) {
      setState(() {
        _activeCategory = 'For You';
        _hasSearched = false;
        _searchPosts = [];
      });
      return;
    }

    setState(() {
      _activeCategory = hashtag;
      _isSearching = true;
      _hasSearched = true;
    });

    final result = await _postService.searchPosts(hashtag);

    if (!mounted) return;

    setState(() {
      _searchPosts = result['posts'] as List<Post>;
      _searchUsers = [];
      _isSearching = false;
    });
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
                  onChanged: _onSearchChanged,
                  decoration: InputDecoration(
                    hintText: 'Search Nexora...',
                    hintStyle: const TextStyle(color: Colors.white54),
                    prefixIcon: const Icon(Icons.search, color: Colors.white70),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            onPressed: () {
                              _searchController.clear();
                              _onSearchChanged('');
                            },
                            icon: const Icon(Icons.clear, color: Colors.white54, size: 18),
                          )
                        : null,
                    border: InputBorder.none,
                  ),
                ),
              ),
            ),

            // Categories
            SizedBox(
              height: 42,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                itemCount: _categories.length,
                itemBuilder: (context, index) {
                  final cat = _categories[index];
                  final isSelected = _activeCategory == cat['label'];
                  return GestureDetector(
                    onTap: () => _searchByCategory(cat['hashtag']!),
                    child: _category(cat['label']!, isSelected),
                  );
                },
              ),
            ),

            const SizedBox(height: 18),

            // Content area
            Expanded(
              child: _isSearching
                  ? const Center(
                      child: CircularProgressIndicator(color: Colors.white),
                    )
                  : _hasSearched
                      ? _buildSearchResults()
                      : _buildDefaultContent(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchResults() {
    final hasUsers = _searchUsers.isNotEmpty;
    final hasPosts = _searchPosts.isNotEmpty;

    if (!hasUsers && !hasPosts) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off, color: Colors.white24, size: 48),
            SizedBox(height: 16),
            Text(
              'No results found',
              style: TextStyle(
                color: Colors.white54,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'Try a different search term',
              style: TextStyle(color: Colors.white38, fontSize: 13),
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
      children: [
        // User results
        if (hasUsers) ...[
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text(
              'People',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          ..._searchUsers.map((user) => _userResultTile(user)),
          const SizedBox(height: 16),
        ],

        // Post results
        if (hasPosts) ...[
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text(
              'Posts',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          ..._searchPosts.map((post) => _postResultTile(post)),
        ],
      ],
    );
  }

  Widget _userResultTile(User user) {
    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => UserProfileScreen(username: user.username),
          ),
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF171D35),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: const Color(0xFF6C63FF),
              backgroundImage: user.profileImageUrl != null &&
                      user.profileImageUrl!.isNotEmpty
                  ? NetworkImage(user.profileImageUrl!)
                  : null,
              child: user.profileImageUrl == null || user.profileImageUrl!.isEmpty
                  ? const Icon(Icons.person, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          user.displayName ?? user.username,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (user.isVerified) ...[
                        const SizedBox(width: 4),
                        const Icon(Icons.verified, color: Color(0xFF6C8CFF), size: 14),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '@${user.username}',
                    style: const TextStyle(color: Colors.white54, fontSize: 12),
                  ),
                  if (user.bio != null && user.bio!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      user.bio!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white38, fontSize: 11),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _postResultTile(Post post) {
    final username = post.authorUsername;
    final text = post.text ?? '';

    return GestureDetector(
      onTap: () {
        // Navigate to content viewer or home
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ContentViewerScreen(
              title: text.length > 50 ? '${text.substring(0, 50)}...' : text,
              category: post.contentType,
            ),
          ),
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF171D35),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundColor: const Color(0xFF6C63FF),
                  backgroundImage: post.authorAvatar != null &&
                          post.authorAvatar!.isNotEmpty
                      ? NetworkImage(post.authorAvatar!)
                      : null,
                  child: post.authorAvatar == null || post.authorAvatar!.isEmpty
                      ? const Icon(Icons.person, color: Colors.white, size: 14)
                      : null,
                ),
                const SizedBox(width: 8),
                Text(
                  username,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            if (text.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                text,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
            ],
            if (post.hashtags != null && post.hashtags!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                children: post.hashtags!
                    .take(3)
                    .map((tag) => Text(
                          '#$tag',
                          style: const TextStyle(
                            color: Color(0xFF7D8CFF),
                            fontSize: 11,
                          ),
                        ))
                    .toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDefaultContent() {
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.9,
      ),
      itemCount: _defaultContent.length,
      itemBuilder: (context, index) {
        final item = _defaultContent[index];

        return GestureDetector(
          onTap: () {
            // Search by category
            final hashtag = _categories[index]['hashtag'] ?? '';
            if (hashtag.isNotEmpty) {
              _searchByCategory(hashtag);
            } else {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => ContentViewerScreen(
                    title: item['title'].toString(),
                    category: item['category'].toString(),
                  ),
                ),
              );
            }
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
