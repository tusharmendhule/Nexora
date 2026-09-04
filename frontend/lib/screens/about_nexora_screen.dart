import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import '../services/appearance_controller.dart';

import 'help_support_screen.dart';
import 'settings_detail_screen.dart';

class AboutNexoraScreen extends StatelessWidget {
  const AboutNexoraScreen({super.key});

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
          'About Nexora',
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 35),
        children: [
          _hero(context),

          SizedBox(height: 26),

          _sectionTitle(context, 'About Nexora'),

          _infoCard(
            context,
            icon: Icons.auto_awesome_outlined,
            title: 'A space made for you',
            description:
                'Nexora is designed to bring people, ideas, creativity, '
                'and meaningful moments together in one personal space.',
          ),

          SizedBox(height: 24),

          _sectionTitle(context, 'Nexora'),

          _actionTile(
            context,
            icon: Icons.menu_book_outlined,
            title: 'Community Guidelines',
            subtitle: 'Learn how we keep Nexora welcoming and respectful',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const CommunityGuidelinesScreen(),
                ),
              );
            },
          ),

          _actionTile(
            context,
            icon: Icons.privacy_tip_outlined,
            title: 'Privacy Policy',
            subtitle: 'Learn how Nexora handles your information',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const PrivacyPolicyScreen()),
              );
            },
          ),

          _actionTile(
            context,
            icon: Icons.description_outlined,
            title: 'Terms of Service',
            subtitle: 'Read the terms that govern your use of Nexora',
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const TermsOfServiceScreen()),
              );
            },
          ),

          SizedBox(height: 24),

          _sectionTitle(context, 'Credits'),

          _actionTile(
            context,
            icon: Icons.code_outlined,
            title: 'Open Source Licenses',
            subtitle: 'View licenses for software used by Nexora',
            onTap: () {
              showLicensePage(
                context: context,
                applicationName: 'Nexora',
                applicationVersion: '1.0.0',
                applicationIcon: _smallLogo(context),
              );
            },
          ),

          _actionTile(
            context,
            icon: Icons.people_outline,
            title: 'Nexora Team',
            subtitle: 'The people building Nexora',
            onTap: () {
              _showTeam(context);
            },
          ),

          SizedBox(height: 24),

          _sectionTitle(context, 'App Information'),

          _infoRow(context, 'Version', '1.0.0'),

          _infoRow(context, 'Build', '1'),

          _infoRow(context, 'Platform', 'Flutter'),

          SizedBox(height: 30),

          Center(
            child: Column(
              children: [
                _smallLogo(context),
                SizedBox(height: 12),
                Text(
                  'Nexora',
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 5),
                Text(
                  'Your space. Your content. Your world.',
                  style: TextStyle(
                    color: context.nexora.textPrimary.withOpacity(0.35),
                    fontSize: 11,
                  ),
                ),
                SizedBox(height: 10),
                Text(
                  'Made with care.',
                  style: TextStyle(
                    color: context.nexora.textPrimary.withOpacity(0.22),
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _hero(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 28, 22, 28),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: LinearGradient(
          colors: nexoraGradient(),
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: Color(0xFF5B4BDA),
            blurRadius: 22,
            spreadRadius: -10,
          ),
        ],
      ),
      child: Column(
        children: [
          _largeLogo(context),

          SizedBox(height: 18),

          Text(
            'Nexora',
            style: TextStyle(
              color: context.nexora.textPrimary,
              fontSize: 30,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),

          SizedBox(height: 6),

          Text(
            'Your space. Your content. Your world.',
            textAlign: TextAlign.center,
            style: TextStyle(color: context.nexora.textSecondary, fontSize: 13),
          ),

          SizedBox(height: 16),

          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: context.nexora.textPrimary.withOpacity(0.14),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: context.nexora.textPrimary.withOpacity(0.12)),
            ),
            child: Text(
              'VERSION 1.0.0',
              style: TextStyle(
                color: context.nexora.textPrimary,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 1,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _largeLogo(BuildContext context) {
    return Container(
      width: 82,
      height: 82,
      decoration: BoxDecoration(
        color: context.nexora.textPrimary.withOpacity(0.12),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: context.nexora.textPrimary.withOpacity(0.18)),
      ),
      child: Icon(
        Icons.auto_awesome_rounded,
        color: context.nexora.textPrimary,
        size: 42,
      ),
    );
  }

  Widget _smallLogo(BuildContext context) {
    return Container(
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
      child: Icon(
        Icons.auto_awesome_rounded,
        color: context.nexora.textPrimary,
        size: 22,
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

  Widget _infoCard(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String description,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: context.nexora.textPrimary.withOpacity(0.05)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _iconBox(icon),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 7),
                Text(
                  description,
                  style: TextStyle(
                    color: context.nexora.textMuted,
                    fontSize: 12,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionTile(
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
        leading: _iconBox(icon),
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

  Widget _infoRow(BuildContext context, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 8),
      child: Row(
        children: [
          Text(
            label,
            style: TextStyle(color: context.nexora.textMuted, fontSize: 13),
          ),
          const Spacer(),
          Text(
            value,
            style: TextStyle(
              color: context.nexora.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  static Widget _iconBox(IconData icon) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        gradient: LinearGradient(
          colors: nexoraGradient(),
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),          child: Icon(icon, color: Colors.white, size: 21),
    );
  }

  void _showTeam(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: context.nexora.sheet,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: context.nexora.textDim,
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                SizedBox(height: 20),
                _smallLogo(context),
                SizedBox(height: 12),
                Text(
                  'The Nexora Team',
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Building a better social space, one idea at a time.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: context.nexora.textMuted,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
                SizedBox(height: 20),
                TextButton(
                  onPressed: () => Navigator.pop(sheetContext),
                  child: Text(
                    'Close',
                    style: TextStyle(color: Color(0xFF8B7CFF)),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Privacy Policy',
      description: 'Learn how Nexora handles and protects your information.',
      sections: [
        SettingsSection(
          title: 'Privacy',
          items: [
            SettingsItem(
              icon: Icons.info_outline,
              title: 'Your Information',
              subtitle: 'Learn what information Nexora collects and uses.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const YourInformationScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.shield_outlined,
              title: 'Data Protection',
              subtitle: 'Learn how Nexora works to protect your information.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const DataProtectionScreen(),
                  ),
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

class YourInformationScreen extends StatelessWidget {
  const YourInformationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Your Information',
      description: 'Learn about information associated with your Nexora account and activity.',
      sections: [
        SettingsSection(
          title: 'Information',
          items: [
            SettingsItem(
              icon: Icons.person_outline,
              title: 'Account Information',
              subtitle: 'Information such as your name, username, email, and phone number.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const AccountInformationScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.photo_library_outlined,
              title: 'Content & Activity',
              subtitle:
                  'Information related to content and activity on Nexora.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ContentActivityScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.settings_outlined,
              title: 'How Information Is Used',
              subtitle: 'Learn why information may be used to provide and improve Nexora.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const InformationUseScreen(),
                  ),
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

class DataProtectionScreen extends StatelessWidget {
  const DataProtectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Data Protection',
      description: 'Learn how Nexora works to protect your information.',
      sections: [
        SettingsSection(
          title: 'Protection',
          items: [
            SettingsItem(
              icon: Icons.lock_outline,
              title: 'Security Measures',
              subtitle:
                  'Learn about measures used to help protect your information.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const SecurityMeasuresScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.tune_outlined,
              title: 'Privacy Choices',
              subtitle:
                  'Learn about controls available for managing your privacy.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const PrivacyChoicesScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.delete_outline,
              title: 'Data Retention & Deletion',
              subtitle: 'Learn about retaining and deleting information.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const DataRetentionScreen(),
                  ),
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

class TermsOfServiceScreen extends StatelessWidget {
  const TermsOfServiceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Terms of Service',
      description: 'Read the terms that govern your use of Nexora.',
      sections: [
        SettingsSection(
          title: 'Terms',
          items: [
            SettingsItem(
              icon: Icons.article_outlined,
              title: 'Using Nexora',
              subtitle: 'Learn about the rules for using Nexora.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const UsingNexoraScreen()),
                );
              },
            ),
            SettingsItem(
              icon: Icons.gavel_outlined,
              title: 'Your Responsibilities',
              subtitle: 'Understand your responsibilities as a Nexora user.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const YourResponsibilitiesScreen(),
                  ),
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

class UsingNexoraScreen extends StatelessWidget {
  const UsingNexoraScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Using Nexora',
      description: 'Learn about the rules for using Nexora.',
      sections: [
        SettingsSection(
          title: 'Using the Service',
          items: [
            SettingsItem(
              icon: Icons.account_circle_outlined,
              title: 'Your Account',
              subtitle: 'Understand your account responsibilities.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const TermsAccountScreen()),
                );
              },
            ),
            SettingsItem(
              icon: Icons.create_outlined,
              title: 'Your Content',
              subtitle: 'Learn about content you create and share.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const TermsContentScreen()),
                );
              },
            ),
            SettingsItem(
              icon: Icons.rule_outlined,
              title: 'Following the Rules',
              subtitle: 'Understand the rules that apply on Nexora.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const FollowingRulesScreen(),
                  ),
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

class YourResponsibilitiesScreen extends StatelessWidget {
  const YourResponsibilitiesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Your Responsibilities',
      description: 'Understand your responsibilities as a Nexora user.',
      sections: [
        SettingsSection(
          title: 'Responsibilities',
          items: [
            SettingsItem(
              icon: Icons.people_outline,
              title: 'Respect Others',
              subtitle: 'Interact respectfully with other people.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const RespectOthersScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.security_outlined,
              title: 'Protect Your Account',
              subtitle: 'Take reasonable steps to keep your account secure.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ProtectAccountScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.report_outlined,
              title: 'Report Violations',
              subtitle: 'Use available reporting tools when appropriate.',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ReportViolationsTermsScreen(),
                  ),
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

/* ============================================================
   PRIVACY — YOUR INFORMATION CHILDREN
   ============================================================ */

class AccountInformationScreen extends StatelessWidget {
  const AccountInformationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Account Information',
      'Information associated with your Nexora account.',
      [
        _item(
          Icons.person_outline,
          'Profile Information',
          'Name, username and information displayed on your profile.',
        ),
        _item(
          Icons.email_outlined,
          'Email Address',
          'The email address associated with your account.',
        ),
        _item(
          Icons.phone_outlined,
          'Phone Number',
          'The phone number associated with your account.',
        ),
        _item(
          Icons.verified_user_outlined,
          'Verification',
          'Information used to verify account ownership.',
        ),
      ],
    );
  }
}

class ContentActivityScreen extends StatelessWidget {
  const ContentActivityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Content & Activity',
      'Information related to content and activity on Nexora.',
      [
        _item(
          Icons.photo_library_outlined,
          'Posts & Media',
          'Content you create, upload or publish.',
        ),
        _item(
          Icons.video_library_outlined,
          'Clips',
          'Short-form video content you create or share.',
        ),
        _item(
          Icons.comment_outlined,
          'Comments & Reactions',
          'Interactions you make with content.',
        ),
        _item(
          Icons.chat_bubble_outline,
          'Messages',
          'Information associated with your conversations.',
        ),
        _item(
          Icons.history_outlined,
          'Activity History',
          'Searches and other activity associated with your use of Nexora.',
        ),
      ],
    );
  }
}

class InformationUseScreen extends StatelessWidget {
  const InformationUseScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'How Information Is Used',
      'Learn why information may be used to provide and improve Nexora.',
      [
        _item(
          Icons.apps_outlined,
          'Provide Nexora',
          'Operate accounts, features and services.',
        ),
        _item(
          Icons.auto_awesome_outlined,
          'Personalization',
          'Help tailor content and experiences.',
        ),
        _item(
          Icons.security_outlined,
          'Safety & Security',
          'Help protect users, accounts and the platform.',
        ),
        _item(
          Icons.trending_up_outlined,
          'Improve Nexora',
          'Understand performance and improve features.',
        ),
      ],
    );
  }
}

/* ============================================================
   PRIVACY — DATA PROTECTION CHILDREN
   ============================================================ */

class SecurityMeasuresScreen extends StatelessWidget {
  const SecurityMeasuresScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Security Measures',
      'Measures used to help protect your information.',
      [
        _item(
          Icons.lock_outline,
          'Account Security',
          'Measures that help protect your account and authentication.',
        ),
        _item(
          Icons.storage_outlined,
          'Data Security',
          'Measures used to help protect stored information.',
        ),
        _item(
          Icons.devices_outlined,
          'Session Protection',
          'Measures that help protect active sessions and devices.',
        ),
      ],
    );
  }
}

class PrivacyChoicesScreen extends StatelessWidget {
  const PrivacyChoicesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Privacy Choices',
      'Controls available for managing your privacy.',
      [
        _item(
          Icons.lock_person_outlined,
          'Account Privacy',
          'Controls for who can interact with your account.',
        ),
        _item(
          Icons.visibility_outlined,
          'Content Visibility',
          'Controls for who can see your content.',
        ),
        _item(
          Icons.tune_outlined,
          'Personalization',
          'Controls related to personalized experiences.',
        ),
        _item(
          Icons.manage_accounts_outlined,
          'Data Access & Control',
          'Options for managing information associated with your account.',
        ),
      ],
    );
  }
}

class DataRetentionScreen extends StatelessWidget {
  const DataRetentionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Data Retention & Deletion',
      'Learn about retaining and deleting information.',
      [
        _item(
          Icons.schedule_outlined,
          'Retention',
          'Some information may be retained while needed to provide Nexora.',
        ),
        _item(
          Icons.delete_sweep_outlined,
          'Delete Content',
          'Learn what happens when you delete content.',
        ),
        _item(
          Icons.person_remove_outlined,
          'Delete Account',
          'Learn what happens when your Nexora account is deleted.',
        ),
      ],
    );
  }
}

/* ============================================================
   TERMS — USING NEXORA CHILDREN
   ============================================================ */

class TermsAccountScreen extends StatelessWidget {
  const TermsAccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Your Account',
      'Understand your responsibilities when using a Nexora account.',
      [
        _item(
          Icons.verified_user_outlined,
          'Account Eligibility',
          'Understand requirements for maintaining an account.',
        ),
        _item(
          Icons.lock_outline,
          'Account Security',
          'Take reasonable steps to protect your account.',
        ),
        _item(
          Icons.manage_accounts_outlined,
          'Accurate Information',
          'Keep information associated with your account accurate and current.',
        ),
      ],
    );
  }
}

class TermsContentScreen extends StatelessWidget {
  const TermsContentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Your Content',
      'Learn about content you create and share.',
      [
        _item(
          Icons.copyright_outlined,
          'Content Ownership',
          'Understand your rights in content you create.',
        ),
        _item(
          Icons.share_outlined,
          'Content License',
          'Understand permissions needed for Nexora to operate your content.',
        ),
        _item(
          Icons.rule_outlined,
          'Content Standards',
          'Content must comply with applicable Nexora policies.',
        ),
        _item(
          Icons.delete_outline,
          'Removing Content',
          'Learn when content may be removed or restricted.',
        ),
      ],
    );
  }
}

class FollowingRulesScreen extends StatelessWidget {
  const FollowingRulesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Following the Rules',
      'Understand the rules that apply on Nexora.',
      [
        _item(
          Icons.menu_book_outlined,
          'Community Guidelines',
          'Learn the standards for behavior and content on Nexora.',
        ),
        _item(
          Icons.block_outlined,
          'Prohibited Conduct',
          'Learn about behavior that is not permitted.',
        ),
        _item(
          Icons.gavel_outlined,
          'Enforcement',
          'Understand how Nexora may respond to violations.',
        ),
      ],
    );
  }
}

/* ============================================================
   TERMS — RESPONSIBILITIES CHILDREN
   ============================================================ */

class RespectOthersScreen extends StatelessWidget {
  const RespectOthersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Respect Others',
      'Interact respectfully with other people.',
      [
        _item(
          Icons.report_problem_outlined,
          'Harassment & Abuse',
          'Do not use Nexora to harass, threaten or abuse others.',
        ),
        _item(
          Icons.person_outline,
          'Impersonation',
          'Do not misrepresent yourself as another person or entity.',
        ),
        _item(
          Icons.privacy_tip_outlined,
          'Privacy of Others',
          'Respect other people’s privacy and personal information.',
        ),
      ],
    );
  }
}

class ProtectAccountScreen extends StatelessWidget {
  const ProtectAccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Protect Your Account',
      'Take reasonable steps to keep your account secure.',
      [
        _item(
          Icons.password_outlined,
          'Password & 2FA',
          'Use strong authentication and available security controls.',
        ),
        _item(
          Icons.warning_amber_outlined,
          'Suspicious Activity',
          'Know what to do if you notice suspicious account activity.',
        ),
        _item(
          Icons.link_outlined,
          'Third-Party Access',
          'Understand responsibilities when connecting other services.',
        ),
      ],
    );
  }
}

class ReportViolationsTermsScreen extends StatelessWidget {
  const ReportViolationsTermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _detail(
      'Report Violations',
      'Use available reporting tools when appropriate.',
      [
        _item(
          Icons.flag_outlined,
          'Reporting Content',
          'Report content that may violate Nexora policies.',
        ),
        _item(
          Icons.person_off_outlined,
          'Reporting Accounts',
          'Report accounts that may violate Nexora policies.',
        ),
        _item(
          Icons.gavel_outlined,
          'Appeals',
          'Learn about available options when an enforcement decision is disputed.',
        ),
      ],
    );
  }
}

/* ============================================================
   SHARED DETAIL BUILDER
   ============================================================ */

SettingsDetailScreen _detail(
  String title,
  String description,
  List<SettingsItem> items,
) {
  return SettingsDetailScreen(
    title: title,
    description: description,
    sections: [SettingsSection(title: 'Information', items: items)],
  );
}

SettingsItem _item(IconData icon, String title, String subtitle) {
  return SettingsItem(
    icon: icon,
    title: title,
    subtitle: subtitle,
    type: SettingsItemType.action,
  );
}
