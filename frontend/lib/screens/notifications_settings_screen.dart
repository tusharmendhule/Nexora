import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../l10n/translations.dart';

import '../services/appearance_controller.dart';

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
          tr(context, 'Notifications'),
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      body: _isLoading
          ? Center(
              child: CircularProgressIndicator(color: context.nexora.textPrimary),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
              children: [
                _sectionTitle(tr(context, 'General')),

                _settingsCard(
                  child: _switchTile(
                    icon: Icons.notifications_none,
                    title: tr(context, 'Push Notifications'),
                    subtitle:
                        tr(context, 'Allow Nexora to send notifications'),
                    value: pushNotifications,
                    onChanged: (value) {
                      setState(() {
                        pushNotifications = value;
                      });
                      _saveSettings();
                    },
                  ),
                ),

                SizedBox(height: 24),

                _sectionTitle(tr(context, 'Activity')),

                _settingsCard(
                  child: Column(
                    children: [
                      _switchTile(
                        icon: Icons.favorite_border,
                        title: tr(context, 'Likes & Comments'),
                        subtitle:
                            tr(context, 'When someone interacts with your posts'),
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
                        title: tr(context, 'New Followers'),
                        subtitle: tr(context, 'When someone follows you'),
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
                        title: tr(context, 'Mentions'),
                        subtitle: tr(context, 'When someone mentions you'),
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

                SizedBox(height: 24),

                _sectionTitle(tr(context, 'Messages')),

                _settingsCard(
                  child: _switchTile(
                    icon: Icons.chat_bubble_outline,
                    title: tr(context, 'Messages'),
                    subtitle: tr(context, 'New messages and chat activity'),
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

                SizedBox(height: 24),

                _sectionTitle(tr(context, 'Nexora')),

                _settingsCard(
                  child: Column(
                    children: [
                      _switchTile(
                        icon: Icons.auto_awesome,
                        title: tr(context, 'Moments'),
                        subtitle:
                            tr(context, 'Updates from moments you follow'),
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
                        title: tr(context, 'Clips'),
                        subtitle:
                            tr(context, 'New clips and recommendations'),
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

                SizedBox(height: 24),

                _sectionTitle(tr(context, 'Quiet Mode')),

                _settingsCard(
                  child: _actionTile(
                    icon: Icons.do_not_disturb_on_outlined,
                    title: tr(context, 'Quiet Mode'),
                    subtitle:
                        tr(context, 'Temporarily pause notifications'),
                    onTap: () {
                      _settingsService.updateSettings({'notificationsEnabled': false});
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(tr(context,
                              'Quiet mode enabled. Notifications paused.')),
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
        style: TextStyle(
          color: context.nexora.textSecondary,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _settingsCard({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.nexora.textPrimary.withOpacity(0.05)),
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
            child: Icon(icon, color: context.nexora.textPrimary, size: 21),
          ),

          SizedBox(width: 13),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: enabled ? context.nexora.textPrimary : context.nexora.textHint,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),

                SizedBox(height: 3),

                Text(
                  subtitle,
                  style: TextStyle(
                    color: enabled ? context.nexora.textMuted : context.nexora.textDim,
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
            activeThumbColor: context.nexora.textPrimary,
            activeTrackColor: const Color(0xFF6C63FF),
            inactiveThumbColor: context.nexora.textMuted,
            inactiveTrackColor: context.nexora.surfaceSubtle,
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
                gradient: LinearGradient(
                  colors: nexoraGradient(),
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Icon(icon, color: context.nexora.textPrimary, size: 21),
            ),

            SizedBox(width: 13),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: context.nexora.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),

                  SizedBox(height: 3),

                  Text(
                    subtitle,
                    style: TextStyle(
                      color: context.nexora.textMuted,
                      fontSize: 11.5,
                    ),
                  ),
                ],
              ),
            ),

            Icon(Icons.chevron_right, color: context.nexora.textMuted, size: 22),
          ],
        ),
      ),
    );
  }

  Widget _divider() {
    return Padding(
      padding: const EdgeInsets.only(left: 69),
      child: Divider(height: 1, color: context.nexora.textPrimary.withOpacity(0.05)),
    );
  }
}
