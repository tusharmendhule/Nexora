import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../l10n/translations.dart';

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
      title: tr(context, 'Content Preferences'),
      description: tr(context, 'Control what appears in your Nexora feed.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Content'),
          items: [
            SettingsItem(
              icon: Icons.visibility_off_outlined,
              title: tr(context, 'Hidden Words'),
              subtitle: hiddenWords.isEmpty
                  ? tr(context, 'Hide posts containing specific words or phrases')
                  : hiddenWords.length == 1
                      ? tr(context, '1 hidden word')
                      : trP(
                          context, '{0} hidden words', ['${hiddenWords.length}']),
              type: SettingsItemType.navigation,
              onTap: _openHiddenWords,
            ),
            SettingsItem(
              icon: Icons.people_outline,
              title: tr(context, 'Creators You Follow'),
              subtitle: followedCreators.length == 1
                  ? tr(context, '1 followed creator')
                  : trP(context, '{0} followed creators',
                      ['${followedCreators.length}']),
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
      title: tr(context, 'Hidden Words'),
      description: tr(context,
          'Hide posts containing specific words or phrases from your feed.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Hidden Words'),
          items: [
            SettingsItem(
              icon: Icons.add,
              title: tr(context, 'Add Hidden Word'),
              subtitle: tr(context,
                  'Hide content containing a specific word or phrase'),
              type: SettingsItemType.navigation,
              onTap: _addHiddenWord,
            ),
          ],
        ),

        if (words.isNotEmpty)
          SettingsSection(
            title: tr(context, 'Your Hidden Words'),
            items: [
              for (final word in words)
                SettingsItem(
                  icon: Icons.visibility_off_outlined,
                  title: word,
                  subtitle: tr(context, 'Hidden word or phrase'),
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
            tr(context, 'Remove Hidden Word?'),
            style: TextStyle(color: context.nexora.textPrimary),
          ),
          content: Text(
            trP(context, 'Remove "{0}" from your hidden words?', [word]),
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
                tr(context, 'Remove'),
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
      title: tr(context, 'Add Hidden Word'),
      description: tr(context,
          'Enter a word or phrase to hide matching content from your feed.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Hidden Word'),
          items: [
            SettingsItem(
              icon: Icons.edit_outlined,
              title: tr(context, 'Word or Phrase'),
              subtitle: tr(context, 'Tap below to enter the word or phrase'),
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
            tr(context, 'Add Hidden Word'),
            style: TextStyle(color: context.nexora.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            style: TextStyle(color: context.nexora.textPrimary),
            decoration: InputDecoration(
              hintText: tr(context, 'Word or phrase'),
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
                tr(context, 'Add'),
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
      title: tr(context, 'Creators You Follow'),
      description: tr(context,
          'Manage how creators you follow influence your recommendations.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Creators'),
          items: [
            SettingsItem(
              icon: Icons.people_outline,
              title: tr(context, 'Followed Creators'),
              subtitle: widget.followedCreators.length == 1
                  ? tr(context, '1 creator')
                  : trP(context, '{0} creators',
                      ['${widget.followedCreators.length}']),
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
        content: Text(trP(context, 'Unfollowed {0}', [creator])),
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
            tr(context, 'Follow Creator'),
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
      title: tr(context, 'Followed Creators'),
      description: tr(context, 'Manage the creators you currently follow.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Creators'),
          items: [
            SettingsItem(
              icon: Icons.person_add_alt_1_outlined,
              title: tr(context, 'Follow Creator'),
              subtitle: tr(context, 'Add a creator to your followed list'),
              type: SettingsItemType.navigation,
              onTap: _followCreator,
            ),
          ],
        ),

        if (creators.isNotEmpty)
          SettingsSection(
            title: tr(context, 'Followed Creators'),
            items: [
              for (final creator in creators)
                SettingsItem(
                  icon: Icons.person_outline,
                  title: creator,
                  subtitle: tr(context, 'Creator'),
                  type: SettingsItemType.action,
                  onTap: () => _showCreatorOptions(creator),
                ),
            ],
          ),

        if (creators.isEmpty)
          SettingsSection(
            title: tr(context, 'Creators'),
            items: [
              SettingsItem(
                icon: Icons.people_outline,
                title: tr(context, 'No Followed Creators'),
                subtitle: tr(context, 'Creators you follow will appear here.'),
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
                    tr(context, 'Unfollow'),
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
