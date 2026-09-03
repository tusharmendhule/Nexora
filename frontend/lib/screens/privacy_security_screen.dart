import 'package:flutter/material.dart';

import '../services/settings_service.dart';
import 'settings_detail_screen.dart';

class PrivacySecurityScreen extends StatefulWidget {
  const PrivacySecurityScreen({super.key});

  @override
  State<PrivacySecurityScreen> createState() => _PrivacySecurityScreenState();
}

class _PrivacySecurityScreenState extends State<PrivacySecurityScreen> {
  final SettingsService _settingsService = SettingsService();

  bool privateAccount = false;
  bool activityStatus = true;
  bool readReceipts = true;
  bool personalizedContent = true;
  bool twoFactorEnabled = false;
  String messageRequestOption = 'Everyone';
  String authenticationMethod = 'Authentication App';
  List<String> blockedAccounts = [];
  List<String> mutedAccounts = [];
  bool passwordChanged = false;
  bool dataRequestSubmitted = false;

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
        privateAccount = settings['isPrivateAccount'] ?? false;
        activityStatus = settings['activityStatus'] ?? true;
        readReceipts = settings['readReceipts'] ?? true;
        personalizedContent = settings['personalizedContent'] ?? true;
        twoFactorEnabled = settings['twoFactorEnabled'] ?? false;
        authenticationMethod =
            settings['authenticationMethod'] ?? 'Authentication App';
        messageRequestOption = _mapDmOption(
          settings['allowDirectMessagesFrom'] ?? 'everyone',
        );
        blockedAccounts =
            List<String>.from(settings['blockedAccounts'] ?? []);
        mutedAccounts = List<String>.from(settings['mutedAccounts'] ?? []);
        _isLoading = false;
      });
    } else {
      setState(() => _isLoading = false);
    }
  }

  String _mapDmOption(String backendValue) {
    switch (backendValue) {
      case 'followers':
        return 'People You Follow';
      case 'none':
        return 'Nobody';
      default:
        return 'Everyone';
    }
  }

  String _dmOptionToBackend(String option) {
    switch (option) {
      case 'People You Follow':
        return 'followers';
      case 'Nobody':
        return 'none';
      default:
        return 'everyone';
    }
  }

  Future<void> _saveSettings() async {
    await _settingsService.updateSettings({
      'isPrivateAccount': privateAccount,
      'activityStatus': activityStatus,
      'readReceipts': readReceipts,
      'personalizedContent': personalizedContent,
      'twoFactorEnabled': twoFactorEnabled,
      'authenticationMethod': authenticationMethod,
      'allowDirectMessagesFrom': _dmOptionToBackend(messageRequestOption),
      'blockedAccounts': blockedAccounts,
      'mutedAccounts': mutedAccounts,
    });
  }

  void refresh() {
    if (mounted) {
      setState(() {});
    }
  }

  void openReusable(
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
    ).then((_) => refresh());
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
          'Privacy & Security',
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
                _sectionTitle('Privacy'),

                _switchTile(
                  icon: Icons.lock_outline,
                  title: 'Private Account',
                  subtitle:
                      'Only approved people can follow you and view your content',
                  value: privateAccount,
                  onChanged: (value) {
                    setState(() {
                      privateAccount = value;
                    });
                    _saveSettings();
                  },
                ),

                _switchTile(
                  icon: Icons.visibility_outlined,
                  title: 'Activity Status',
                  subtitle: 'Allow others to see when you are active',
                  value: activityStatus,
                  onChanged: (value) {
                    setState(() {
                      activityStatus = value;
                    });
                    _saveSettings();
                  },
                ),

                _tile(
                  icon: Icons.block_outlined,
                  title: 'Blocked Accounts',
                  subtitle: blockedAccounts.isEmpty
                      ? 'No blocked accounts'
                      : '${blockedAccounts.length} blocked account'
                            '${blockedAccounts.length == 1 ? '' : 's'}',
                  onTap: () => _blockedAccounts(context),
                ),

                _tile(
                  icon: Icons.person_off_outlined,
                  title: 'Muted Accounts',
                  subtitle: mutedAccounts.isEmpty
                      ? 'No muted accounts'
                      : '${mutedAccounts.length} muted account'
                            '${mutedAccounts.length == 1 ? '' : 's'}',
                  onTap: () => _mutedAccounts(context),
                ),

                const SizedBox(height: 24),

                _sectionTitle('Messages'),

                _switchTile(
                  icon: Icons.done_all,
                  title: 'Read Receipts',
                  subtitle: 'Let people know when you have read their messages',
                  value: readReceipts,
                  onChanged: (value) {
                    setState(() {
                      readReceipts = value;
                    });
                    _saveSettings();
                  },
                ),

                _tile(
                  icon: Icons.chat_bubble_outline,
                  title: 'Message Requests',
                  subtitle: messageRequestOption,
                  onTap: () => _messageRequests(context),
                ),

                const SizedBox(height: 24),

                _sectionTitle('Content & Data'),

                _switchTile(
                  icon: Icons.auto_awesome_outlined,
                  title: 'Personalized Content',
                  subtitle: 'Use your activity to personalize what you see',
                  value: personalizedContent,
                  onChanged: (value) {
                    setState(() {
                      personalizedContent = value;
                    });
                    _saveSettings();
                  },
                ),

                _tile(
                  icon: Icons.download_outlined,
                  title: 'Download Your Data',
                  subtitle: dataRequestSubmitted
                      ? 'Data request submitted'
                      : 'Request a copy of your Nexora data',
                  onTap: () => _downloadData(context),
                ),

                const SizedBox(height: 24),

                _sectionTitle('Security'),

                _tile(
                  icon: Icons.password_outlined,
                  title: 'Change Password',
                  subtitle: passwordChanged
                      ? 'Password updated'
                      : 'Update your Nexora password',
                  onTap: () => _changePassword(context),
                ),

                _tile(
                  icon: Icons.security_outlined,
                  title: 'Two-Factor Authentication',
                  subtitle: twoFactorEnabled
                      ? 'Enabled · $authenticationMethod'
                      : 'Add an extra layer of protection',
                  onTap: () => _twoFactorAuthentication(context),
                ),

                _tile(
                  icon: Icons.devices_outlined,
                  title: 'Login Activity',
                  subtitle: 'Review devices signed into your account',
                  onTap: () => _loginActivity(context),
                ),

                const SizedBox(height: 30),

                Center(
                  child: Text(
                    'Your privacy. Your security. Your control.',
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

  void _blockedAccounts(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _AccountListScreen(
          title: 'Blocked Accounts',
          description: 'People you have blocked will not be able to interact with you or view your content.',
          emptyTitle: 'No Blocked Accounts',
          emptySubtitle: 'Accounts you block will appear here.',
          icon: Icons.block_outlined,
          accounts: blockedAccounts,
          actionLabel: 'Block Account',
          removeLabel: 'Unblock',
          onAdd: (name) {
            if (!blockedAccounts.contains(name)) {
              blockedAccounts.add(name);
              _saveSettings();
            }
          },
          onRemove: (name) {
            blockedAccounts.remove(name);
            _saveSettings();
          },
        ),
      ),
    ).then((_) => refresh());
  }

  void _mutedAccounts(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _AccountListScreen(
          title: 'Muted Accounts',
          description: 'Muted accounts remain connected to you, but their content will be hidden from your feed.',
          emptyTitle: 'No Muted Accounts',
          emptySubtitle: 'Accounts you mute will appear here.',
          icon: Icons.volume_off_outlined,
          accounts: mutedAccounts,
          actionLabel: 'Mute Account',
          removeLabel: 'Unmute',
          onAdd: (name) {
            if (!mutedAccounts.contains(name)) {
              mutedAccounts.add(name);
              _saveSettings();
            }
          },
          onRemove: (name) {
            mutedAccounts.remove(name);
            _saveSettings();
          },
        ),
      ),
    ).then((_) => refresh());
  }

  void _messageRequests(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => _MessageRequestsScreen(
        currentOption: messageRequestOption,
        onChanged: (option) {
          setState(() {
            messageRequestOption = option;
          });
          _saveSettings();
        },
      )),
    ).then((_) => refresh());
  }

  void _downloadData(BuildContext context) {
    openReusable(
      context,
      title: 'Download Your Data',
      description: 'Request a copy of the information associated with your Nexora account.',
      sections: [
        SettingsSection(
          title: 'Your Data',
          items: [
            SettingsItem(
              icon: Icons.download_outlined,
              title: 'Request Your Data',
              subtitle: dataRequestSubmitted
                  ? 'Request submitted'
                  : 'Prepare a copy of your Nexora data',
              type: SettingsItemType.action,
              onTap: () {
                setState(() {
                  dataRequestSubmitted = true;
                });

                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Data request submitted'),
                    behavior: SnackBarBehavior.floating,
                  ),
                );

                Navigator.pop(context);
              },
            ),
          ],
        ),
      ],
    );
  }

  void _changePassword(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => _ChangePasswordScreen(
        onPasswordChanged: () {
          setState(() {
            passwordChanged = true;
          });
        },
      )),
    ).then((_) => refresh());
  }

  void _twoFactorAuthentication(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => _TwoFactorScreen(
        twoFactorEnabled: twoFactorEnabled,
        authenticationMethod: authenticationMethod,
        onChanged: (enabled, method) {
          setState(() {
            twoFactorEnabled = enabled;
            authenticationMethod = method;
          });
          _saveSettings();
        },
      )),
    ).then((_) => refresh());
  }

  void _loginActivity(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const _LoginActivityScreen()),
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

  static Widget _switchTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
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
        trailing: Switch(
          value: value,
          onChanged: onChanged,
          activeColor: Colors.white,
          activeTrackColor: const Color(0xFF5B5FEF),
          inactiveThumbColor: Colors.white70,
          inactiveTrackColor: const Color(0xFF30364F),
        ),
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
}

// ─── Account List Screen (Blocked / Muted) ──────────────

class _AccountListScreen extends StatefulWidget {
  final String title;
  final String description;
  final String emptyTitle;
  final String emptySubtitle;
  final IconData icon;
  final List<String> accounts;
  final String actionLabel;
  final String removeLabel;
  final void Function(String) onAdd;
  final void Function(String) onRemove;

  const _AccountListScreen({
    required this.title,
    required this.description,
    required this.emptyTitle,
    required this.emptySubtitle,
    required this.icon,
    required this.accounts,
    required this.actionLabel,
    required this.removeLabel,
    required this.onAdd,
    required this.onRemove,
  });

  @override
  State<_AccountListScreen> createState() => _AccountListScreenState();
}

class _AccountListScreenState extends State<_AccountListScreen> {
  void _addAccount() {
    final controller = TextEditingController();

    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF171D35),
        title: Text(
          widget.actionLabel,
          style: const TextStyle(color: Colors.white),
        ),
        content: TextField(
          controller: controller,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: 'Enter username',
            hintStyle: TextStyle(color: Colors.white38),
          ),
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
              final name = controller.text.trim();

              if (name.isNotEmpty) {
                widget.onAdd(name);
                setState(() {});
              }

              Navigator.pop(context);
            },
            child: const Text(
              'Add',
              style: TextStyle(color: Color(0xFF8B7CFF)),
            ),
          ),
        ],
      ),
    );
  }

  void _removeAccount(String account) {
    widget.onRemove(account);
    setState(() {});
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
        title: Text(
          widget.title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
        children: [
          Text(
            widget.description,
            style: const TextStyle(
              color: Colors.white54,
              fontSize: 12,
              height: 1.4,
            ),
          ),

          const SizedBox(height: 22),

          _sectionTitle(widget.title),

          if (widget.accounts.isEmpty)
            _emptyCard()
          else
            ...widget.accounts.map((account) => _accountTile(account)),

          const SizedBox(height: 14),

          _addTile(),
        ],
      ),
    );
  }

  Widget _accountTile(String account) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
        leading: _iconBox(widget.icon),
        title: Text(
          account,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: const Text(
          'Account',
          style: TextStyle(color: Colors.white54, fontSize: 12),
        ),
        trailing: TextButton(
          onPressed: () => _removeAccount(account),
          child: Text(
            widget.removeLabel,
            style: const TextStyle(color: Color(0xFF8B7CFF), fontSize: 12),
          ),
        ),
      ),
    );
  }

  Widget _emptyCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          _iconBox(widget.icon),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'No accounts',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  'Nothing has been added here yet.',
                  style: TextStyle(color: Colors.white54, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _addTile() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
      ),
      child: ListTile(
        leading: _iconBox(Icons.add),
        title: Text(
          widget.actionLabel,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        trailing: const Icon(Icons.chevron_right, color: Colors.white38),
        onTap: _addAccount,
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
        ),
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
}

// ─── Message Requests Screen ──────────────────────────

class _MessageRequestsScreen extends StatefulWidget {
  final String currentOption;
  final ValueChanged<String> onChanged;

  const _MessageRequestsScreen({
    required this.currentOption,
    required this.onChanged,
  });

  @override
  State<_MessageRequestsScreen> createState() => _MessageRequestsScreenState();
}

class _MessageRequestsScreenState extends State<_MessageRequestsScreen> {
  late String selectedOption;

  @override
  void initState() {
    super.initState();
    selectedOption = widget.currentOption;
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
          'Message Requests',
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
          const Text(
            'Choose how message requests from people you do not follow are handled.',
            style: TextStyle(color: Colors.white54, fontSize: 12, height: 1.4),
          ),

          const SizedBox(height: 22),

          _sectionTitle('Message Requests'),

          _option(
            icon: Icons.groups_outlined,
            title: 'Everyone',
            subtitle: 'Allow message requests from anyone',
            value: 'Everyone',
          ),

          _option(
            icon: Icons.person_outline,
            title: 'People You Follow',
            subtitle: 'Only people you follow can send requests',
            value: 'People You Follow',
          ),
        ],
      ),
    );
  }

  Widget _option({
    required IconData icon,
    required String title,
    required String subtitle,
    required String value,
  }) {
    final selected = selectedOption == value;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: selected ? const Color(0xFF1C2342) : const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: selected
              ? const Color(0xFF6D63E8).withOpacity(0.55)
              : Colors.white.withOpacity(0.05),
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
        leading: _iconBox(icon),
        title: Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
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
        trailing: selected
            ? const Icon(Icons.check_circle, color: Color(0xFF8B7CFF))
            : const Icon(Icons.radio_button_unchecked, color: Colors.white24),
        onTap: () {
          setState(() {
            selectedOption = value;
          });
          widget.onChanged(value);
        },
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
        ),
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
}

// ─── Change Password Screen ──────────────────────────

class _ChangePasswordScreen extends StatefulWidget {
  final VoidCallback? onPasswordChanged;

  const _ChangePasswordScreen({this.onPasswordChanged});

  @override
  State<_ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<_ChangePasswordScreen> {
  final currentController = TextEditingController();
  final newController = TextEditingController();
  final confirmController = TextEditingController();
  final SettingsService _settingsService = SettingsService();
  bool _saving = false;

  @override
  void dispose() {
    currentController.dispose();
    newController.dispose();
    confirmController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (currentController.text.isEmpty ||
        newController.text.isEmpty ||
        confirmController.text.isEmpty) {
      _message('Please fill in all password fields.');
      return;
    }

    if (newController.text != confirmController.text) {
      _message('New passwords do not match.');
      return;
    }

    if (newController.text.length < 6) {
      _message('New password must be at least 6 characters.');
      return;
    }

    setState(() => _saving = true);

    final error = await _settingsService.changePassword(
      currentPassword: currentController.text,
      newPassword: newController.text,
    );

    if (!mounted) return;

    setState(() => _saving = false);

    if (error == null) {
      widget.onPasswordChanged?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Password updated'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      Navigator.pop(context);
    } else {
      _message(error);
    }
  }

  void _message(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
    );
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
          'Change Password',
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
          const Text(
            'Keep your account secure by regularly updating your password.',
            style: TextStyle(color: Colors.white54, fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: 22),
          _passwordField(
            controller: currentController,
            label: 'Current Password',
          ),
          const SizedBox(height: 12),
          _passwordField(controller: newController, label: 'New Password'),
          const SizedBox(height: 12),
          _passwordField(
            controller: confirmController,
            label: 'Confirm New Password',
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
                onPressed: _saving ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                ),
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Update Password',
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

  Widget _passwordField({
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
        obscureText: true,
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

// ─── Two-Factor Screen ───────────────────────────────

class _TwoFactorScreen extends StatefulWidget {
  final bool twoFactorEnabled;
  final String authenticationMethod;
  final void Function(bool enabled, String method) onChanged;

  const _TwoFactorScreen({
    required this.twoFactorEnabled,
    required this.authenticationMethod,
    required this.onChanged,
  });

  @override
  State<_TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends State<_TwoFactorScreen> {
  late bool twoFactorEnabled;
  late String authenticationMethod;

  @override
  void initState() {
    super.initState();
    twoFactorEnabled = widget.twoFactorEnabled;
    authenticationMethod = widget.authenticationMethod;
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
          'Two-Factor Authentication',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
        children: [
          const Text(
            'Add another verification step when signing into your Nexora account.',
            style: TextStyle(color: Colors.white54, fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: 22),
          _sectionTitle('Two-Factor Authentication'),
          _switchTile(
            icon: Icons.security_outlined,
            title: 'Authentication',
            subtitle: 'Protect your account with two-factor authentication',
            value: twoFactorEnabled,
            onChanged: (value) {
              setState(() {
                twoFactorEnabled = value;
              });
              widget.onChanged(twoFactorEnabled, authenticationMethod);
            },
          ),
          _tile(
            icon: Icons.phone_android_outlined,
            title: 'Authentication Method',
            subtitle: authenticationMethod,
            onTap: _authenticationMethod,
          ),
        ],
      ),
    );
  }

  void _authenticationMethod() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF171D35),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(18, 20, 18, 30),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Authentication Method',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 18),
                  _method(
                    context,
                    setSheetState,
                    'Authentication App',
                    Icons.phone_android_outlined,
                  ),
                  _method(context, setSheetState, 'SMS', Icons.sms_outlined),
                  _method(
                    context,
                    setSheetState,
                    'Security Key',
                    Icons.vpn_key_outlined,
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _method(
    BuildContext context,
    StateSetter setSheetState,
    String name,
    IconData icon,
  ) {
    final selected = authenticationMethod == name;

    return ListTile(
      leading: _iconBox(icon),
      title: Text(name, style: const TextStyle(color: Colors.white)),
      trailing: selected
          ? const Icon(Icons.check_circle, color: Color(0xFF8B7CFF))
          : const Icon(Icons.radio_button_unchecked, color: Colors.white24),
      onTap: () {
        setSheetState(() {
          authenticationMethod = name;
        });

        setState(() {});

        widget.onChanged(twoFactorEnabled, authenticationMethod);

        Navigator.pop(context);
      },
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
      ),
      child: ListTile(
        leading: _iconBox(icon),
        title: Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: const TextStyle(color: Colors.white54, fontSize: 12),
        ),
        trailing: const Icon(Icons.chevron_right, color: Colors.white38),
        onTap: onTap,
      ),
    );
  }

  static Widget _switchTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
      ),
      child: ListTile(
        leading: _iconBox(icon),
        title: Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: const TextStyle(color: Colors.white54, fontSize: 12),
        ),
        trailing: Switch(
          value: value,
          onChanged: onChanged,
          activeColor: Colors.white,
          activeTrackColor: const Color(0xFF5B5FEF),
        ),
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
}

// ─── Login Activity Screen ──────────────────────────

class _LoginActivityScreen extends StatefulWidget {
  const _LoginActivityScreen();

  @override
  State<_LoginActivityScreen> createState() => _LoginActivityScreenState();
}

class _LoginActivityScreenState extends State<_LoginActivityScreen> {
  bool currentDeviceActive = true;

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
          'Login Activity',
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
          const Text(
            'Review recent devices and sessions associated with your Nexora account.',
            style: TextStyle(color: Colors.white54, fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: 22),
          _sectionTitle('Recent Activity'),
          if (currentDeviceActive)
            _deviceTile()
          else
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: const Color(0xFF171D35),
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Text(
                'No active sessions.',
                style: TextStyle(color: Colors.white54, fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }

  Widget _deviceTile() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: _iconBox(Icons.computer_outlined),
        title: const Text(
          'Current Device',
          style: TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: const Text(
          'This device · Active now',
          style: TextStyle(color: Colors.white54, fontSize: 12),
        ),
        trailing: const Icon(Icons.chevron_right, color: Colors.white38),
        onTap: _deviceDetails,
      ),
    );
  }

  void _deviceDetails() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF171D35),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(22, 22, 22, 30),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Current Device',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'This device',
                style: TextStyle(color: Colors.white, fontSize: 14),
              ),
              const SizedBox(height: 5),
              const Text(
                'Active now',
                style: TextStyle(color: Colors.greenAccent, fontSize: 12),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () {
                    Navigator.pop(context);

                    setState(() {
                      currentDeviceActive = false;
                    });
                  },
                  child: const Text(
                    'Log Out',
                    style: TextStyle(color: Colors.redAccent),
                  ),
                ),
              ),
            ],
          ),
        );
      },
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
        ),
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
}
