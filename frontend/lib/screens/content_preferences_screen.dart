import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import '../services/settings_service.dart';
import 'settings_detail_screen.dart';

class ContentPreferencesScreen extends StatefulWidget {
  const ContentPreferencesScreen({super.key});

  @override
  State<ContentPreferencesScreen> createState() =>
      _ContentPreferencesScreenState();
}

class _ContentPreferencesScreenState extends State<ContentPreferencesScreen> {
  final SettingsService _settingsService = SettingsService();
  List<String> hiddenWords = [];
  List<String> followedCreators = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final settings = await _settingsService.getSettings();

    if (!mounted) return;

    if (settings.isNotEmpty) {
      setState(() {
        hiddenWords = List<String>.from(settings['hiddenWords'] ?? []);
        followedCreators =
            List<String>.from(settings['followedCreators'] ?? []);
        _isLoading = false;
      });
    } else {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveSettings() async {
    await _settingsService.updateSettings({
      'hiddenWords': hiddenWords,
      'followedCreators': followedCreators,
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        backgroundColor: context.nexora.background,
        body: Center(
          child: CircularProgressIndicator(color: context.nexora.textPrimary),
        ),
      );
    }

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
              subtitle: hiddenWords.isEmpty
                  ? 'Hide posts containing specific words or phrases'
                  : '${hiddenWords.length} hidden word'
                        '${hiddenWords.length == 1 ? '' : 's'}',
              type: SettingsItemType.navigation,
              onTap: _openHiddenWords,
            ),
            SettingsItem(
              icon: Icons.people_outline,
              title: 'Creators You Follow',
              subtitle:
                  '${followedCreators.length} followed creator'
                  '${followedCreators.length == 1 ? '' : 's'}',
              type: SettingsItemType.navigation,
              onTap: _openCreators,
            ),
          ],
        ),
      ],
    );
  }

  void _openHiddenWords() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => HiddenWordsScreen(
          hiddenWords: hiddenWords,
          onChanged: (updatedWords) {
            setState(() {
              hiddenWords = updatedWords;
            });
            _saveSettings();
          },
        ),
      ),
    ).then((_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  void _openCreators() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CreatorsYouFollowScreen(
          followedCreators: followedCreators,
          onChanged: (updatedCreators) {
            setState(() {
              followedCreators = updatedCreators;
            });
            _saveSettings();
          },
        ),
      ),
    ).then((_) {
      if (mounted) {
        setState(() {});
      }
    });
  }
}

class HiddenWordsScreen extends StatefulWidget {
  final List<String> hiddenWords;
  final void Function(List<String>) onChanged;

  const HiddenWordsScreen({
    super.key,
    required this.hiddenWords,
    required this.onChanged,
  });

  @override
  State<HiddenWordsScreen> createState() => _HiddenWordsScreenState();
}

class _HiddenWordsScreenState extends State<HiddenWordsScreen> {
  late List<String> words;

  @override
  void initState() {
    super.initState();
    words = List<String>.from(widget.hiddenWords);
  }

  void _addHiddenWord() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AddHiddenWordScreen(
          onAdd: (word) {
            if (!words.contains(word)) {
              setState(() {
                words.add(word);
              });
              widget.onChanged(words);
            }
          },
        ),
      ),
    ).then((_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  void _removeHiddenWord(String word) {
    setState(() {
      words.remove(word);
    });
    widget.onChanged(words);
  }

  @override
  Widget build(BuildContext context) {
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
          backgroundColor: context.nexora.card,
          title: Text(
            'Remove Hidden Word?',
            style: TextStyle(color: context.nexora.textPrimary),
          ),
          content: Text(
            'Remove "$word" from your hidden words?',
            style: TextStyle(color: context.nexora.textSecondary),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                'Cancel',
                style: TextStyle(color: context.nexora.textSecondary),
              ),
            ),
            TextButton(
              onPressed: () {
                _removeHiddenWord(word);
                Navigator.pop(context);
              },
              child: Text(
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
  final void Function(String) onAdd;

  const AddHiddenWordScreen({super.key, required this.onAdd});

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
          backgroundColor: context.nexora.card,
          title: Text(
            'Add Hidden Word',
            style: TextStyle(color: context.nexora.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            style: TextStyle(color: context.nexora.textPrimary),
            decoration: InputDecoration(
              hintText: 'Word or phrase',
              hintStyle: TextStyle(color: context.nexora.textHint),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                'Cancel',
                style: TextStyle(color: context.nexora.textSecondary),
              ),
            ),
            TextButton(
              onPressed: () {
                final word = controller.text.trim();

                if (word.isEmpty) {
                  return;
                }

                widget.onAdd(word);

                Navigator.pop(context);
                Navigator.pop(context);
              },
              child: Text(
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
  final List<String> followedCreators;
  final void Function(List<String>) onChanged;

  const CreatorsYouFollowScreen({
    super.key,
    required this.followedCreators,
    required this.onChanged,
  });

  @override
  State<CreatorsYouFollowScreen> createState() =>
      _CreatorsYouFollowScreenState();
}

class _CreatorsYouFollowScreenState extends State<CreatorsYouFollowScreen> {
  void _openFollowedCreators() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => FollowedCreatorsScreen(
          creators: widget.followedCreators,
          onChanged: widget.onChanged,
        ),
      ),
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
                  '${widget.followedCreators.length} creator'
                  '${widget.followedCreators.length == 1 ? '' : 's'}',
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
  final List<String> creators;
  final void Function(List<String>) onChanged;

  const FollowedCreatorsScreen({
    super.key,
    required this.creators,
    required this.onChanged,
  });

  @override
  State<FollowedCreatorsScreen> createState() =>
      _FollowedCreatorsScreenState();
}

class _FollowedCreatorsScreenState extends State<FollowedCreatorsScreen> {
  late List<String> creators;

  @override
  void initState() {
    super.initState();
    creators = List<String>.from(widget.creators);
  }

  void _unfollow(String creator) {
    setState(() {
      creators.remove(creator);
    });
    widget.onChanged(creators);

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
          backgroundColor: context.nexora.card,
          title: Text(
            'Follow Creator',
            style: TextStyle(color: context.nexora.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            style: TextStyle(color: context.nexora.textPrimary),
            decoration: InputDecoration(
              hintText: '@username',
              hintStyle: TextStyle(color: context.nexora.textHint),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                'Cancel',
                style: TextStyle(color: context.nexora.textSecondary),
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

                if (!creators.contains(username)) {
                  setState(() {
                    creators.add(username);
                  });
                  widget.onChanged(creators);
                }

                Navigator.pop(context);
              },
              child: Text(
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
      backgroundColor: context.nexora.card,
      shape: RoundedRectangleBorder(
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
                  leading: Icon(
                    Icons.person_outline,
                    color: context.nexora.textPrimary,
                  ),
                  title: Text(
                    creator,
                    style: TextStyle(
                      color: context.nexora.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Divider(color: context.nexora.surfaceSubtle),
                ListTile(
                  leading: Icon(
                    Icons.person_remove_outlined,
                    color: Colors.redAccent,
                  ),
                  title: Text(
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
