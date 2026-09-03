import 'package:flutter/material.dart';

import '../services/settings_service.dart';

class NotificationsSettingsScreen extends StatefulWidget {
  const NotificationsSettingsScreen({super.key});

  @override
  State<NotificationsSettingsScreen> createState() =>
      _NotificationsSettingsScreenState();
}

class _NotificationsSettingsScreenState
    extends State<NotificationsSettingsScreen> {
  final SettingsService _settingsService = SettingsService();

  bool pushNotifications = true;
  bool likesAndComments = true;
  bool newFollowers = true;
  bool messages = true;
  bool mentions = true;
  bool moments = true;
  bool clips = true;

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
        pushNotifications = settings['notificationsEnabled'] ?? true;
        likesAndComments = settings['likesAndComments'] ?? true;
        newFollowers = settings['newFollowers'] ?? true;
        messages = settings['messages'] ?? true;
        mentions = settings['mentions'] ?? true;
        moments = settings['moments'] ?? true;
        clips = settings['clips'] ?? true;
        _isLoading = false;
      });
    } else {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveSettings() async {
    await _settingsService.updateSettings({
      'notificationsEnabled': pushNotifications,
      'likesAndComments': likesAndComments,
      'newFollowers': newFollowers,
      'messages': messages,
      'mentions': mentions,
      'moments': moments,
      'clips': clips,
    });
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
          'Notifications',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Colors.white),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
              children: [
                _sectionTitle('General'),

                _settingsCard(
                  child: _switchTile(
                    icon: Icons.notifications_none,
                    title: 'Push Notifications',
                    subtitle: 'Allow Nexora to send notifications',
                    value: pushNotifications,
                    onChanged: (value) {
                      setState(() {
                        pushNotifications = value;
                      });
                      _saveSettings();
                    },
                  ),
                ),

                const SizedBox(height: 24),

                _sectionTitle('Activity'),

                _settingsCard(
                  child: Column(
                    children: [
                      _switchTile(
                        icon: Icons.favorite_border,
                        title: 'Likes & Comments',
                        subtitle: 'When someone interacts with your posts',
                        value: likesAndComments,
                        onChanged: pushNotifications
                            ? (value) {
                                setState(() {
                                  likesAndComments = value;
                                });
                                _saveSettings();
                              }
                            : null,
                      ),

                      _divider(),

                      _switchTile(
                        icon: Icons.person_add_outlined,
                        title: 'New Followers',
                        subtitle: 'When someone follows you',
                        value: newFollowers,
                        onChanged: pushNotifications
                            ? (value) {
                                setState(() {
                                  newFollowers = value;
                                });
                                _saveSettings();
                              }
                            : null,
                      ),

                      _divider(),

                      _switchTile(
                        icon: Icons.alternate_email,
                        title: 'Mentions',
                        subtitle: 'When someone mentions you',
                        value: mentions,
                        onChanged: pushNotifications
                            ? (value) {
                                setState(() {
                                  mentions = value;
                                });
                                _saveSettings();
                              }
                            : null,
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                _sectionTitle('Messages'),

                _settingsCard(
                  child: _switchTile(
                    icon: Icons.chat_bubble_outline,
                    title: 'Messages',
                    subtitle: 'New messages and chat activity',
                    value: messages,
                    onChanged: pushNotifications
                        ? (value) {
                            setState(() {
                              messages = value;
                            });
                            _saveSettings();
                          }
                        : null,
                  ),
                ),

                const SizedBox(height: 24),

                _sectionTitle('Nexora'),

                _settingsCard(
                  child: Column(
                    children: [
                      _switchTile(
                        icon: Icons.auto_awesome,
                        title: 'Moments',
                        subtitle: 'Updates from moments you follow',
                        value: moments,
                        onChanged: pushNotifications
                            ? (value) {
                                setState(() {
                                  moments = value;
                                });
                                _saveSettings();
                              }
                            : null,
                      ),

                      _divider(),

                      _switchTile(
                        icon: Icons.play_circle_outline,
                        title: 'Clips',
                        subtitle: 'New clips and recommendations',
                        value: clips,
                        onChanged: pushNotifications
                            ? (value) {
                                setState(() {
                                  clips = value;
                                });
                                _saveSettings();
                              }
                            : null,
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                _sectionTitle('Quiet Mode'),

                _settingsCard(
                  child: _actionTile(
                    icon: Icons.do_not_disturb_on_outlined,
                    title: 'Quiet Mode',
                    subtitle: 'Temporarily pause notifications',
                    onTap: () {
                      _settingsService.updateSettings({'notificationsEnabled': false});
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Quiet mode enabled. Notifications paused.'),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 2, bottom: 10),
      child: Text(
        title,
        style: const TextStyle(
          color: Colors.white70,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _settingsCard({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: child,
    );
  }

  Widget _switchTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool>? onChanged,
  }) {
    final enabled = onChanged != null;

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 13, 10, 13),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(13),
              gradient: LinearGradient(
                colors: [
                  const Color(0xFF3157D5).withOpacity(enabled ? 1 : 0.45),
                  const Color(0xFF7C3AED).withOpacity(enabled ? 1 : 0.45),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Icon(icon, color: Colors.white, size: 21),
          ),

          const SizedBox(width: 13),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: enabled ? Colors.white : Colors.white38,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),

                const SizedBox(height: 3),

                Text(
                  subtitle,
                  style: TextStyle(
                    color: enabled ? Colors.white54 : Colors.white24,
                    fontSize: 11.5,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),

          Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: Colors.white,
            activeTrackColor: const Color(0xFF6C63FF),
            inactiveThumbColor: Colors.white54,
            inactiveTrackColor: Colors.white12,
          ),
        ],
      ),
    );
  }

  Widget _actionTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
        child: Row(
          children: [
            Container(
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
              child: Icon(icon, color: Colors.white, size: 21),
            ),

            const SizedBox(width: 13),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),

                  const SizedBox(height: 3),

                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: Colors.white54,
                      fontSize: 11.5,
                    ),
                  ),
                ],
              ),
            ),

            const Icon(Icons.chevron_right, color: Colors.white54, size: 22),
          ],
        ),
      ),
    );
  }

  Widget _divider() {
    return Padding(
      padding: const EdgeInsets.only(left: 69),
      child: Divider(height: 1, color: Colors.white.withOpacity(0.05)),
    );
  }
}
