import 'package:flutter/material.dart';

import 'settings_detail_screen.dart';

class ContentPreferencesData {
  final List<String> hiddenWords = [];

  final List<String> followedCreators = ['@creator_one', '@creator_two'];
}

final ContentPreferencesData contentPreferencesData = ContentPreferencesData();

class ContentPreferencesScreen extends StatefulWidget {
  const ContentPreferencesScreen({super.key});

  @override
  State<ContentPreferencesScreen> createState() =>
      _ContentPreferencesScreenState();
}

class _ContentPreferencesScreenState extends State<ContentPreferencesScreen> {
  void _openHiddenWords() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const HiddenWordsScreen()),
    ).then((_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  void _openCreators() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const CreatorsYouFollowScreen()),
    ).then((_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Content Preferences',
      description: 'Control what appears in your Nexora feed.',
      sections: [
        SettingsSection(
          title: 'Content',
          items: [
            SettingsItem(
              icon: Icons.visibility_off_outlined,
              title: 'Hidden Words',
              subtitle: contentPreferencesData.hiddenWords.isEmpty
                  ? 'Hide posts containing specific words or phrases'
                  : '${contentPreferencesData.hiddenWords.length} hidden word'
                        '${contentPreferencesData.hiddenWords.length == 1 ? '' : 's'}',
              type: SettingsItemType.navigation,
              onTap: _openHiddenWords,
            ),
            SettingsItem(
              icon: Icons.people_outline,
              title: 'Creators You Follow',
              subtitle:
                  '${contentPreferencesData.followedCreators.length} followed creator'
                  '${contentPreferencesData.followedCreators.length == 1 ? '' : 's'}',
              type: SettingsItemType.navigation,
              onTap: _openCreators,
            ),
          ],
        ),
      ],
    );
  }
}

class HiddenWordsScreen extends StatefulWidget {
  const HiddenWordsScreen({super.key});

  @override
  State<HiddenWordsScreen> createState() => _HiddenWordsScreenState();
}

class _HiddenWordsScreenState extends State<HiddenWordsScreen> {
  void _addHiddenWord() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AddHiddenWordScreen()),
    ).then((_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  void _removeHiddenWord(String word) {
    setState(() {
      contentPreferencesData.hiddenWords.remove(word);
    });
  }

  @override
  Widget build(BuildContext context) {
    final words = contentPreferencesData.hiddenWords;

    return SettingsDetailScreen(
      title: 'Hidden Words',
      description:
          'Hide posts containing specific words or phrases from your feed.',
      sections: [
        SettingsSection(
          title: 'Hidden Words',
          items: [
            SettingsItem(
              icon: Icons.add,
              title: 'Add Hidden Word',
              subtitle: 'Hide content containing a specific word or phrase',
              type: SettingsItemType.navigation,
              onTap: _addHiddenWord,
            ),
          ],
        ),

        if (words.isNotEmpty)
          SettingsSection(
            title: 'Your Hidden Words',
            items: [
              for (final word in words)
                SettingsItem(
                  icon: Icons.visibility_off_outlined,
                  title: word,
                  subtitle: 'Hidden word or phrase',
                  type: SettingsItemType.action,
                  onTap: () => _showRemoveDialog(word),
                ),
            ],
          ),
      ],
    );
  }

  void _showRemoveDialog(String word) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF171D35),
          title: const Text(
            'Remove Hidden Word?',
            style: TextStyle(color: Colors.white),
          ),
          content: Text(
            'Remove "$word" from your hidden words?',
            style: const TextStyle(color: Colors.white70),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text(
                'Cancel',
                style: TextStyle(color: Colors.white70),
              ),
            ),
            TextButton(
              onPressed: () {
                _removeHiddenWord(word);
                Navigator.pop(context);
              },
              child: const Text(
                'Remove',
                style: TextStyle(color: Color(0xFF8B7CFF)),
              ),
            ),
          ],
        );
      },
    );
  }
}

class AddHiddenWordScreen extends StatefulWidget {
  const AddHiddenWordScreen({super.key});

  @override
  State<AddHiddenWordScreen> createState() => _AddHiddenWordScreenState();
}

class _AddHiddenWordScreenState extends State<AddHiddenWordScreen> {
  final TextEditingController controller = TextEditingController();

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Add Hidden Word',
      description:
          'Enter a word or phrase to hide matching content from your feed.',
      sections: [
        SettingsSection(
          title: 'Hidden Word',
          items: [
            SettingsItem(
              icon: Icons.edit_outlined,
              title: 'Word or Phrase',
              subtitle: 'Tap below to enter the word or phrase',
              type: SettingsItemType.action,
              onTap: () {
                _showInputDialog();
              },
            ),
          ],
        ),
      ],
    );
  }

  void _showInputDialog() {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF171D35),
          title: const Text(
            'Add Hidden Word',
            style: TextStyle(color: Colors.white),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(
              hintText: 'Word or phrase',
              hintStyle: TextStyle(color: Colors.white38),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text(
                'Cancel',
                style: TextStyle(color: Colors.white70),
              ),
            ),
            TextButton(
              onPressed: () {
                final word = controller.text.trim();

                if (word.isEmpty) {
                  return;
                }

                if (!contentPreferencesData.hiddenWords.contains(word)) {
                  contentPreferencesData.hiddenWords.add(word);
                }

                Navigator.pop(context);
                Navigator.pop(context);
              },
              child: const Text(
                'Add',
                style: TextStyle(color: Color(0xFF8B7CFF)),
              ),
            ),
          ],
        );
      },
    );
  }
}

class CreatorsYouFollowScreen extends StatefulWidget {
  const CreatorsYouFollowScreen({super.key});

  @override
  State<CreatorsYouFollowScreen> createState() =>
      _CreatorsYouFollowScreenState();
}

class _CreatorsYouFollowScreenState extends State<CreatorsYouFollowScreen> {
  void _openFollowedCreators() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const FollowedCreatorsScreen()),
    ).then((_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Creators You Follow',
      description:
          'Manage how creators you follow influence your recommendations.',
      sections: [
        SettingsSection(
          title: 'Creators',
          items: [
            SettingsItem(
              icon: Icons.people_outline,
              title: 'Followed Creators',
              subtitle:
                  '${contentPreferencesData.followedCreators.length} creator'
                  '${contentPreferencesData.followedCreators.length == 1 ? '' : 's'}',
              type: SettingsItemType.navigation,
              onTap: _openFollowedCreators,
            ),
          ],
        ),
      ],
    );
  }
}

class FollowedCreatorsScreen extends StatefulWidget {
  const FollowedCreatorsScreen({super.key});

  @override
  State<FollowedCreatorsScreen> createState() => _FollowedCreatorsScreenState();
}

class _FollowedCreatorsScreenState extends State<FollowedCreatorsScreen> {
  void _unfollow(String creator) {
    setState(() {
      contentPreferencesData.followedCreators.remove(creator);
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Unfollowed $creator'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _followCreator() {
    final controller = TextEditingController();

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF171D35),
          title: const Text(
            'Follow Creator',
            style: TextStyle(color: Colors.white),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(
              hintText: '@username',
              hintStyle: TextStyle(color: Colors.white38),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text(
                'Cancel',
                style: TextStyle(color: Colors.white70),
              ),
            ),
            TextButton(
              onPressed: () {
                var username = controller.text.trim();

                if (username.isEmpty) {
                  return;
                }

                if (!username.startsWith('@')) {
                  username = '@$username';
                }

                if (!contentPreferencesData.followedCreators.contains(
                  username,
                )) {
                  setState(() {
                    contentPreferencesData.followedCreators.add(username);
                  });
                }

                Navigator.pop(context);
              },
              child: const Text(
                'Follow',
                style: TextStyle(color: Color(0xFF8B7CFF)),
              ),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final creators = contentPreferencesData.followedCreators;

    return SettingsDetailScreen(
      title: 'Followed Creators',
      description: 'Manage the creators you currently follow.',
      sections: [
        SettingsSection(
          title: 'Creators',
          items: [
            SettingsItem(
              icon: Icons.person_add_alt_1_outlined,
              title: 'Follow Creator',
              subtitle: 'Add a creator to your followed list',
              type: SettingsItemType.navigation,
              onTap: _followCreator,
            ),
          ],
        ),

        if (creators.isNotEmpty)
          SettingsSection(
            title: 'Followed Creators',
            items: [
              for (final creator in creators)
                SettingsItem(
                  icon: Icons.person_outline,
                  title: creator,
                  subtitle: 'Creator',
                  type: SettingsItemType.action,
                  onTap: () => _showCreatorOptions(creator),
                ),
            ],
          ),

        if (creators.isEmpty)
          SettingsSection(
            title: 'Creators',
            items: const [
              SettingsItem(
                icon: Icons.people_outline,
                title: 'No Followed Creators',
                subtitle: 'Creators you follow will appear here.',
                type: SettingsItemType.action,
              ),
            ],
          ),
      ],
    );
  }

  void _showCreatorOptions(String creator) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF171D35),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  leading: const Icon(
                    Icons.person_outline,
                    color: Colors.white,
                  ),
                  title: Text(
                    creator,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const Divider(color: Colors.white12),
                ListTile(
                  leading: const Icon(
                    Icons.person_remove_outlined,
                    color: Colors.redAccent,
                  ),
                  title: const Text(
                    'Unfollow',
                    style: TextStyle(color: Colors.redAccent),
                  ),
                  onTap: () {
                    _unfollow(creator);
                    Navigator.pop(context);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
