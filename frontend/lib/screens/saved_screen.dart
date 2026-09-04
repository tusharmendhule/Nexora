import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import '../services/appearance_controller.dart';

import '../models/post.dart';
import '../services/post_service.dart';

class SavedScreen extends StatefulWidget {
  const SavedScreen({super.key});

  @override
  State<SavedScreen> createState() => _SavedScreenState();
}

class _SavedScreenState extends State<SavedScreen> {
  bool isGridView = false;
  String selectedSort = 'Newest saved';

  final PostService _postService = PostService();

  List<Post> _savedPosts = [];
  bool _isLoading = true;

  // Predefined gradient palette for cards
  static const List<List<Color>> _gradients = [
    [Color(0xFF3157D5), Color(0xFF7C3AED)],
    [Color(0xFF16A34A), Color(0xFFEAB308)],
    [Color(0xFFEC4899), Color(0xFF22C55E)],
    [Color(0xFFF97316), Color(0xFF8B5CF6)],
    [Color(0xFF0EA5E9), Color(0xFF6366F1)],
    [Color(0xFFE11D48), Color(0xFF0EA5E9)],
  ];

  @override
  void initState() {
    super.initState();
    _loadSavedPosts();
  }

  Future<void> _loadSavedPosts() async {
    setState(() => _isLoading = true);

    try {
      final result = await _postService.getSavedPosts(page: 1, limit: 20);
      final fetchedPosts = result['savedPosts'] as List<Post>;

      if (!mounted) return;

      setState(() {
        _savedPosts = fetchedPosts;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  List<Post> get sortedPosts {
    final posts = List<Post>.from(_savedPosts);

    switch (selectedSort) {
      case 'Newest saved':
        posts.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        break;
      case 'Oldest saved':
        posts.sort((a, b) => a.createdAt.compareTo(b.createdAt));
        break;
      case 'Creator A–Z':
        posts.sort(
          (a, b) => a.authorUsername.compareTo(b.authorUsername),
        );
        break;
      case 'Recently viewed':
        posts.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        break;
    }

    return posts;
  }

  List<Color> _gradientForPost(int index) {
    return _gradients[index % _gradients.length];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.background,
      appBar: AppBar(
        backgroundColor: context.nexora.background,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: Icon(
            Icons.arrow_back_ios_new,
            color: context.nexora.textPrimary,
            size: 20,
          ),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Saved',
          style: TextStyle(
            color: context.nexora.textPrimary,
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
              color: context.nexora.textPrimary,
              size: 22,
            ),
          ),
          SizedBox(width: 4),
        ],
      ),
      body: _isLoading
          ? Center(
              child: CircularProgressIndicator(
                color: Color(0xFF7C3AED),
              ),
            )
          : _savedPosts.isEmpty
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
          Icon(Icons.sort_rounded, color: context.nexora.textMuted, size: 18),
          SizedBox(width: 7),
          Expanded(
            child: Text(
              selectedSort,
              style: TextStyle(
                color: context.nexora.textSecondary,
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
                color: context.nexora.card,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: context.nexora.textPrimary.withOpacity(0.06)),
              ),
              child: Row(
                children: [
                  Text(
                    'Sort',
                    style: TextStyle(
                      color: context.nexora.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  SizedBox(width: 4),
                  Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: context.nexora.textMuted,
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
    final sorted = sortedPosts;
    return ListView.builder(
      key: const ValueKey('list'),
      padding: const EdgeInsets.fromLTRB(18, 2, 18, 30),
      itemCount: sorted.length,
      itemBuilder: (context, index) {
        final post = sorted[index];

        return _savedPostCard(
          post: post,
          gradient: _gradientForPost(index),
        );
      },
    );
  }

  Widget _buildGrid() {
    final sorted = sortedPosts;
    return GridView.builder(
      key: const ValueKey('grid'),
      padding: const EdgeInsets.fromLTRB(18, 2, 18, 30),
      itemCount: sorted.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.82,
      ),
      itemBuilder: (context, index) {
        final post = sorted[index];

        return _savedGridCard(
          post: post,
          gradient: _gradientForPost(index),
        );
      },
    );
  }

  Widget _savedPostCard({
    required Post post,
    required List<Color> gradient,
  }) {
    final title = post.text ?? '';
    final author = post.authorUsername;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.nexora.textPrimary.withOpacity(0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header area: show media image if available, otherwise gradient
          if (post.mediaUrl != null && post.mediaUrl!.isNotEmpty)
            Container(
              height: 180,
              decoration: BoxDecoration(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(20),
                ),
                image: DecorationImage(
                  image: NetworkImage(post.mediaUrl!),
                  fit: BoxFit.cover,
                ),
                color: context.nexora.placeholder,
              ),
              child: Stack(
                children: [
                  Positioned(
                    left: 18,
                    right: 18,
                    bottom: 18,
                    child: Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: context.nexora.textPrimary,
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        height: 1.15,
                      ),
                    ),
                  ),
                  Positioned(
                    top: 14,
                    right: 14,
                    child: Icon(Icons.bookmark, color: context.nexora.textPrimary, size: 22),
                  ),
                ],
              ),
            )
          else
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
                      style: TextStyle(
                        color: context.nexora.textPrimary,
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        height: 1.15,
                      ),
                    ),
                  ),
                  Positioned(
                    top: 14,
                    right: 14,
                    child: Icon(Icons.bookmark, color: context.nexora.textPrimary, size: 22),
                  ),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            child: Row(
              children: [
                _avatar(gradient),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '@$author',
                    style: TextStyle(
                      color: context.nexora.textSecondary,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => _unsavePost(post),
                  icon: Icon(Icons.more_horiz, color: context.nexora.textMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _savedGridCard({
    required Post post,
    required List<Color> gradient,
  }) {
    final title = post.text ?? '';
    final author = post.authorUsername;

    return Container(
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.nexora.textPrimary.withOpacity(0.06)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: post.mediaUrl != null && post.mediaUrl!.isNotEmpty
                  ? Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        image: DecorationImage(
                          image: NetworkImage(post.mediaUrl!),
                          fit: BoxFit.cover,
                        ),
                        color: context.nexora.placeholder,
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
                              child: Icon(
                                Icons.bookmark,
                                color: context.nexora.textPrimary,
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
                              style: TextStyle(
                                color: context.nexora.textPrimary,
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                height: 1.15,
                              ),
                            ),
                          ),
                        ],
                      ),
                    )
                  : Container(
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
                              child: Icon(
                                Icons.bookmark,
                                color: context.nexora.textPrimary,
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
                              style: TextStyle(
                                color: context.nexora.textPrimary,
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
                  SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      '@$author',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: context.nexora.textSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  Icon(Icons.more_horiz, color: context.nexora.textHint, size: 19),
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
      child: Icon(Icons.person, color: context.nexora.textPrimary, size: size * 0.53),
    );
  }

  void _showSortOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: context.nexora.sheet,
      shape: RoundedRectangleBorder(
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
                      color: context.nexora.textDim,
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
                SizedBox(height: 20),
                Text(
                  'Sort saved posts',
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 12),
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
                          : context.nexora.textHint,
                    ),
                    title: Text(
                      option,
                      style: TextStyle(
                        color: selected ? context.nexora.textPrimary : context.nexora.textSecondary,
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

  Future<void> _unsavePost(Post post) async {
    final result = await _postService.toggleSave(postId: post.id);
    if (!mounted) return;

    if (result['isSaved'] == false) {
      setState(() {
        _savedPosts.removeWhere((p) => p.id == post.id);
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Post removed from saved posts'),
          backgroundColor: context.nexora.card,
          duration: const Duration(seconds: 2),
        ),
      );
    }
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
                gradient: LinearGradient(
                  colors: nexoraGradient(),
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Icon(
                Icons.bookmark_border,
                color: context.nexora.textPrimary,
                size: 34,
              ),
            ),
            SizedBox(height: 20),
            Text(
              'Nothing saved yet',
              style: TextStyle(
                color: context.nexora.textPrimary,
                fontSize: 20,
                fontWeight: FontWeight.w600,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'Posts you save will appear here so you can easily find them later.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.nexora.textMuted,
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
