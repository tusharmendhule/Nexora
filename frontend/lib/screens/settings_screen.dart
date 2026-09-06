import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../l10n/translations.dart';
import '../services/appearance_controller.dart';
import '../services/auth_service.dart';
import '../services/language_controller.dart';
import '../widgets/server_address_dialog.dart';
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

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Future<void> _push(Widget screen) async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => screen),
    );
    // Refresh (e.g. the Language row) when returning from a sub-screen.
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final currentLanguageName =
        LanguageController.instance.languageNativeName;

    return Scaffold(
      backgroundColor: context.nexora.background,
      appBar: AppBar(
        backgroundColor: context.nexora.background,
        elevation: 0,
        centerTitle: true,
        title: Text(
          tr(context, 'Settings'),
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
          _sectionTitle(context, tr(context, 'Account')),

          _settingsTile(
            context,
            icon: Icons.person_outline,
            title: tr(context, 'Account'),
            subtitle: tr(context, 'Manage your profile and account details'),
            onTap: () => _push(const AccountScreen()),
          ),

          _settingsTile(
            context,
            icon: Icons.lock_outline,
            title: tr(context, 'Privacy & Security'),
            subtitle: tr(context, 'Control your privacy and security'),
            onTap: () => _push(const PrivacySecurityScreen()),
          ),

          const SizedBox(height: 24),

          _sectionTitle(context, tr(context, 'Preferences')),

          _settingsTile(
            context,
            icon: Icons.palette_outlined,
            title: tr(context, 'Appearance'),
            subtitle: tr(context, 'Customize Nexora with gradients and themes'),
            onTap: () => _push(const AppearanceScreen()),
          ),

          _settingsTile(
            context,
            icon: Icons.notifications_none,
            title: tr(context, 'Notifications'),
            subtitle: tr(context, 'Manage your notification preferences'),
            onTap: () => _push(const NotificationsSettingsScreen()),
          ),

          _settingsTile(
            context,
            icon: Icons.language_outlined,
            title: tr(context, 'Language'),
            // Show the language actually in use — updating instantly as the
            // app language changes.
            subtitle: currentLanguageName.isEmpty
                ? tr(context, 'Choose your preferred language')
                : currentLanguageName,
            onTap: () => _push(const LanguageScreen()),
          ),

          const SizedBox(height: 24),

          _sectionTitle(context, tr(context, 'Content')),

          _settingsTile(
            context,
            icon: Icons.bookmark_border,
            title: tr(context, 'Saved'),
            subtitle: tr(context, 'View your saved posts and content'),
            onTap: () => _push(const SavedScreen()),
          ),

          _settingsTile(
            context,
            icon: Icons.tune,
            title: tr(context, 'Content Preferences'),
            subtitle: tr(context, 'Control what appears in your feed'),
            onTap: () => _push(const ContentPreferencesScreen()),
          ),

          const SizedBox(height: 24),

          _sectionTitle(context, tr(context, 'Developer')),

          _settingsTile(
            context,
            icon: Icons.dns_outlined,
            title: tr(context, 'Server Address'),
            subtitle: tr(
                context, 'Backend host for API calls (for testing on a phone)'),
            onTap: () => showServerAddressDialog(context),
          ),

          const SizedBox(height: 24),

          _sectionTitle(context, tr(context, 'Support')),

          _settingsTile(
            context,
            icon: Icons.help_outline,
            title: tr(context, 'Help & Support'),
            subtitle: tr(context, 'Get help with Nexora'),
            onTap: () => _push(const HelpSupportScreen()),
          ),

          _settingsTile(
            context,
            icon: Icons.info_outline,
            title: tr(context, 'About Nexora'),
            subtitle: tr(context, 'Learn more about Nexora'),
            onTap: () => _push(const AboutNexoraScreen()),
          ),

          const SizedBox(height: 24),

          _sectionTitle(context, tr(context, 'Session')),

          Container(
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: context.nexora.dangerSurface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.redAccent.withOpacity(0.12)),
            ),
            // Material wrapper keeps the ListTile ink ripple visible.
            child: Material(
              color: Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              clipBehavior: Clip.antiAlias,
              child: ListTile(
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
                leading: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: Colors.redAccent.withOpacity(0.12),
                  ),
                  child: Icon(
                      Icons.logout, color: Colors.redAccent.withOpacity(0.85)),
                ),
                title: Text(
                  tr(context, 'Log Out'),
                  style: const TextStyle(
                    color: Colors.redAccent,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(
                    tr(context, 'Sign out of your Nexora account'),
                    style:
                        TextStyle(color: context.nexora.textMuted, fontSize: 12),
                  ),
                ),
                trailing: Icon(Icons.chevron_right,
                    color: context.nexora.textHint),
                onTap: () => _confirmLogout(),
              ),
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
              tr(context, 'Your space. Your content. Your control.'),
              style: TextStyle(color: context.nexora.textHint, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmLogout() {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: context.nexora.card,
        title: Text(
          tr(dialogContext, 'Log Out?'),
          style: TextStyle(color: context.nexora.textPrimary),
        ),
        content: Text(
          tr(dialogContext, 'You will be signed out of your Nexora account.'),
          style: TextStyle(color: context.nexora.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(
              tr(dialogContext, 'Cancel'),
              style: TextStyle(color: context.nexora.textSecondary),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(dialogContext);
              final authService = AuthService();
              await authService.logout();
              if (mounted) {
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const LoginScreen(),
                  ),
                  (route) => false,
                );
              }
            },
            child: Text(
              tr(dialogContext, 'Log Out'),
              style: const TextStyle(color: Colors.redAccent),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(BuildContext context, String title) {
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

  Widget _settingsTile(
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
      // A Material is required between the colored DecoratedBox and the
      // ListTile so ink ripples and focus states stay visible.
      child: Material(
        color: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        clipBehavior: Clip.antiAlias,
        child: ListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
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
      ),
    );
  }
}
