import 'package:flutter/material.dart';

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
      backgroundColor: const Color(0xFF0B0B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0B1A),
        elevation: 0,
        centerTitle: true,
        title: const Text(
          'Settings',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
        children: [
          _sectionTitle('Account'),

          _settingsTile(
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

          _sectionTitle('Preferences'),

          _settingsTile(
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

          _sectionTitle('Content'),

          _settingsTile(
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

          _sectionTitle('Support'),

          _settingsTile(
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

          const SizedBox(height: 30),

          Center(
            child: ShaderMask(
              shaderCallback: (bounds) {
                return const LinearGradient(
                  colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
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

          const Center(
            child: Text(
              'Your space. Your content. Your control.',
              style: TextStyle(color: Colors.white38, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 10),
      child: Text(
        title,
        style: const TextStyle(
          color: Colors.white54,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.4,
        ),
      ),
    );
  }

  static Widget _settingsTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
        leading: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: const LinearGradient(
              colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Icon(icon, color: Colors.white, size: 21),
        ),
        title: Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Text(
            subtitle,
            style: const TextStyle(color: Colors.white54, fontSize: 12),
          ),
        ),
        trailing: const Icon(Icons.chevron_right, color: Colors.white38),
        onTap: onTap,
      ),
    );
  }
}
