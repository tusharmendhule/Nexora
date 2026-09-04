import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

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
          'Help & Support',
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

          _sectionTitle('Get Help'),

          _tile(
            icon: Icons.bug_report_outlined,
            title: 'Report a Problem',
            subtitle: 'Tell us about something that is not working',
            onTap: _openReportProblem,
          ),

          _tile(
            icon: Icons.chat_bubble_outline,
            title: 'Contact Nexora Support',
            subtitle: 'Get in touch with the Nexora support team',
            onTap: _openContactSupport,
          ),

          _tile(
            icon: Icons.receipt_long_outlined,
            title: 'My Support Requests',
            subtitle: supportRequests.isEmpty
                ? 'View your previous support requests'
                : '${supportRequests.length} support request'
                      '${supportRequests.length == 1 ? '' : 's'}',
            onTap: _openSupportRequests,
          ),

          SizedBox(height: 24),

          _sectionTitle('Frequently Asked Questions'),

          if (filteredFaqs.isEmpty)
            _emptySearch()
          else
            ...filteredFaqs.map(
              (faq) =>
                  _faqTile(question: faq['question']!, answer: faq['answer']!),
            ),

          SizedBox(height: 24),

          _sectionTitle('Safety'),

          _tile(
            icon: Icons.shield_outlined,
            title: 'Safety Center',
            subtitle: 'Learn how to keep your Nexora experience safe',
            onTap: _openSafetyCenter,
          ),

          _tile(
            icon: Icons.groups_outlined,
            title: 'Community Guidelines',
            subtitle: 'Learn the rules and expectations for everyone',
            onTap: _openCommunityGuidelines,
          ),

          SizedBox(height: 24),

          _sectionTitle('About'),

          _tile(
            icon: Icons.info_outline,
            title: 'About Nexora',
            subtitle: 'Learn more about Nexora and the team behind it',
            onTap: _openAboutNexora,
          ),

          SizedBox(height: 30),

          Center(
            child: Text(
              'Nexora Support',
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
            'How can we help?',
            style: TextStyle(
              color: context.nexora.textPrimary,
              fontSize: 19,
              fontWeight: FontWeight.w700,
            ),
          ),
          SizedBox(height: 5),
          Text(
            'Find answers, report problems, or get in touch with Nexora Support.',
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
          hintText: 'Search help',
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
            'No help articles found',
            style: TextStyle(
              color: context.nexora.textSecondary,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'Try another search.',
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
          content: Text('Describe the problem first.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    supportRequests.add(
      SupportRequest(
        title: 'Reported Problem',
        description: description,
        date: 'Just now',
      ),
    );

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Problem reported successfully.'),
        behavior: SnackBarBehavior.floating,
      ),
    );

    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return SettingsDetailScreen(
      title: 'Report a Problem',
      description:
          'Tell us about something that is not working correctly in Nexora.',
      sections: [
        SettingsSection(
          title: 'Problem',
          items: [
            SettingsItem(
              icon: Icons.edit_outlined,
              title: 'Describe the Problem',
              subtitle: controller.text.isEmpty
                  ? 'Tap to describe what went wrong'
                  : controller.text,
              type: SettingsItemType.action,
              onTap: _showDescriptionDialog,
            ),
            SettingsItem(
              icon: Icons.send_outlined,
              title: 'Submit Report',
              subtitle: 'Send your problem to Nexora Support',
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
            'Describe the Problem',
            style: TextStyle(color: context.nexora.textPrimary),
          ),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 6,
            style: TextStyle(color: context.nexora.textPrimary),
            decoration: InputDecoration(
              hintText: 'Describe the problem...',
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
                setState(() {});
                Navigator.pop(context);
              },
              child: Text(
                'Done',
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
      title: 'Contact Nexora Support',
      description: 'Choose how you would like to contact our support team.',
      sections: [
        SettingsSection(
          title: 'Contact Options',
          items: [
            SettingsItem(
              icon: Icons.email_outlined,
              title: 'Email Support',
              subtitle: 'Send us an email',
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
              title: 'Live Chat',
              subtitle: 'Chat with a support representative',
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
      title: 'Email Support',
      description: 'Send your support request to the Nexora support team.',
      sections: [
        SettingsSection(
          title: 'Email Support',
          items: [
            SettingsItem(
              icon: Icons.email_outlined,
              title: 'support@nexora.app',
              subtitle: 'Your support email address',
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
      title: 'Safety Center',
      description: 'Learn about tools and practices that help keep your Nexora experience safe.',
      sections: [
        SettingsSection(
          title: 'Safety',
          items: [
            SettingsItem(
              icon: Icons.security_outlined,
              title: 'Account Security',
              subtitle: 'Learn how to protect your account',
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
              title: 'Report & Block',
              subtitle: 'Learn how to report or block accounts',
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
      title: 'Account Security',
      description: 'Learn how to keep your Nexora account protected.',
      sections: [
        SettingsSection(
          title: 'Protect Your Account',
          items: [
            SettingsItem(
              icon: Icons.password_outlined,
              title: 'Use a Strong Password',
              subtitle:
                  'Choose a unique password that you do not reuse elsewhere.',
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
              title: 'Use Two-Factor Authentication',
              subtitle: 'Add another layer of protection when signing in.',
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
              title: 'Review Login Activity',
              subtitle:
                  'Check devices and sessions associated with your account.',
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
          content: Text('Please complete all password fields.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    if (newController.text != confirmController.text) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('New passwords do not match.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Password update is ready for backend integration.'),
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
            label: 'Current Password',
          ),
          SizedBox(height: 12),
          _passwordField(controller: newController, label: 'New Password'),
          SizedBox(height: 12),
          _passwordField(
            controller: confirmController,
            label: 'Confirm New Password',
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
                'Update Password',
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
      title: 'Two-Factor Authentication',
      description:
          'Add an extra layer of protection when signing in to Nexora.',
      sections: [
        SettingsSection(
          title: 'Security',
          items: [
            SettingsItem(
              icon: Icons.security_outlined,
              title: 'Two-Factor Authentication',
              subtitle: enabled ? 'Enabled' : 'Disabled',
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
              title: 'Authentication Method',
              subtitle: 'Choose how you verify your identity',
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
              title: 'Recovery Codes',
              subtitle: 'Use recovery codes if you lose access',
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
      title: 'Authentication Method',
      description: 'Choose how you want to verify your identity.',
      sections: [
        SettingsSection(
          title: 'Available Methods',
          items: [
            SettingsItem(
              icon: Icons.sms_outlined,
              title: 'Text Message',
              subtitle: 'Receive verification codes by SMS',
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
              title: 'Authenticator App',
              subtitle: 'Use a compatible authentication app',
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
      title: 'Text Message',
      description:
          'Use your phone number to receive verification codes by SMS.',
      sections: [
        SettingsSection(
          title: 'SMS Verification',
          items: [
            SettingsItem(
              icon: Icons.phone_outlined,
              title: 'Phone Number',
              subtitle: 'Manage the phone number used for verification',
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
              title: 'Verify Phone Number',
              subtitle: 'Send a verification code to your phone',
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
      title: 'Authenticator App',
      description:
          'Use a compatible authentication app to generate verification codes.',
      sections: [
        SettingsSection(
          title: 'Authenticator Setup',
          items: [
            SettingsItem(
              icon: Icons.qr_code_2_outlined,
              title: 'Set Up Authenticator',
              subtitle: 'Connect an authenticator app to your account',
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
              title: 'Verify Setup',
              subtitle: 'Enter a code from your authenticator app',
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
      title: 'Login Activity',
      description:
          'Review devices and sessions associated with your Nexora account.',
      sections: [
        SettingsSection(
          title: 'Devices',
          items: [
            SettingsItem(
              icon: Icons.phone_android_outlined,
              title: 'Current Device',
              subtitle: 'This device · Active now',
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
              title: 'Windows PC',
              subtitle: 'Last active recently',
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
              title: 'Log Out Other Devices',
              subtitle: 'Sign out of other active sessions',
              type: SettingsItemType.action,
              onTap: () {
                showDialog(
                  context: context,
                  builder: (dialogContext) {
                    return AlertDialog(
                      backgroundColor: context.nexora.card,
                      title: Text(
                        'Log Out Other Devices?',
                        style: TextStyle(color: context.nexora.textPrimary),
                      ),
                      content: Text(
                        'This will sign out all other active sessions on your Nexora account.',
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
      title: 'Recovery Codes',
      description: 'Recovery codes can help you regain access if you cannot use your normal authentication method.',
      sections: [
        SettingsSection(
          title: 'Recovery',
          items: [
            SettingsItem(
              icon: Icons.vpn_key_outlined,
              title: 'Generate Recovery Codes',
              subtitle: 'Create a new set of recovery codes',
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
      title: 'Report & Block',
      description:
          'Learn how to report content and manage unwanted interactions.',
      sections: [
        SettingsSection(
          title: 'Safety Tools',
          items: [
            SettingsItem(
              icon: Icons.flag_outlined,
              title: 'Report Content',
              subtitle: 'Learn what you can report and how reporting works',
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
              title: 'Block Accounts',
              subtitle:
                  'Learn how blocking works and how to manage blocked accounts',
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
      title: 'What Can Be Reported?',
      description: 'Nexora provides reporting tools for content or behavior that may violate its guidelines.',
      sectionTitle: 'Reportable Content',
      items: const [
        _GuidanceItem(
          icon: Icons.image_outlined,
          title: 'Posts',
          subtitle: 'Report posts that violate Nexora guidelines.',
        ),
        _GuidanceItem(
          icon: Icons.comment_outlined,
          title: 'Comments',
          subtitle: 'Report inappropriate or abusive comments.',
        ),
        _GuidanceItem(
          icon: Icons.chat_bubble_outline,
          title: 'Messages',
          subtitle: 'Report problematic messages or conversations.',
        ),
        _GuidanceItem(
          icon: Icons.person_outline,
          title: 'Accounts',
          subtitle: 'Report accounts involved in guideline violations.',
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
      title: 'How to Report',
      description: 'Use the report option available on the content or account you want to report.',
      sectionTitle: 'Steps',
      items: const [
        _GuidanceItem(
          icon: Icons.looks_one_outlined,
          title: 'Open the Report Option',
          subtitle:
              'Use the report option from the relevant content or profile.',
        ),
        _GuidanceItem(
          icon: Icons.looks_two_outlined,
          title: 'Choose a Reason',
          subtitle: 'Select the reason that best describes the violation.',
        ),
        _GuidanceItem(
          icon: Icons.looks_3_outlined,
          title: 'Submit the Report',
          subtitle: 'Review your selection and submit the report.',
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
      title: 'After Reporting',
      description: 'Reports help Nexora review content and activity that may violate its guidelines.',
      sectionTitle: 'What Happens',
      items: const [
        _GuidanceItem(
          icon: Icons.search_outlined,
          title: 'Review',
          subtitle: 'The reported content may be reviewed according to Nexora policies.',
        ),
        _GuidanceItem(
          icon: Icons.gavel_outlined,
          title: 'Possible Action',
          subtitle:
              'Appropriate action may be taken when a violation is confirmed.',
        ),
        _GuidanceItem(
          icon: Icons.notifications_outlined,
          title: 'Updates',
          subtitle: 'You may receive relevant updates about your report when applicable.',
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
      title: 'Block Accounts',
      description: 'Learn how blocking works and how to manage accounts you have blocked.',
      sections: [
        SettingsSection(
          title: 'Blocking',
          items: [
            SettingsItem(
              icon: Icons.block_outlined,
              title: 'How Blocking Works',
              subtitle: 'Learn what happens when you block an account',
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
              title: 'Manage Blocked Accounts',
              subtitle: 'View and manage accounts you have blocked',
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
      title: 'How Blocking Works',
      description:
          'Blocking is a tool for controlling unwanted interactions on Nexora.',
      sectionTitle: 'When You Block Someone',
      items: const [
        _GuidanceItem(
          icon: Icons.visibility_off_outlined,
          title: 'Reduced Interaction',
          subtitle: 'The blocked account will no longer be able to interact with you normally.',
        ),
        _GuidanceItem(
          icon: Icons.notifications_off_outlined,
          title: 'Interaction Restrictions',
          subtitle:
              'Blocking helps prevent unwanted interactions and notifications.',
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
      title: 'Community Guidelines',
      description: 'Learn about the rules and expectations that help keep Nexora welcoming for everyone.',
      sections: [
        SettingsSection(
          title: 'Guidelines',
          items: [
            SettingsItem(
              icon: Icons.people_outline,
              title: 'Respect Others',
              subtitle: 'Learn how to interact respectfully on Nexora',
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
              title: 'Report Violations',
              subtitle: 'Learn what should be reported and how reporting works',
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
      title: 'Respect Others',
      description: 'Learn about respectful interaction and behavior on Nexora.',
      sections: [
        SettingsSection(
          title: 'Our Expectations',
          items: [
            SettingsItem(
              icon: Icons.favorite_border,
              title: 'Be Respectful',
              subtitle: 'Learn about respectful communication',
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
              title: 'Keep Conversations Constructive',
              subtitle: 'Learn how to disagree without attacking others',
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
      title: 'Be Respectful',
      description: 'Respectful interaction helps make Nexora a better community for everyone.',
      sectionTitle: 'Respectful Behavior',
      items: const [
        _GuidanceItem(
          icon: Icons.handshake_outlined,
          title: 'Treat People With Respect',
          subtitle: 'Avoid targeted harassment, threats, and abusive behavior.',
        ),
        _GuidanceItem(
          icon: Icons.chat_outlined,
          title: 'Communicate Responsibly',
          subtitle: 'Think about how your words may affect other people.',
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
      title: 'Constructive Conversations',
      description: 'Disagreement is part of social interaction, but conversations should remain respectful.',
      sectionTitle: 'Good Conversations',
      items: const [
        _GuidanceItem(
          icon: Icons.forum_outlined,
          title: 'Disagree Respectfully',
          subtitle: 'Focus on ideas rather than attacking the person.',
        ),
        _GuidanceItem(
          icon: Icons.block_outlined,
          title: 'Avoid Personal Attacks',
          subtitle: 'Do not use insults or targeted abuse to make a point.',
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
      title: 'Report Violations',
      description:
          'Learn what should be reported and how Nexora handles reports.',
      sections: [
        SettingsSection(
          title: 'Reporting',
          items: [
            SettingsItem(
              icon: Icons.help_outline,
              title: 'What Should I Report?',
              subtitle:
                  'Learn which behavior and content may violate the guidelines',
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
              title: 'How to Report',
              subtitle:
                  'Learn how to report posts, comments, messages, and accounts',
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
              title: 'What Happens After You Report?',
              subtitle: 'Learn about review and possible actions',
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
      title: 'What Should I Report?',
      description: 'Reports should be used for content or behavior that may violate Nexora Community Guidelines.',
      sectionTitle: 'Examples',
      items: const [
        _GuidanceItem(
          icon: Icons.warning_amber_outlined,
          title: 'Harassment & Bullying',
          subtitle: 'Report targeted harassment, threats, or bullying.',
        ),
        _GuidanceItem(
          icon: Icons.report_problem_outlined,
          title: 'Hate or Abusive Content',
          subtitle: 'Report content that targets people with abusive or hateful behavior.',
        ),
        _GuidanceItem(
          icon: Icons.campaign_outlined,
          title: 'Spam & Scams',
          subtitle:
              'Report deceptive, fraudulent, or repetitive spam activity.',
        ),
        _GuidanceItem(
          icon: Icons.more_horiz_outlined,
          title: 'Other Violations',
          subtitle:
              'Report other content that appears to violate Nexora guidelines.',
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
      title: 'How to Report',
      description: 'You can report content or accounts directly from the relevant area of Nexora.',
      sectionTitle: 'Reporting Steps',
      items: const [
        _GuidanceItem(
          icon: Icons.looks_one_outlined,
          title: 'Open the Report Option',
          subtitle: 'Find the report option on the relevant post, comment, message, or profile.',
        ),
        _GuidanceItem(
          icon: Icons.looks_two_outlined,
          title: 'Select a Reason',
          subtitle: 'Choose the reason that best describes the violation.',
        ),
        _GuidanceItem(
          icon: Icons.looks_3_outlined,
          title: 'Submit',
          subtitle: 'Confirm your selection and submit the report.',
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
      title: 'After You Report',
      description: 'Nexora can review reports to determine whether content or behavior violates its guidelines.',
      sectionTitle: 'Review Process',
      items: const [
        _GuidanceItem(
          icon: Icons.search_outlined,
          title: 'Review',
          subtitle: 'The reported content or account may be reviewed.',
        ),
        _GuidanceItem(
          icon: Icons.gavel_outlined,
          title: 'Possible Actions',
          subtitle: 'Action may be taken when a violation is confirmed.',
        ),
        _GuidanceItem(
          icon: Icons.notifications_outlined,
          title: 'Updates',
          subtitle: 'Relevant updates may be provided when applicable.',
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
      title: 'About Nexora',
      description: 'Learn more about Nexora and the people behind it.',
      sections: [
        SettingsSection(
          title: 'Nexora',
          items: [
            SettingsItem(
              icon: Icons.info_outline,
              title: 'App Information',
              subtitle: 'Version and build information',
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
              title: 'Nexora Team',
              subtitle: 'Learn about the team behind Nexora',
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
      title: 'App Information',
      description: 'Information about this Nexora application build.',
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
      title: 'Nexora Team',
      description: 'Learn more about the people building Nexora.',
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
