import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../services/appearance_controller.dart';

import '../services/auth_service.dart';
import 'login_screen.dart';
import 'language_screen.dart';
import 'about_nexora_screen.dart';
import 'help_support_screen.dart';
import 'account_screen.dart';
import 'content_preferences_screen.dart';
import 'saved_screen.dart';
import 'appearance_screen.dart';
import 'privacy_security_screen.dart';
import 'notifications_settings_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.background,
      appBar: AppBar(
        backgroundColor: context.nexora.background,
        elevation: 0,
        centerTitle: true,
        title: Text(
          'Settings',
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
        children: [
          _sectionTitle(context, 'Account'),

          _settingsTile(
            context,
            icon: Icons.person_outline,
            title: 'Account',
            subtitle: 'Manage your profile and account details',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const AccountScreen()),
              );
            },
          ),

          _settingsTile(
            context,
            icon: Icons.lock_outline,
            title: 'Privacy & Security',
            subtitle: 'Control your privacy and security',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const PrivacySecurityScreen(),
                ),
              );
            },
          ),

          const SizedBox(height: 24),

          _sectionTitle(context, 'Preferences'),

          _settingsTile(
            context,
            icon: Icons.palette_outlined,
            title: 'Appearance',
            subtitle: 'Customize Nexora with gradients and themes',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const AppearanceScreen(),
                ),
              );
            },
          ),

          _settingsTile(
            context,
            icon: Icons.notifications_none,
            title: 'Notifications',
            subtitle: 'Manage your notification preferences',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const NotificationsSettingsScreen(),
                ),
              );
            },
          ),

          _settingsTile(
            context,
            icon: Icons.language_outlined,
            title: 'Language',
            subtitle: 'Choose your preferred language',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const LanguageScreen()),
              );
            },
          ),

          const SizedBox(height: 24),

          _sectionTitle(context, 'Content'),

          _settingsTile(
            context,
            icon: Icons.bookmark_border,
            title: 'Saved',
            subtitle: 'View your saved posts and content',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const SavedScreen()),
              );
            },
          ),

          _settingsTile(
            context,
            icon: Icons.tune,
            title: 'Content Preferences',
            subtitle: 'Control what appears in your feed',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const ContentPreferencesScreen(),
                ),
              );
            },
          ),

          const SizedBox(height: 24),

          _sectionTitle(context, 'Support'),

          _settingsTile(
            context,
            icon: Icons.help_outline,
            title: 'Help & Support',
            subtitle: 'Get help with Nexora',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const HelpSupportScreen(),
                ),
              );
            },
          ),

          _settingsTile(
            context,
            icon: Icons.info_outline,
            title: 'About Nexora',
            subtitle: 'Learn more about Nexora',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const AboutNexoraScreen(),
                ),
              );
            },
          ),

          const SizedBox(height: 24),

          _sectionTitle(context, 'Session'),

          Container(
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: context.nexora.dangerSurface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.redAccent.withOpacity(0.12)),
            ),
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
              leading: Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: Colors.redAccent.withOpacity(0.12),
                ),
                child: Icon(Icons.logout, color: Colors.redAccent.withOpacity(0.85)),
              ),
              title: const Text(
                'Log Out',
                style: TextStyle(
                  color: Colors.redAccent,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(
                  'Sign out of your Nexora account',
                  style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
                ),
              ),
              trailing: Icon(Icons.chevron_right, color: context.nexora.textHint),
              onTap: () {
                showDialog(
                  context: context,
                  builder: (_) => AlertDialog(
                    backgroundColor: context.nexora.card,
                    title: Text(
                      'Log Out?',
                      style: TextStyle(color: context.nexora.textPrimary),
                    ),
                    content: Text(
                      'You will be signed out of your Nexora account.',
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
                        onPressed: () async {
                          Navigator.pop(context);
                          final authService = AuthService();
                          await authService.logout();
                          if (context.mounted) {
                            Navigator.pushAndRemoveUntil(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const LoginScreen(),
                              ),
                              (route) => false,
                            );
                          }
                        },
                        child: const Text(
                          'Log Out',
                          style: TextStyle(color: Colors.redAccent),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 30),

          Center(
            child: ShaderMask(
              shaderCallback: (bounds) {
                return LinearGradient(
                  colors: nexoraGradient(),
                ).createShader(bounds);
              },
              child: const Text(
                'Nexora',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
          ),

          const SizedBox(height: 6),

          Center(
            child: Text(
              'Your space. Your content. Your control.',
              style: TextStyle(color: context.nexora.textHint, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _sectionTitle(BuildContext context, String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 10),
      child: Text(
        title,
        style: TextStyle(
          color: context.nexora.textMuted,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.4,
        ),
      ),
    );
  }

  static Widget _settingsTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.nexora.textPrimary.withOpacity(0.05)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
        leading: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: LinearGradient(
              colors: nexoraGradient(),
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Icon(icon, color: Colors.white, size: 21),
        ),
        title: Text(
          title,
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Text(
            subtitle,
            style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
          ),
        ),
        trailing: Icon(Icons.chevron_right, color: context.nexora.textHint),
        onTap: onTap,
      ),
    );
  }
}
