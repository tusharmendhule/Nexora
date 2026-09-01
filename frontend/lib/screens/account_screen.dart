import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import 'login_screen.dart';
import 'settings_detail_screen.dart';

class AccountData {
  String name = 'Your Name';
  String username = '@yourusername';
  String email = 'rajat@example.com';
  String? phone;

  final List<Map<String, String>> accounts = [
    {'name': 'Your Name', 'username': '@yourusername'},
  ];

  final List<String> accountHistory = [];

  void addHistory(String change) {
    accountHistory.insert(0, change);
  }
}

final AccountData accountData = AccountData();

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  void _open(
    BuildContext context, {
    required String title,
    required String description,
    required List<SettingsSection> sections,
  }) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SettingsDetailScreen(
          title: title,
          description: description,
          sections: sections,
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
          'Account',
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
          _profileHeader(),

          const SizedBox(height: 28),

          _sectionTitle('Account Information'),

          _tile(
            icon: Icons.person_outline,
            title: 'Personal Information',
            subtitle: 'Manage your name, username and profile details',
            onTap: () {
              _open(
                context,
                title: 'Personal Information',
                description: 'Manage the personal information associated with your account.',
                sections: [
                  SettingsSection(
                    title: 'Personal Information',
                    items: [
                      SettingsItem(
                        icon: Icons.badge_outlined,
                        title: 'Name',
                        subtitle: accountData.name,
                        type: SettingsItemType.navigation,
                        onTap: () => _editName(context),
                      ),
                      SettingsItem(
                        icon: Icons.alternate_email,
                        title: 'Username',
                        subtitle: accountData.username,
                        type: SettingsItemType.navigation,
                        onTap: () => _editUsername(context),
                      ),
                      SettingsItem(
                        icon: Icons.person_outline,
                        title: 'Profile Details',
                        subtitle: 'Manage your profile information',
                        type: SettingsItemType.navigation,
                        onTap: () => _profileDetails(context),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),

          _tile(
            icon: Icons.email_outlined,
            title: 'Email Address',
            subtitle: accountData.email,
            onTap: () => _emailScreen(context),
          ),

          _tile(
            icon: Icons.phone_outlined,
            title: 'Phone Number',
            subtitle: accountData.phone ?? 'Not added',
            onTap: () => _phoneScreen(context),
          ),

          const SizedBox(height: 24),

          _sectionTitle('Account Management'),

          _tile(
            icon: Icons.person_add_alt_1_outlined,
            title: 'Switch Account',
            subtitle:
                '${accountData.accounts.length} account'
                '${accountData.accounts.length == 1 ? '' : 's'}',
            onTap: () => _switchAccount(context),
          ),

          _tile(
            icon: Icons.download_outlined,
            title: 'Download Your Information',
            subtitle: 'Get a copy of your account information',
            onTap: () => _downloadInformation(context),
          ),

          _tile(
            icon: Icons.history_outlined,
            title: 'Account History',
            subtitle:
                '${accountData.accountHistory.length} recorded change'
                '${accountData.accountHistory.length == 1 ? '' : 's'}',
            onTap: () => _accountHistory(context),
          ),

          const SizedBox(height: 24),

          _sectionTitle('Account Status'),

          _statusCard(),

          const SizedBox(height: 24),

          _sectionTitle('Danger Zone'),

          _dangerTile(
            icon: Icons.pause_circle_outline,
            title: 'Deactivate Account',
            subtitle: 'Temporarily hide your Nexora account',
            onTap: () => _showDeactivateDialog(context),
          ),

          _dangerTile(
            icon: Icons.delete_outline,
            title: 'Delete Account',
            subtitle: 'Permanently delete your Nexora account',
            onTap: () => _showDeleteDialog(context),
          ),

          const SizedBox(height: 24),

          _sectionTitle('Session'),

          _dangerTile(
            icon: Icons.logout,
            title: 'Log Out',
            subtitle: 'Sign out of your Nexora account',
            onTap: () => _showLogoutDialog(context),
          ),

          const SizedBox(height: 30),

          Center(
            child: Text(
              'Manage your Nexora account.',
              style: TextStyle(
                color: Colors.white.withOpacity(0.35),
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _editName(BuildContext context) {
    final controller = TextEditingController(text: accountData.name);

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _InputScreen(
          title: 'Name',
          description: 'Update your display name.',
          label: 'Display Name',
          initialValue: accountData.name,
          controller: controller,
          onSave: (value) {
            if (value.trim().isEmpty) return;

            accountData.name = value.trim();
            accountData.addHistory('Name changed');
          },
        ),
      ),
    ).then((_) {
      if (mounted) setState(() {});
    });
  }

  void _editUsername(BuildContext context) {
    final controller = TextEditingController(text: accountData.username);

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _InputScreen(
          title: 'Username',
          description: 'Update your Nexora username.',
          label: 'Username',
          initialValue: accountData.username,
          controller: controller,
          onSave: (value) {
            if (value.trim().isEmpty) return;

            String username = value.trim();

            if (!username.startsWith('@')) {
              username = '@$username';
            }

            accountData.username = username;
            accountData.accounts.first['username'] = username;
            accountData.addHistory('Username changed');
          },
        ),
      ),
    ).then((_) {
      if (mounted) setState(() {});
    });
  }

  void _profileDetails(BuildContext context) {
    _open(
      context,
      title: 'Profile Details',
      description: 'Manage the information displayed on your profile.',
      sections: [
        SettingsSection(
          title: 'Profile',
          items: [
            SettingsItem(
              icon: Icons.person_outline,
              title: 'Name',
              subtitle: accountData.name,
              type: SettingsItemType.action,
              onTap: () => _editName(context),
            ),
            SettingsItem(
              icon: Icons.alternate_email,
              title: 'Username',
              subtitle: accountData.username,
              type: SettingsItemType.action,
              onTap: () => _editUsername(context),
            ),
          ],
        ),
      ],
    );
  }

  void _emailScreen(BuildContext context) {
    _open(
      context,
      title: 'Email Address',
      description: 'Manage the email address connected to your Nexora account.',
      sections: [
        SettingsSection(
          title: 'Email',
          items: [
            SettingsItem(
              icon: Icons.email_outlined,
              title: 'Current Email',
              subtitle: accountData.email,
              type: SettingsItemType.navigation,
              onTap: () {
                _open(
                  context,
                  title: 'Current Email',
                  description:
                      'View the email currently connected to your account.',
                  sections: [
                    SettingsSection(
                      title: 'Current Email',
                      items: [
                        SettingsItem(
                          icon: Icons.email_outlined,
                          title: 'Email Address',
                          subtitle: accountData.email,
                          type: SettingsItemType.action,
                          onTap: () {},
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
            SettingsItem(
              icon: Icons.edit_outlined,
              title: 'Change Email',
              subtitle: 'Update your connected email address',
              type: SettingsItemType.navigation,
              onTap: () {
                final controller = TextEditingController(
                  text: accountData.email,
                );

                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => _InputScreen(
                      title: 'Change Email',
                      description:
                          'Update the email address connected to your account.',
                      label: 'Email Address',
                      initialValue: accountData.email,
                      controller: controller,
                      keyboardType: TextInputType.emailAddress,
                      onSave: (value) {
                        if (value.trim().isEmpty) return;

                        accountData.email = value.trim();
                        accountData.addHistory('Email address changed');
                      },
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ],
    );
  }

  void _phoneScreen(BuildContext context) {
    _open(
      context,
      title: 'Phone Number',
      description: 'Manage the phone number connected to your Nexora account.',
      sections: [
        SettingsSection(
          title: 'Phone',
          items: [
            SettingsItem(
              icon: Icons.phone_outlined,
              title: 'Phone Number',
              subtitle: accountData.phone ?? 'Not added',
              type: SettingsItemType.navigation,
              onTap: () {
                _open(
                  context,
                  title: 'Phone Number',
                  description: 'Manage your connected phone number.',
                  sections: [
                    SettingsSection(
                      title: 'Current Number',
                      items: [
                        SettingsItem(
                          icon: Icons.phone_outlined,
                          title: 'Phone Number',
                          subtitle: accountData.phone ?? 'Not added',
                          type: SettingsItemType.action,
                          onTap: () {},
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
            SettingsItem(
              icon: Icons.add_call,
              title: accountData.phone == null
                  ? 'Add Phone Number'
                  : 'Change Phone Number',
              subtitle: accountData.phone == null
                  ? 'Connect a phone number to your account'
                  : 'Update your connected phone number',
              type: SettingsItemType.navigation,
              onTap: () {
                final controller = TextEditingController(
                  text: accountData.phone ?? '',
                );

                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => _InputScreen(
                      title: accountData.phone == null
                          ? 'Add Phone Number'
                          : 'Change Phone Number',
                      description:
                          'Connect a phone number to your Nexora account.',
                      label: 'Phone Number',
                      initialValue: accountData.phone ?? '',
                      controller: controller,
                      keyboardType: TextInputType.phone,
                      onSave: (value) {
                        if (value.trim().isEmpty) return;

                        accountData.phone = value.trim();
                        accountData.addHistory('Phone number changed');
                      },
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ],
    );
  }

  void _switchAccount(BuildContext context) {
    _open(
      context,
      title: 'Switch Account',
      description: 'Switch between your Nexora accounts.',
      sections: [
        SettingsSection(
          title: 'Your Accounts',
          items: [
            for (final account in accountData.accounts)
              SettingsItem(
                icon: Icons.person_outline,
                title: account['name']!,
                subtitle: account['username']!,
                type: SettingsItemType.selection,
                valueText: account['username'] == accountData.username
                    ? 'Current'
                    : 'Switch',
                onTap: () {
                  accountData.username = account['username']!;
                  accountData.name = account['name']!;
                  accountData.addHistory('Switched to ${account['username']}');

                  Navigator.pop(context);
                },
              ),

            SettingsItem(
              icon: Icons.add_circle_outline,
              title: 'Add Account',
              subtitle: 'Add another Nexora account',
              type: SettingsItemType.navigation,
              onTap: () => _addAccount(context),
            ),
          ],
        ),
      ],
    );
  }

  void _addAccount(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => _AddAccountScreen()),
    ).then((_) {
      if (mounted) setState(() {});
    });
  }

  void _downloadInformation(BuildContext context) {
    _open(
      context,
      title: 'Download Your Information',
      description:
          'Get a copy of the information associated with your Nexora account.',
      sections: [
        SettingsSection(
          title: 'Your Information',
          items: [
            SettingsItem(
              icon: Icons.description_outlined,
              title: 'Account Information',
              subtitle: 'View information associated with your account',
              type: SettingsItemType.navigation,
              onTap: () {
                _open(
                  context,
                  title: 'Account Information',
                  description:
                      'Information currently associated with your account.',
                  sections: [
                    SettingsSection(
                      title: 'Information',
                      items: [
                        SettingsItem(
                          icon: Icons.person_outline,
                          title: 'Profile',
                          subtitle:
                              '${accountData.name} · ${accountData.username}',
                          type: SettingsItemType.action,
                          onTap: () {},
                        ),
                        SettingsItem(
                          icon: Icons.email_outlined,
                          title: 'Email',
                          subtitle: accountData.email,
                          type: SettingsItemType.action,
                          onTap: () {},
                        ),
                        SettingsItem(
                          icon: Icons.phone_outlined,
                          title: 'Phone',
                          subtitle: accountData.phone ?? 'Not added',
                          type: SettingsItemType.action,
                          onTap: () {},
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
            SettingsItem(
              icon: Icons.download_outlined,
              title: 'Request Information',
              subtitle: 'Request a downloadable copy',
              type: SettingsItemType.navigation,
              onTap: () {
                _open(
                  context,
                  title: 'Request Information',
                  description: 'Request a copy of your Nexora information.',
                  sections: [
                    SettingsSection(
                      title: 'Request',
                      items: [
                        SettingsItem(
                          icon: Icons.download_outlined,
                          title: 'Request Download',
                          subtitle: 'Start a request for your information',
                          type: SettingsItemType.action,
                          onTap: () {
                            accountData.addHistory(
                              'Information download requested',
                            );

                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Information request submitted'),
                                behavior: SnackBarBehavior.floating,
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ],
    );
  }

  void _accountHistory(BuildContext context) {
    _open(
      context,
      title: 'Account History',
      description: 'View important changes made to your Nexora account.',
      sections: [
        SettingsSection(
          title: 'Account Changes',
          items: accountData.accountHistory.isEmpty
              ? [
                  const SettingsItem(
                    icon: Icons.history_outlined,
                    title: 'No Recent Changes',
                    subtitle: 'Important account changes will appear here.',
                    type: SettingsItemType.action,
                  ),
                ]
              : [
                  for (final change in accountData.accountHistory)
                    SettingsItem(
                      icon: Icons.history_outlined,
                      title: change,
                      subtitle: 'Account activity',
                      type: SettingsItemType.action,
                    ),
                ],
        ),
      ],
    );
  }

  static Widget _profileHeader() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Row(
        children: [
          Container(
            width: 62,
            height: 62,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
              ),
            ),
            child: const Icon(Icons.person, color: Colors.white, size: 31),
          ),
          const SizedBox(width: 15),
          Expanded(
            child: Builder(
              builder: (_) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    accountData.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    accountData.username,
                    style: const TextStyle(color: Colors.white54, fontSize: 13),
                  ),
                ],
              ),
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

  static Widget _tile({
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
        leading: _iconBox(icon),
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

  static Widget _iconBox(IconData icon) {
    return Container(
      width: 42,
      height: 42,
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        gradient: LinearGradient(
          colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
        ),
      ),
      child: Icon(icon, color: Colors.white, size: 21),
    );
  }

  static Widget _statusCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Row(
        children: [
          Icon(Icons.verified_outlined, color: Colors.greenAccent, size: 28),
          SizedBox(width: 13),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Account active',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              SizedBox(height: 3),
              Text(
                'Your account is in good standing.',
                style: TextStyle(color: Colors.white54, fontSize: 12),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static Widget _dangerTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF211724),
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
          child: Icon(icon, color: Colors.redAccent.withOpacity(0.85)),
        ),
        title: Text(
          title,
          style: const TextStyle(
            color: Colors.redAccent,
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

  static void _showDeactivateDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF171D35),
        title: const Text(
          'Deactivate Account?',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'Your account will be temporarily hidden.\n'
          'You can return to Nexora later.',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text(
              'Cancel',
              style: TextStyle(color: Colors.white70),
            ),
          ),
          TextButton(
            onPressed: () {
              accountData.addHistory('Account deactivated');
              Navigator.pop(context);
            },
            child: const Text(
              'Deactivate',
              style: TextStyle(color: Colors.redAccent),
            ),
          ),
        ],
      ),
    );
  }

  static void _showDeleteDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF171D35),
        title: const Text(
          'Delete Account?',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'This action is permanent. Your Nexora account '
          'and its associated information will be deleted.',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text(
              'Cancel',
              style: TextStyle(color: Colors.white70),
            ),
          ),
          TextButton(
            onPressed: () {
              accountData.addHistory('Account deletion requested');
              Navigator.pop(context);
            },
            child: const Text(
              'Delete',
              style: TextStyle(color: Colors.redAccent),
            ),
          ),
        ],
      ),
    );
  }

  static void _showLogoutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF171D35),
        title: const Text(
          'Log Out?',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'You will be signed out of your Nexora account.',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text(
              'Cancel',
              style: TextStyle(color: Colors.white70),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context); // close dialog
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
  }
}

class _InputScreen extends StatelessWidget {
  final String title;
  final String description;
  final String label;
  final String initialValue;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final void Function(String) onSave;

  const _InputScreen({
    required this.title,
    required this.description,
    required this.label,
    required this.initialValue,
    required this.controller,
    required this.onSave,
    this.keyboardType,
  });

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
        title: Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 15, 18, 30),
        children: [
          Text(
            description,
            style: const TextStyle(
              color: Colors.white54,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 25),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: const Color(0xFF171D35),
              borderRadius: BorderRadius.circular(18),
            ),
            child: TextField(
              controller: controller,
              keyboardType: keyboardType,
              style: const TextStyle(color: Colors.white, fontSize: 15),
              decoration: InputDecoration(
                labelText: label,
                labelStyle: const TextStyle(color: Colors.white54),
                enabledBorder: const UnderlineInputBorder(
                  borderSide: BorderSide(color: Colors.white24),
                ),
                focusedBorder: const UnderlineInputBorder(
                  borderSide: BorderSide(color: Color(0xFF7C3AED)),
                ),
              ),
            ),
          ),
          const SizedBox(height: 22),
          SizedBox(
            height: 52,
            child: DecoratedBox(
              decoration: const BoxDecoration(
                borderRadius: BorderRadius.all(Radius.circular(16)),
                gradient: LinearGradient(
                  colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
                ),
              ),
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                ),
                onPressed: () {
                  onSave(controller.text);
                  Navigator.pop(context);
                },
                child: const Text(
                  'Save',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddAccountScreen extends StatefulWidget {
  @override
  State<_AddAccountScreen> createState() => _AddAccountScreenState();
}

class _AddAccountScreenState extends State<_AddAccountScreen> {
  final nameController = TextEditingController();
  final usernameController = TextEditingController();

  @override
  void dispose() {
    nameController.dispose();
    usernameController.dispose();
    super.dispose();
  }

  void _addAccount() {
    final name = nameController.text.trim();
    var username = usernameController.text.trim();

    if (name.isEmpty || username.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter both name and username'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    if (!username.startsWith('@')) {
      username = '@$username';
    }

    accountData.accounts.add({'name': name, 'username': username});

    accountData.addHistory('Added account $username');

    Navigator.pop(context);
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
          icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Add Account',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const Text(
            'Add another Nexora account.',
            style: TextStyle(color: Colors.white54, fontSize: 13),
          ),
          const SizedBox(height: 25),
          _field(controller: nameController, label: 'Name'),
          const SizedBox(height: 12),
          _field(controller: usernameController, label: 'Username'),
          const SizedBox(height: 22),
          SizedBox(
            height: 52,
            child: DecoratedBox(
              decoration: const BoxDecoration(
                borderRadius: BorderRadius.all(Radius.circular(16)),
                gradient: LinearGradient(
                  colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
                ),
              ),
              child: ElevatedButton(
                onPressed: _addAccount,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                ),
                child: const Text(
                  'Add Account',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String label,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
      ),
      child: TextField(
        controller: controller,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          labelText: label,
          labelStyle: const TextStyle(color: Colors.white54),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 17,
          ),
        ),
      ),
    );
  }
}
