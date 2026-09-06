import 'dart:async';

import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import '../models/post.dart';
import '../models/user.dart';
import '../l10n/translations.dart';
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
      backgroundColor: context.nexora.backgroundAlt,
      appBar: AppBar(
        backgroundColor: context.nexora.backgroundAlt,
        foregroundColor: context.nexora.textPrimary,
        elevation: 0,
        title: Text(
          tr(context, 'Explore'),
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
                  color: context.nexora.field,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: TextField(
                  controller: _searchController,
                  style: TextStyle(color: context.nexora.textPrimary, fontSize: 14),
                  onChanged: _onSearchChanged,
                  decoration: InputDecoration(
                    hintText: tr(context, 'Search Nexora...'),
                    hintStyle: TextStyle(color: context.nexora.textMuted),
                    prefixIcon: Icon(Icons.search, color: context.nexora.textSecondary),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            onPressed: () {
                              _searchController.clear();
                              _onSearchChanged('');
                            },
                            icon: Icon(Icons.clear, color: context.nexora.textMuted, size: 18),
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
                    child: _category(tr(context, cat['label']!), isSelected),
                  );
                },
              ),
            ),

            SizedBox(height: 18),

            // Content area
            Expanded(
              child: _isSearching
                  ? Center(
                      child: CircularProgressIndicator(color: context.nexora.textPrimary),
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
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off, color: context.nexora.textDim, size: 48),
            SizedBox(height: 16),
            Text(
              tr(context, 'No results found'),
              style: TextStyle(
                color: context.nexora.textMuted,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
            SizedBox(height: 8),
            Text(
              tr(context, 'Try a different search term'),
              style: TextStyle(color: context.nexora.textHint, fontSize: 13),
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
          Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text(
              tr(context, 'People'),
              style: TextStyle(
                color: context.nexora.textPrimary,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          ..._searchUsers.map((user) => _userResultTile(user)),
          SizedBox(height: 16),
        ],

        // Post results
        if (hasPosts) ...[
          Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text(
              tr(context, 'Posts'),
              style: TextStyle(
                color: context.nexora.textPrimary,
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
          color: context.nexora.card,
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
                  ? Icon(Icons.person, color: context.nexora.textPrimary)
                  : null,
            ),
            SizedBox(width: 12),
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
                          style: TextStyle(
                            color: context.nexora.textPrimary,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (user.isVerified) ...[
                        SizedBox(width: 4),
                        Icon(Icons.verified, color: Color(0xFF6C8CFF), size: 14),
                      ],
                    ],
                  ),
                  SizedBox(height: 2),
                  Text(
                    '@${user.username}',
                    style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
                  ),
                  if (user.bio != null && user.bio!.isNotEmpty) ...[
                    SizedBox(height: 2),
                    Text(
                      user.bio!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: context.nexora.textHint, fontSize: 11),
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
          color: context.nexora.card,
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
                      ? Icon(Icons.person, color: context.nexora.textPrimary, size: 14)
                      : null,
                ),
                SizedBox(width: 8),
                Text(
                  username,
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            if (text.isNotEmpty) ...[
              SizedBox(height: 8),
              Text(
                text,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: context.nexora.textSecondary,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
            ],
            if (post.hashtags != null && post.hashtags!.isNotEmpty) ...[
              SizedBox(height: 6),
              Wrap(
                spacing: 6,
                children: post.hashtags!
                    .take(3)
                    .map((tag) => Text(
                          '#$tag',
                          style: TextStyle(
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
              color: context.nexora.card,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: context.nexora.placeholder,
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
                        tr(context, item['title'] as String),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: context.nexora.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        tr(context, item['category'] as String),
                        style: TextStyle(
                          color: context.nexora.textMuted,
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
            ? LinearGradient(
                colors: [Color(0xFF2878E8), Color(0xFF673DE6)],
              )
            : null,
        color: selected ? null : context.nexora.card,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: context.nexora.textPrimary,
          fontSize: 12,
          fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
        ),
      ),
    );
  }
}
