import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../l10n/translations.dart';

import '../services/appearance_controller.dart';

import 'settings_detail_screen.dart';

class SupportRequest {
  final String title;
  final String description;
  final String date;
  String status;

  SupportRequest({
    required this.title,
    required this.description,
    required this.date,
    this.status = 'Submitted',
  });
}

final List<SupportRequest> supportRequests = [];

class HelpSupportScreen extends StatefulWidget {
  const HelpSupportScreen({super.key});

  @override
  State<HelpSupportScreen> createState() => _HelpSupportScreenState();
}

class _HelpSupportScreenState extends State<HelpSupportScreen> {
  final TextEditingController searchController = TextEditingController();
  String searchQuery = '';

  final List<Map<String, String>> faqs = const [
    {
      'question': 'How do I change my Nexora gradient?',
      'answer': 'Open Settings → Appearance and choose your preferred gradient scheme.',
    },
    {
      'question': 'How do I make my account private?',
      'answer':
          'Open Settings → Privacy & Security and enable Private Account.',
    },
    {
      'question': 'How do I change my password?',
      'answer': 'Open Settings → Privacy & Security → Change Password and follow the steps.',
    },
    {
      'question': 'How do I block an account?',
      'answer': 'You can block an account from its profile or manage blocked accounts through Settings → Privacy & Security.',
    },
    {
      'question': 'How do I report a problem?',
      'answer': 'Open Help & Support → Report a Problem, describe the issue and submit your request.',
    },
    {
      'question': 'How do I enable two-factor authentication?',
      'answer':
          'Open Settings → Privacy & Security → Two-Factor Authentication.',
    },
  ];

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  List<Map<String, String>> get filteredFaqs {
    if (searchQuery.trim().isEmpty) {
      return faqs;
    }

    final query = searchQuery.toLowerCase();

    return faqs.where((faq) {
      return faq['question']!.toLowerCase().contains(query) ||
          faq['answer']!.toLowerCase().contains(query);
    }).toList();
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
          tr(context, 'Help & Support'),
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
          _heroCard(),

          SizedBox(height: 16),

          _searchBar(),

          SizedBox(height: 22),

          _sectionTitle(tr(context, 'Get Help')),

          _tile(
            icon: Icons.bug_report_outlined,
            title: tr(context, 'Report a Problem'),
            subtitle: tr(context, 'Tell us about something that is not working'),
            onTap: _openReportProblem,
          ),

          _tile(
            icon: Icons.chat_bubble_outline,
            title: tr(context, 'Contact Nexora Support'),
            subtitle: tr(context, 'Get in touch with the Nexora support team'),
            onTap: _openContactSupport,
          ),

          _tile(
            icon: Icons.receipt_long_outlined,
            title: tr(context, 'My Support Requests'),
            subtitle: supportRequests.isEmpty
                ? tr(context, 'View your previous support requests')
                : '${supportRequests.length} support request'
                      '${supportRequests.length == 1 ? '' : 's'}',
            onTap: _openSupportRequests,
          ),

          SizedBox(height: 24),

          _sectionTitle(tr(context, 'Frequently Asked Questions')),

          if (filteredFaqs.isEmpty)
            _emptySearch()
          else
            ...filteredFaqs.map(
              (faq) =>
                  _faqTile(question: faq['question']!, answer: faq['answer']!),
            ),

          SizedBox(height: 24),

          _sectionTitle(tr(context, 'Safety')),

          _tile(
            icon: Icons.shield_outlined,
            title: tr(context, 'Safety Center'),
            subtitle: tr(context, 'Learn how to keep your Nexora experience safe'),
            onTap: _openSafetyCenter,
          ),

          _tile(
            icon: Icons.groups_outlined,
            title: tr(context, 'Community Guidelines'),
            subtitle: tr(context, 'Learn the rules and expectations for everyone'),
            onTap: _openCommunityGuidelines,
          ),

          SizedBox(height: 24),

          _sectionTitle(tr(context, 'About')),

          _tile(
            icon: Icons.info_outline,
            title: tr(context, 'About Nexora'),
            subtitle: tr(context, 'Learn more about Nexora and the team behind it'),
            onTap: _openAboutNexora,
          ),

          SizedBox(height: 30),

          Center(
            child: Text(
              tr(context, 'Nexora Support'),
              style: TextStyle(
                color: context.nexora.textPrimary.withValues(alpha: 0.35),
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _openReportProblem() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const ReportProblemScreen()),
    ).then((_) {
      if (mounted) setState(() {});
    });
  }

  void _openContactSupport() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const ContactSupportScreen()),
    );
  }

  void _openSupportRequests() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const MySupportRequestsScreen()),
    );
  }

  void _openSafetyCenter() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const SafetyCenterScreen()),
    );
  }

  void _openCommunityGuidelines() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const CommunityGuidelinesScreen()),
    );
  }

  void _openAboutNexora() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AboutNexoraSupportScreen()),
    );
  }

  Widget _heroCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: LinearGradient(
          colors: nexoraGradient(),
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.support_agent_outlined, color: context.nexora.textPrimary, size: 27),
          SizedBox(height: 14),
          Text(
            tr(context, 'How can we help?'),
            style: TextStyle(
              color: context.nexora.textPrimary,
              fontSize: 19,
              fontWeight: FontWeight.w700,
            ),
          ),
          SizedBox(height: 5),
          Text(
            tr(context, 'Find answers, report problems, or get in touch with Nexora Support.'),
            style: TextStyle(color: context.nexora.textSecondary, fontSize: 12, height: 1.4),
          ),
        ],
      ),
    );
  }

  Widget _searchBar() {
    return Container(
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: context.nexora.textPrimary.withValues(alpha: 0.06)),
      ),
      child: TextField(
        controller: searchController,
        onChanged: (value) {
          setState(() {
            searchQuery = value;
          });
        },
        style: TextStyle(color: context.nexora.textPrimary, fontSize: 14),
        decoration: InputDecoration(
          hintText: tr(context, 'Search help'),
          hintStyle: TextStyle(color: context.nexora.textHint, fontSize: 14),
          prefixIcon: Icon(Icons.search, color: context.nexora.textMuted),
          border: InputBorder.none,
          contentPadding: EdgeInsets.symmetric(vertical: 15),
        ),
      ),
    );
  }

  Widget _faqTile({required String question, required String answer}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(15),
      ),
      child: ExpansionTile(
        collapsedIconColor: context.nexora.textHint,
        iconColor: const Color(0xFF8B7CFF),
        tilePadding: const EdgeInsets.symmetric(horizontal: 12),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 15),
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.all(Radius.circular(11)),
            gradient: LinearGradient(
              colors: nexoraGradient(),
            ),
          ),
          child: Icon(Icons.help_outline, color: context.nexora.textPrimary, size: 20),
        ),
        title: Text(
          question,
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              answer,
              style: TextStyle(
                color: context.nexora.textMuted,
                fontSize: 12,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptySearch() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(Icons.search_off, color: context.nexora.textHint, size: 40),
          SizedBox(height: 10),
          Text(
            tr(context, 'No help articles found'),
            style: TextStyle(
              color: context.nexora.textSecondary,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 4),
          Text(
            tr(context, 'Try another search.'),
            style: TextStyle(color: context.nexora.textHint, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
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

  Widget _tile({
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
        border: Border.all(color: context.nexora.textPrimary.withValues(alpha: 0.05)),
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

  Widget _iconBox(IconData icon) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        gradient: LinearGradient(
          colors: nexoraGradient(),
        ),
      ),          child: Icon(icon, color: Colors.white, size: 21),
    );
  }
}

class ReportProblemScreen extends StatefulWidget {
  const ReportProblemScreen({super.key});

  @override
  State<ReportProblemScreen> createState() => _ReportProblemScreenState();
}

class _ReportProblemScreenState extends State<ReportProblemScreen> {
  final TextEditingController controller = TextEditingController();

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void _submit() {
    final description = controller.text.trim();

    if (description.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(tr(context, 'Describe the problem first.')),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    supportRequests.add(
      SupportRequest(
        title: tr(context, 'Reported Problem'),
        description: description,
        date: 'Just now',
      ),
    );

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(tr(context, 'Problem reported successfully.')),
        behavior: SnackBarBehavior.floating,
      ),
    );

    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Report a Problem'),
      description:
          tr(context, 'Tell us about something that is not working correctly in Nexora.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Problem'),
          items: [
            SettingsItem(
              icon: Icons.edit_outlined,
              title: tr(context, 'Describe the Problem'),
              subtitle: controller.text.isEmpty
                  ? tr(context, 'Tap to describe what went wrong')
                  : controller.text,
              type: SettingsItemType.action,
              onTap: _showDescriptionDialog,
            ),
            SettingsItem(
              icon: Icons.send_outlined,
              title: tr(context, 'Submit Report'),
              subtitle: tr(context, 'Send your problem to Nexora Support'),
              type: SettingsItemType.action,
              onTap: _submit,
            ),
          ],
        ),
      ],
    );
  }

  void _showDescriptionDialog() {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: context.nexora.card,
          title: Text(
            tr(context, 'Describe the Problem'),
            style: TextStyle(color: context.nexora.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 6,
            style: TextStyle(color: context.nexora.textPrimary),
            decoration: InputDecoration(
              hintText: tr(context, 'Describe the problem...'),
              hintStyle: TextStyle(color: context.nexora.textHint),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                tr(context, 'Cancel'),
                style: TextStyle(color: context.nexora.textSecondary),
              ),
            ),
            TextButton(
              onPressed: () {
                setState(() {});
                Navigator.pop(context);
              },
              child: Text(
                tr(context, 'Done'),
                style: TextStyle(color: Color(0xFF8B7CFF)),
              ),
            ),
          ],
        );
      },
    );
  }
}

class ContactSupportScreen extends StatelessWidget {
  const ContactSupportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Contact Nexora Support'),
      description: tr(context, 'Choose how you would like to contact our support team.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Contact Options'),
          items: [
            SettingsItem(
              icon: Icons.email_outlined,
              title: tr(context, 'Email Support'),
              subtitle: tr(context, 'Send us an email'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const EmailSupportScreen()),
                );
              },
            ),
            SettingsItem(
              icon: Icons.chat_outlined,
              title: tr(context, 'Live Chat'),
              subtitle: tr(context, 'Chat with a support representative'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const LiveChatScreen()),
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

class EmailSupportScreen extends StatelessWidget {
  const EmailSupportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Email Support'),
      description: tr(context, 'Send your support request to the Nexora support team.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Email Support'),
          items: [
            SettingsItem(
              icon: Icons.email_outlined,
              title: 'support@nexora.app',
              subtitle: tr(context, 'Your support email address'),
              type: SettingsItemType.action,
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      'Email action ready for backend integration.',
                    ),
                    behavior: SnackBarBehavior.floating,
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

class LiveChatScreen extends StatefulWidget {
  const LiveChatScreen({super.key});

  @override
  State<LiveChatScreen> createState() => _LiveChatScreenState();
}

class _LiveChatScreenState extends State<LiveChatScreen> {
  final TextEditingController controller = TextEditingController();

  final List<Map<String, String>> messages = [
    {
      'sender': 'Support',
      'message': 'Hi! Welcome to Nexora Support. How can we help?',
    },
  ];

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void _send() {
    final message = controller.text.trim();

    if (message.isEmpty) return;

    setState(() {
      messages.add({'sender': 'You', 'message': message});
      controller.clear();
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
          icon: Icon(Icons.arrow_back_ios_new, color: context.nexora.textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Live Chat',
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(18),
              itemCount: messages.length,
              itemBuilder: (context, index) {
                final message = messages[index];
                final isUser = message['sender'] == 'You';

                return Align(
                  alignment: isUser
                      ? Alignment.centerRight
                      : Alignment.centerLeft,
                  child: Container(
                    constraints: const BoxConstraints(maxWidth: 300),
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(13),
                    decoration: BoxDecoration(
                      color: isUser
                          ? const Color(0xFF3157D5)
                          : context.nexora.card,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      message['message']!,
                      style: TextStyle(color: context.nexora.textPrimary, fontSize: 13),
                    ),
                  ),
                );
              },
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: context.nexora.card,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: TextField(
                        controller: controller,
                        style: TextStyle(color: context.nexora.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'Message support...',
                          hintStyle: TextStyle(color: context.nexora.textHint),
                          border: InputBorder.none,
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                        ),
                        onSubmitted: (_) => _send(),
                      ),
                    ),
                  ),
                  SizedBox(width: 8),
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: nexoraGradient(),
                      ),
                    ),
                    child: IconButton(
                      onPressed: _send,
                      icon: Icon(
                        Icons.send,
                        color: context.nexora.textPrimary,
                        size: 19,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class MySupportRequestsScreen extends StatefulWidget {
  const MySupportRequestsScreen({super.key});

  @override
  State<MySupportRequestsScreen> createState() =>
      _MySupportRequestsScreenState();
}

class _MySupportRequestsScreenState extends State<MySupportRequestsScreen> {
  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'My Support Requests',
      description: 'View your previous conversations and requests sent to Nexora Support.',
      sections: [
        SettingsSection(
          title: 'Support Requests',
          items: supportRequests.isEmpty
              ? [
                  const SettingsItem(
                    icon: Icons.inbox_outlined,
                    title: 'No Support Requests',
                    subtitle:
                        'Your submitted support requests will appear here.',
                    type: SettingsItemType.action,
                  ),
                ]
              : [
                  for (final request in supportRequests)
                    SettingsItem(
                      icon: Icons.receipt_long_outlined,
                      title: request.title,
                      subtitle: '${request.status} · ${request.date}',
                      type: SettingsItemType.navigation,
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                SupportRequestDetailsScreen(request: request),
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

class SupportRequestDetailsScreen extends StatelessWidget {
  final SupportRequest request;

  const SupportRequestDetailsScreen({super.key, required this.request});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Support Request',
      description: 'View the details of your submitted request.',
      sections: [
        SettingsSection(
          title: 'Request',
          items: [
            SettingsItem(
              icon: Icons.info_outline,
              title: request.title,
              subtitle: request.description,
              type: SettingsItemType.action,
            ),
            SettingsItem(
              icon: Icons.pending_outlined,
              title: 'Status',
              subtitle: request.status,
              type: SettingsItemType.action,
            ),
          ],
        ),
      ],
    );
  }
}

class SafetyCenterScreen extends StatelessWidget {
  const SafetyCenterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Safety Center'),
      description: tr(context, 'Learn about tools and practices that help keep your Nexora experience safe.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Safety'),
          items: [
            SettingsItem(
              icon: Icons.security_outlined,
              title: tr(context, 'Account Security'),
              subtitle: tr(context, 'Learn how to protect your account'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const AccountSecurityHelpScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.report_outlined,
              title: tr(context, 'Report & Block'),
              subtitle: tr(context, 'Learn how to report or block accounts'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ReportBlockHelpScreen(),
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

class AccountSecurityHelpScreen extends StatelessWidget {
  const AccountSecurityHelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Account Security'),
      description: tr(context, 'Learn how to keep your Nexora account protected.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Protect Your Account'),
          items: [
            SettingsItem(
              icon: Icons.password_outlined,
              title: tr(context, 'Use a Strong Password'),
              subtitle:
                  tr(context, 'Choose a unique password that you do not reuse elsewhere.'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ChangePasswordHelpScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.security_outlined,
              title: tr(context, 'Use Two-Factor Authentication'),
              subtitle: tr(context, 'Add another layer of protection when signing in.'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const TwoFactorHelpScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.devices_outlined,
              title: tr(context, 'Review Login Activity'),
              subtitle:
                  tr(context, 'Check devices and sessions associated with your account.'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const LoginActivityHelpScreen(),
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

class ChangePasswordHelpScreen extends StatefulWidget {
  const ChangePasswordHelpScreen({super.key});

  @override
  State<ChangePasswordHelpScreen> createState() =>
      _ChangePasswordHelpScreenState();
}

class _ChangePasswordHelpScreenState extends State<ChangePasswordHelpScreen> {
  final TextEditingController currentController = TextEditingController();
  final TextEditingController newController = TextEditingController();
  final TextEditingController confirmController = TextEditingController();

  @override
  void dispose() {
    currentController.dispose();
    newController.dispose();
    confirmController.dispose();
    super.dispose();
  }

  void _updatePassword() {
    if (currentController.text.trim().isEmpty ||
        newController.text.trim().isEmpty ||
        confirmController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(tr(context, 'Please complete all password fields.')),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    if (newController.text != confirmController.text) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(tr(context, 'New passwords do not match.')),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(          content: Text(tr(context, 'Password update is ready for backend integration.')),
        behavior: SnackBarBehavior.floating,
      ),
    );
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
          'Change Password',
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
          _passwordField(
            controller: currentController,
            label: tr(context, 'Current Password'),
          ),
          SizedBox(height: 12),
          _passwordField(controller: newController, label: tr(context, 'New Password')),
          SizedBox(height: 12),
          _passwordField(
            controller: confirmController,
            label: tr(context, 'Confirm New Password'),
          ),
          SizedBox(height: 20),
          Container(
            height: 52,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              gradient: LinearGradient(
                colors: nexoraGradient(),
              ),
            ),
            child: TextButton(
              onPressed: _updatePassword,
              child: Text(
                tr(context, 'Update Password'),
                style: TextStyle(
                  color: context.nexora.textPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _passwordField({
    required TextEditingController controller,
    required String label,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: context.nexora.textPrimary.withValues(alpha: 0.06)),
      ),
      child: TextField(
        controller: controller,
        obscureText: true,
        style: TextStyle(color: context.nexora.textPrimary, fontSize: 14),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: TextStyle(color: context.nexora.textMuted),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 15,
          ),
        ),
      ),
    );
  }
}

class TwoFactorHelpScreen extends StatefulWidget {
  const TwoFactorHelpScreen({super.key});

  @override
  State<TwoFactorHelpScreen> createState() => _TwoFactorHelpScreenState();
}

class _TwoFactorHelpScreenState extends State<TwoFactorHelpScreen> {
  bool enabled = false;

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Two-Factor Authentication'),
      description:
          tr(context, 'Add an extra layer of protection when signing in to Nexora.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Security'),
          items: [
            SettingsItem(
              icon: Icons.security_outlined,
              title: tr(context, 'Two-Factor Authentication'),
              subtitle: enabled ? tr(context, 'Enabled') : tr(context, 'Disabled'),
              type: SettingsItemType.toggle,
              value: enabled,
              onChanged: (value) {
                setState(() {
                  enabled = value;
                });
              },
            ),
            SettingsItem(
              icon: Icons.phonelink_lock_outlined,
              title: tr(context, 'Authentication Method'),
              subtitle: tr(context, 'Choose how you verify your identity'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const AuthenticationMethodScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.key_outlined,
              title: tr(context, 'Recovery Codes'),
              subtitle: tr(context, 'Use recovery codes if you lose access'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const RecoveryCodesScreen(),
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

class AuthenticationMethodScreen extends StatelessWidget {
  const AuthenticationMethodScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Authentication Method'),
      description: tr(context, 'Choose how you want to verify your identity.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Available Methods'),
          items: [
            SettingsItem(
              icon: Icons.sms_outlined,
              title: tr(context, 'Text Message'),
              subtitle: tr(context, 'Receive verification codes by SMS'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const TextMessageAuthScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.apps_outlined,
              title: tr(context, 'Authenticator App'),
              subtitle: tr(context, 'Use a compatible authentication app'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const AuthenticatorAppScreen(),
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

class TextMessageAuthScreen extends StatelessWidget {
  const TextMessageAuthScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Text Message'),
      description:
          tr(context, 'Use your phone number to receive verification codes by SMS.'),
      sections: [
        SettingsSection(
          title: tr(context, 'SMS Verification'),
          items: [
            SettingsItem(
              icon: Icons.phone_outlined,
              title: tr(context, 'Phone Number'),
              subtitle: tr(context, 'Manage the phone number used for verification'),
              type: SettingsItemType.action,
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      'Phone number management is ready for backend integration.',
                    ),
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.verified_outlined,
              title: tr(context, 'Verify Phone Number'),
              subtitle: tr(context, 'Send a verification code to your phone'),
              type: SettingsItemType.action,
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      'SMS verification is ready for backend integration.',
                    ),
                    behavior: SnackBarBehavior.floating,
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

class AuthenticatorAppScreen extends StatelessWidget {
  const AuthenticatorAppScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Authenticator App'),
      description:
          tr(context, 'Use a compatible authentication app to generate verification codes.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Authenticator Setup'),
          items: [
            SettingsItem(
              icon: Icons.qr_code_2_outlined,
              title: tr(context, 'Set Up Authenticator'),
              subtitle: tr(context, 'Connect an authenticator app to your account'),
              type: SettingsItemType.action,
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      'Authenticator setup is ready for backend integration.',
                    ),
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.verified_user_outlined,
              title: tr(context, 'Verify Setup'),
              subtitle: tr(context, 'Enter a code from your authenticator app'),
              type: SettingsItemType.action,
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      'Authenticator verification is ready for backend integration.',
                    ),
                    behavior: SnackBarBehavior.floating,
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

class LoginActivityHelpScreen extends StatelessWidget {
  const LoginActivityHelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Login Activity'),
      description:
          tr(context, 'Review devices and sessions associated with your Nexora account.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Devices'),
          items: [
            SettingsItem(
              icon: Icons.phone_android_outlined,
              title: tr(context, 'Current Device'),
              subtitle: '${tr(context, 'This device')} · ${tr(context, 'Active now')}',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const CurrentDeviceScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.computer_outlined,
              title: tr(context, 'Windows PC'),
              subtitle: tr(context, 'Last active recently'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const WindowsPCDeviceScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.logout_outlined,
              title: tr(context, 'Log Out Other Devices'),
              subtitle: tr(context, 'Sign out of other active sessions'),
              type: SettingsItemType.action,
              onTap: () {
                showDialog(
                  context: context,
                  builder: (dialogContext) {
                    return AlertDialog(
                      backgroundColor: context.nexora.card,
                      title: Text(
                        tr(context, 'Log Out Other Devices?'),
                        style: TextStyle(color: context.nexora.textPrimary),
                      ),
                      content: Text(
                        tr(context, 'This will sign out all other active sessions on your Nexora account.'),
                        style: TextStyle(color: context.nexora.textSecondary),
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(dialogContext),
                          child: Text(
                            'Cancel',
                            style: TextStyle(color: context.nexora.textSecondary),
                          ),
                        ),
                        TextButton(
                          onPressed: () {
                            Navigator.pop(dialogContext);

                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Device logout is ready for backend integration.',
                                ),
                                behavior: SnackBarBehavior.floating,
                              ),
                            );
                          },
                          child: Text(
                            'Log Out',
                            style: TextStyle(color: Color(0xFF8B7CFF)),
                          ),
                        ),
                      ],
                    );
                  },
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

class CurrentDeviceScreen extends StatelessWidget {
  const CurrentDeviceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Current Device',
      description:
          'Review information about the device you are currently using.',
      sections: const [
        SettingsSection(
          title: 'Session Details',
          items: [
            SettingsItem(
              icon: Icons.smartphone_outlined,
              title: 'Device',
              subtitle: 'Current device',
              type: SettingsItemType.action,
            ),
            SettingsItem(
              icon: Icons.circle,
              title: 'Session Status',
              subtitle: 'Active now',
              type: SettingsItemType.action,
            ),
            SettingsItem(
              icon: Icons.location_on_outlined,
              title: 'Login Location',
              subtitle: 'Location information will be provided by the backend',
              type: SettingsItemType.action,
            ),
            SettingsItem(
              icon: Icons.access_time_outlined,
              title: 'Last Active',
              subtitle: 'Active now',
              type: SettingsItemType.action,
            ),
          ],
        ),
      ],
    );
  }
}

class WindowsPCDeviceScreen extends StatelessWidget {
  const WindowsPCDeviceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Windows PC',
      description: 'Review information about this login session.',
      sections: [
        SettingsSection(
          title: 'Session Details',
          items: [
            SettingsItem(
              icon: Icons.computer_outlined,
              title: 'Device',
              subtitle: 'Windows PC',
              type: SettingsItemType.action,
            ),
            SettingsItem(
              icon: Icons.circle,
              title: 'Session Status',
              subtitle: 'Recently active',
              type: SettingsItemType.action,
            ),
            SettingsItem(
              icon: Icons.location_on_outlined,
              title: 'Login Location',
              subtitle: 'Location information will be provided by the backend',
              type: SettingsItemType.action,
            ),
            SettingsItem(
              icon: Icons.access_time_outlined,
              title: 'Last Active',
              subtitle: 'Recently active',
              type: SettingsItemType.action,
            ),
            SettingsItem(
              icon: Icons.logout_outlined,
              title: 'Log Out',
              subtitle: 'Sign out of this Windows PC session',
              type: SettingsItemType.action,
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      'Device logout is ready for backend integration.',
                    ),
                    behavior: SnackBarBehavior.floating,
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

class RecoveryCodesScreen extends StatelessWidget {
  const RecoveryCodesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Recovery Codes'),
      description: tr(context, 'Recovery codes can help you regain access if you cannot use your normal authentication method.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Recovery'),
          items: [
            SettingsItem(
              icon: Icons.vpn_key_outlined,
              title: tr(context, 'Generate Recovery Codes'),
              subtitle: tr(context, 'Create a new set of recovery codes'),
              type: SettingsItemType.action,
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      'Recovery code generation is ready for backend integration.',
                    ),
                    behavior: SnackBarBehavior.floating,
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

class ReportBlockHelpScreen extends StatelessWidget {
  const ReportBlockHelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Report & Block'),
      description:
          tr(context, 'Learn how to report content and manage unwanted interactions.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Safety Tools'),
          items: [
            SettingsItem(
              icon: Icons.flag_outlined,
              title: tr(context, 'Report Content'),
              subtitle: tr(context, 'Learn what you can report and how reporting works'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ReportContentHelpScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.block_outlined,
              title: tr(context, 'Block Accounts'),
              subtitle:
                  tr(context, 'Learn how blocking works and how to manage blocked accounts'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const BlockAccountsHelpScreen(),
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

class ReportContentHelpScreen extends StatelessWidget {
  const ReportContentHelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Report Content',
      description:
          'Learn about reporting content that may violate Nexora guidelines.',
      sections: [
        SettingsSection(
          title: 'Reporting',
          items: [
            SettingsItem(
              icon: Icons.help_outline,
              title: 'What Can Be Reported?',
              subtitle: 'Learn which posts, comments, messages, and accounts can be reported',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const WhatCanBeReportedScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.report_outlined,
              title: 'How to Report',
              subtitle: 'Learn how to report content on Nexora',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const HowToReportScreen()),
                );
              },
            ),
            SettingsItem(
              icon: Icons.fact_check_outlined,
              title: 'What Happens After Reporting?',
              subtitle: 'Learn what happens after a report is submitted',
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const AfterReportingScreen(),
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

class WhatCanBeReportedScreen extends StatelessWidget {
  const WhatCanBeReportedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _GuidanceScreen(
      title: tr(context, 'What Can Be Reported?'),
      description: tr(context, 'Nexora provides reporting tools for content or behavior that may violate its guidelines.'),
      sectionTitle: tr(context, 'Reportable Content'),
      items: [
        _GuidanceItem(
          icon: Icons.image_outlined,
          title: tr(context, 'Posts'),
          subtitle: tr(context, 'Report posts that violate Nexora guidelines.'),
        ),
        _GuidanceItem(
          icon: Icons.comment_outlined,
          title: tr(context, 'Comments'),
          subtitle: tr(context, 'Report inappropriate or abusive comments.'),
        ),
        _GuidanceItem(
          icon: Icons.chat_bubble_outline,
          title: tr(context, 'Messages'),
          subtitle: tr(context, 'Report problematic messages or conversations.'),
        ),
        _GuidanceItem(
          icon: Icons.person_outline,
          title: tr(context, 'Accounts'),
          subtitle: tr(context, 'Report accounts involved in guideline violations.'),
        ),
      ],
    );
  }
}

class HowToReportScreen extends StatelessWidget {
  const HowToReportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _GuidanceScreen(
      title: tr(context, 'How to Report'),
      description: tr(context, 'Use the report option available on the content or account you want to report.'),
      sectionTitle: tr(context, 'Steps'),
      items: [
        _GuidanceItem(
          icon: Icons.looks_one_outlined,
          title: tr(context, 'Open the Report Option'),
          subtitle:
              tr(context, 'Use the report option from the relevant content or profile.'),
        ),
        _GuidanceItem(
          icon: Icons.looks_two_outlined,
          title: tr(context, 'Choose a Reason'),
          subtitle: tr(context, 'Select the reason that best describes the violation.'),
        ),
        _GuidanceItem(
          icon: Icons.looks_3_outlined,
          title: tr(context, 'Submit the Report'),
          subtitle: tr(context, 'Review your selection and submit the report.'),
        ),
      ],
    );
  }
}

class AfterReportingScreen extends StatelessWidget {
  const AfterReportingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _GuidanceScreen(
      title: tr(context, 'After Reporting'),
      description: tr(context, 'Reports help Nexora review content and activity that may violate its guidelines.'),
      sectionTitle: tr(context, 'What Happens'),
      items: [
        _GuidanceItem(
          icon: Icons.search_outlined,
          title: tr(context, 'Review'),
          subtitle: tr(context, 'The reported content may be reviewed according to Nexora policies.'),
        ),
        _GuidanceItem(
          icon: Icons.gavel_outlined,
          title: tr(context, 'Possible Action'),
          subtitle:
              tr(context, 'Appropriate action may be taken when a violation is confirmed.'),
        ),
        _GuidanceItem(
          icon: Icons.notifications_outlined,
          title: tr(context, 'Updates'),
          subtitle: tr(context, 'You may receive relevant updates about your report when applicable.'),
        ),
      ],
    );
  }
}

class BlockAccountsHelpScreen extends StatelessWidget {
  const BlockAccountsHelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Block Accounts'),
      description: tr(context, 'Learn how blocking works and how to manage accounts you have blocked.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Blocking'),
          items: [
            SettingsItem(
              icon: Icons.block_outlined,
              title: tr(context, 'How Blocking Works'),
              subtitle: tr(context, 'Learn what happens when you block an account'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const HowBlockingWorksScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.manage_accounts_outlined,
              title: tr(context, 'Manage Blocked Accounts'),
              subtitle: tr(context, 'View and manage accounts you have blocked'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ManageBlockedAccountsScreen(),
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

class HowBlockingWorksScreen extends StatelessWidget {
  const HowBlockingWorksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _GuidanceScreen(
      title: tr(context, 'How Blocking Works'),
      description:
          tr(context, 'Blocking is a tool for controlling unwanted interactions on Nexora.'),
      sectionTitle: tr(context, 'When You Block Someone'),
      items: [
        _GuidanceItem(
          icon: Icons.visibility_off_outlined,
          title: tr(context, 'Reduced Interaction'),
          subtitle: tr(context, 'The blocked account will no longer be able to interact with you normally.'),
        ),
        _GuidanceItem(
          icon: Icons.notifications_off_outlined,
          title: tr(context, 'Interaction Restrictions'),
          subtitle:
              tr(context, 'Blocking helps prevent unwanted interactions and notifications.'),
        ),
      ],
    );
  }
}

class ManageBlockedAccountsScreen extends StatelessWidget {
  const ManageBlockedAccountsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Manage Blocked Accounts',
      description: 'View and manage accounts you have blocked.',
      sections: const [
        SettingsSection(
          title: 'Blocked Accounts',
          items: [
            SettingsItem(
              icon: Icons.inbox_outlined,
              title: 'No Blocked Accounts',
              subtitle: 'Accounts you block will appear here.',
              type: SettingsItemType.action,
            ),
          ],
        ),
      ],
    );
  }
}

class CommunityGuidelinesScreen extends StatelessWidget {
  const CommunityGuidelinesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Community Guidelines'),
      description: tr(context, 'Learn about the rules and expectations that help keep Nexora welcoming for everyone.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Guidelines'),
          items: [
            SettingsItem(
              icon: Icons.people_outline,
              title: tr(context, 'Respect Others'),
              subtitle: tr(context, 'Learn how to interact respectfully on Nexora'),
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
              icon: Icons.report_outlined,
              title: tr(context, 'Report Violations'),
              subtitle: tr(context, 'Learn what should be reported and how reporting works'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ReportViolationsScreen(),
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

class RespectOthersScreen extends StatelessWidget {
  const RespectOthersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Respect Others'),
      description: tr(context, 'Learn about respectful interaction and behavior on Nexora.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Our Expectations'),
          items: [
            SettingsItem(
              icon: Icons.favorite_border,
              title: tr(context, 'Be Respectful'),
              subtitle: tr(context, 'Learn about respectful communication'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const BeRespectfulScreen()),
                );
              },
            ),
            SettingsItem(
              icon: Icons.forum_outlined,
              title: tr(context, 'Keep Conversations Constructive'),
              subtitle: tr(context, 'Learn how to disagree without attacking others'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ConstructiveConversationsScreen(),
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

class BeRespectfulScreen extends StatelessWidget {
  const BeRespectfulScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _GuidanceScreen(
      title: tr(context, 'Be Respectful'),
      description: tr(context, 'Respectful interaction helps make Nexora a better community for everyone.'),
      sectionTitle: tr(context, 'Respectful Behavior'),
      items: [
        _GuidanceItem(
          icon: Icons.handshake_outlined,
          title: tr(context, 'Treat People With Respect'),
          subtitle: tr(context, 'Avoid targeted harassment, threats, and abusive behavior.'),
        ),
        _GuidanceItem(
          icon: Icons.chat_outlined,
          title: tr(context, 'Communicate Responsibly'),
          subtitle: tr(context, 'Think about how your words may affect other people.'),
        ),
      ],
    );
  }
}

class ConstructiveConversationsScreen extends StatelessWidget {
  const ConstructiveConversationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _GuidanceScreen(
      title: tr(context, 'Constructive Conversations'),
      description: tr(context, 'Disagreement is part of social interaction, but conversations should remain respectful.'),
      sectionTitle: tr(context, 'Good Conversations'),
      items: [
        _GuidanceItem(
          icon: Icons.forum_outlined,
          title: tr(context, 'Disagree Respectfully'),
          subtitle: tr(context, 'Focus on ideas rather than attacking the person.'),
        ),
        _GuidanceItem(
          icon: Icons.block_outlined,
          title: tr(context, 'Avoid Personal Attacks'),
          subtitle: tr(context, 'Do not use insults or targeted abuse to make a point.'),
        ),
      ],
    );
  }
}

class ReportViolationsScreen extends StatelessWidget {
  const ReportViolationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Report Violations'),
      description:
          tr(context, 'Learn what should be reported and how Nexora handles reports.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Reporting'),
          items: [
            SettingsItem(
              icon: Icons.help_outline,
              title: tr(context, 'What Should I Report?'),
              subtitle:
                  tr(context, 'Learn which behavior and content may violate the guidelines'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const WhatShouldBeReportedScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.report_outlined,
              title: tr(context, 'How to Report'),
              subtitle:
                  tr(context, 'Learn how to report posts, comments, messages, and accounts'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ViolationReportingStepsScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.fact_check_outlined,
              title: tr(context, 'What Happens After You Report?'),
              subtitle: tr(context, 'Learn about review and possible actions'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const ViolationReportAftermathScreen(),
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

class WhatShouldBeReportedScreen extends StatelessWidget {
  const WhatShouldBeReportedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _GuidanceScreen(
      title: tr(context, 'What Should I Report?'),
      description: tr(context, 'Reports should be used for content or behavior that may violate Nexora Community Guidelines.'),
      sectionTitle: tr(context, 'Examples'),
      items: [
        _GuidanceItem(
          icon: Icons.warning_amber_outlined,
          title: tr(context, 'Harassment & Bullying'),
          subtitle: tr(context, 'Report targeted harassment, threats, or bullying.'),
        ),
        _GuidanceItem(
          icon: Icons.report_problem_outlined,
          title: tr(context, 'Hate or Abusive Content'),
          subtitle: tr(context, 'Report content that targets people with abusive or hateful behavior.'),
        ),
        _GuidanceItem(
          icon: Icons.campaign_outlined,
          title: tr(context, 'Spam & Scams'),
          subtitle:
              tr(context, 'Report deceptive, fraudulent, or repetitive spam activity.'),
        ),
        _GuidanceItem(
          icon: Icons.more_horiz_outlined,
          title: tr(context, 'Other Violations'),
          subtitle:
              tr(context, 'Report other content that appears to violate Nexora guidelines.'),
        ),
      ],
    );
  }
}

class ViolationReportingStepsScreen extends StatelessWidget {
  const ViolationReportingStepsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _GuidanceScreen(
      title: tr(context, 'How to Report'),
      description: tr(context, 'You can report content or accounts directly from the relevant area of Nexora.'),
      sectionTitle: tr(context, 'Reporting Steps'),
      items: [
        _GuidanceItem(
          icon: Icons.looks_one_outlined,
          title: tr(context, 'Open the Report Option'),
          subtitle: tr(context, 'Find the report option on the relevant post, comment, message, or profile.'),
        ),
        _GuidanceItem(
          icon: Icons.looks_two_outlined,
          title: tr(context, 'Select a Reason'),
          subtitle: tr(context, 'Choose the reason that best describes the violation.'),
        ),
        _GuidanceItem(
          icon: Icons.looks_3_outlined,
          title: tr(context, 'Submit'),
          subtitle: tr(context, 'Confirm your selection and submit the report.'),
        ),
      ],
    );
  }
}

class ViolationReportAftermathScreen extends StatelessWidget {
  const ViolationReportAftermathScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _GuidanceScreen(
      title: tr(context, 'After You Report'),
      description: tr(context, 'Nexora can review reports to determine whether content or behavior violates its guidelines.'),
      sectionTitle: tr(context, 'Review Process'),
      items: [
        _GuidanceItem(
          icon: Icons.search_outlined,
          title: tr(context, 'Review'),
          subtitle: tr(context, 'The reported content or account may be reviewed.'),
        ),
        _GuidanceItem(
          icon: Icons.gavel_outlined,
          title: tr(context, 'Possible Actions'),
          subtitle: tr(context, 'Action may be taken when a violation is confirmed.'),
        ),
        _GuidanceItem(
          icon: Icons.notifications_outlined,
          title: tr(context, 'Updates'),
          subtitle: tr(context, 'Relevant updates may be provided when applicable.'),
        ),
      ],
    );
  }
}

class _GuidanceItem {
  final IconData icon;
  final String title;
  final String subtitle;

  const _GuidanceItem({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
}

class _GuidanceScreen extends StatelessWidget {
  final String title;
  final String description;
  final String sectionTitle;
  final List<_GuidanceItem> items;

  const _GuidanceScreen({
    required this.title,
    required this.description,
    required this.sectionTitle,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: title,
      description: description,
      sections: [
        SettingsSection(
          title: sectionTitle,
          items: [
            for (final item in items)
              SettingsItem(
                icon: item.icon,
                title: item.title,
                subtitle: item.subtitle,
                type: SettingsItemType.action,
              ),
          ],
        ),
      ],
    );
  }
}

class AboutNexoraSupportScreen extends StatelessWidget {
  const AboutNexoraSupportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'About Nexora'),
      description: tr(context, 'Learn more about Nexora and the people behind it.'),
      sections: [
        SettingsSection(
          title: 'Nexora',
          items: [
            SettingsItem(
              icon: Icons.info_outline,
              title: tr(context, 'App Information'),
              subtitle: tr(context, 'Version and build information'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const AppInformationScreen(),
                  ),
                );
              },
            ),
            SettingsItem(
              icon: Icons.groups_outlined,
              title: tr(context, 'Nexora Team'),
              subtitle: tr(context, 'Learn about the team behind Nexora'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const NexoraTeamScreen()),
                );
              },
            ),
          ],
        ),
      ],
    );
  }
}

class AppInformationScreen extends StatelessWidget {
  const AppInformationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'App Information'),
      description: tr(context, 'Information about this Nexora application build.'),
      sections: const [
        SettingsSection(
          title: 'Nexora',
          items: [
            SettingsItem(
              icon: Icons.apps_outlined,
              title: 'Version',
              subtitle: '1.0.0',
              type: SettingsItemType.action,
            ),
            SettingsItem(
              icon: Icons.build_outlined,
              title: 'Build',
              subtitle: 'Development Build',
              type: SettingsItemType.action,
            ),
          ],
        ),
      ],
    );
  }
}

class NexoraTeamScreen extends StatelessWidget {
  const NexoraTeamScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: tr(context, 'Nexora Team'),
      description: tr(context, 'Learn more about the people building Nexora.'),
      sections: const [
        SettingsSection(
          title: 'The Team',
          items: [
            SettingsItem(
              icon: Icons.groups_outlined,
              title: 'Nexora Team',
              subtitle: 'The team behind the Nexora social platform.',
              type: SettingsItemType.action,
            ),
          ],
        ),
      ],
    );
  }
}
