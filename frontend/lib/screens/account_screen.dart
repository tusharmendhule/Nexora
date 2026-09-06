import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../l10n/translations.dart';

import '../services/appearance_controller.dart';

import '../services/auth_service.dart';
import '../services/download_helper.dart';
import '../services/user_service.dart';
import '../models/user.dart';
import 'login_screen.dart';
import 'main_nav.dart';
import 'settings_detail_screen.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final UserService _userService = UserService();

  User? _user;
  bool _loading = true;

  List<Map<String, String>> _savedAccounts = [];
  List<Map<String, dynamic>> _history = [];
  bool _historyLoaded = false;

  bool _exporting = false;
  bool _deactivating = false;
  bool _deleting = false;

  // ─── Derived display values (real data only) ──────────

  String get _name {
    final user = _user;
    if (user == null) return '';
    final name = user.displayName;
    if (name != null && name.isNotEmpty) return name;
    return user.username;
  }
  String get _username {
    final user = _user;
    final username = user?.username;
    if (username == null || username.isEmpty) return '';
    return '@$username';
  }
  String get _email {
    final email = _user?.email;
    if (email == null || email.isEmpty) return tr(context, 'No email');
    return email;
  }
  String get _phone {
    final phone = _user?.phone;
    if (phone == null || phone.isEmpty) return '';
    return phone;
  }
  bool get _hasPhone => _phone.isNotEmpty;
  String get _accountStatus => _user?.accountStatus ?? 'active';

  int get _accountCount =>
      _savedAccounts.isEmpty ? 1 : _savedAccounts.length;

  String get _historyCountText {
    if (!_historyLoaded) return tr(context, 'Loading…');
    final n = _history.length;
    return n == 1
        ? tr(context, '1 recorded change')
        : trP(context, '{0} recorded changes', ['$n']);
  }

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final userFuture = _userService.getMyProfile();
    final accountsFuture = AuthService().getSavedAccounts();
    final historyFuture = _userService.getAccountHistory();

    final user = await userFuture;
    final accounts = await accountsFuture;
    final history = await historyFuture;

    if (!mounted) return;

    setState(() {
      _user = user;
      _savedAccounts = accounts;
      _history = history;
      _historyLoaded = true;
      _loading = false;
    });
  }

  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.redAccent : null,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

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
        _loadData();
      }
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
          tr(context, 'Account'),
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
          _profileHeader(),

          SizedBox(height: 28),

          _sectionTitle(tr(context, 'Account Information')),

          _tile(
            icon: Icons.person_outline,
            title: tr(context, 'Personal Information'),
            subtitle:
                tr(context, 'Manage your name, username and profile details'),
            onTap: () {
              _open(
                context,
                title: tr(context, 'Personal Information'),
                description: tr(context,
                    'Manage the personal information associated with your account.'),
                sections: [
                  SettingsSection(
                    title: tr(context, 'Personal Information'),
                    items: [
                      SettingsItem(
                        icon: Icons.badge_outlined,
                        title: tr(context, 'Name'),
                        subtitle: _name,
                        type: SettingsItemType.navigation,
                        onTap: () => _editName(context),
                      ),
                      SettingsItem(
                        icon: Icons.alternate_email,
                        title: tr(context, 'Username'),
                        subtitle: _username,
                        type: SettingsItemType.navigation,
                        onTap: () => _editUsername(context),
                      ),
                      SettingsItem(
                        icon: Icons.person_outline,
                        title: tr(context, 'Profile Details'),
                        subtitle: tr(context, 'Manage your profile information'),
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
            title: tr(context, 'Email Address'),
            subtitle: _email,
            onTap: () => _emailScreen(context),
          ),

          _tile(
            icon: Icons.phone_outlined,
            title: tr(context, 'Phone Number'),
            subtitle: _hasPhone ? _phone : tr(context, 'Not added'),
            onTap: () => _phoneScreen(context),
          ),

          SizedBox(height: 24),

          _sectionTitle(tr(context, 'Account Management')),

          _tile(
            icon: Icons.person_add_alt_1_outlined,
            title: tr(context, 'Switch Account'),
            subtitle: _accountCount == 1
                ? tr(context, '1 account')
                : trP(context, '{0} accounts', ['$_accountCount']),
            onTap: () => _switchAccount(context),
          ),

          _tile(
            icon: Icons.download_outlined,
            title: tr(context, 'Download Your Information'),
            subtitle: tr(context, 'Get a copy of your account information'),
            onTap: () => _downloadInformation(context),
          ),

          _tile(
            icon: Icons.history_outlined,
            title: tr(context, 'Account History'),
            subtitle: _historyCountText,
            onTap: () => _accountHistory(context),
          ),

          SizedBox(height: 24),

          _sectionTitle(tr(context, 'Account Status')),

          _statusCard(),

          SizedBox(height: 24),

          _sectionTitle(tr(context, 'Danger Zone')),

          _dangerTile(
            icon: Icons.pause_circle_outline,
            title: tr(context, 'Deactivate Account'),
            subtitle: tr(context, 'Temporarily hide your Nexora account'),
            onTap: _deactivating ? null : () => _showDeactivateDialog(context),
          ),

          _dangerTile(
            icon: Icons.delete_outline,
            title: tr(context, 'Delete Account'),
            subtitle: tr(context, 'Permanently delete your Nexora account'),
            onTap: _deleting ? null : () => _showDeleteDialog(context),
          ),

          SizedBox(height: 24),

          _sectionTitle('Session'),

          _dangerTile(
            icon: Icons.logout,
            title: tr(context, 'Log Out'),
            subtitle: tr(context, 'Sign out of your Nexora account'),
            onTap: () => _showLogoutDialog(context),
          ),

          SizedBox(height: 30),

          Center(
            child: Text(
              tr(context, 'Manage your Nexora account.'),
              style: TextStyle(
                color: context.nexora.textPrimary.withOpacity(0.35),
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Personal Information ─────────────────────────────

  void _editName(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _InputScreen(
          title: tr(context, 'Name'),
          description: tr(context, 'Update your display name.'),
          label: tr(context, 'Display Name'),
          initialValue: _name,
          onSave: (value, _) async {
            final name = value.trim();
            if (name.isEmpty) return tr(context, 'Enter a display name');

            final updated = await _userService.updateMyProfile(name: name);
            if (updated == null) {
              return tr(context,
                  'Could not update your name. Please try again.');
            }
            await _loadData();
            return null;
          },
        ),
      ),
    );
  }

  void _editUsername(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _InputScreen(
          title: tr(context, 'Username'),
          description: tr(context, 'Update your Nexora username.'),
          label: tr(context, 'Username'),
          initialValue: _user?.username ?? '',
          onSave: (value, _) async {
            var username = value.trim().replaceFirst('@', '');
            if (username.isEmpty) return tr(context, 'Enter a username');

            final updated =
                await _userService.updateMyProfile(username: username);
            if (updated == null) {
              return tr(
                  context, 'Username is already taken or could not be updated.');
            }
            await _loadData();
            return null;
          },
        ),
      ),
    );
  }

  void _profileDetails(BuildContext context) {
    _open(
      context,
      title: tr(context, 'Profile Details'),
      description:
          tr(context, 'Manage the information displayed on your profile.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Profile'),
          items: [
            SettingsItem(
              icon: Icons.person_outline,
              title: tr(context, 'Name'),
              subtitle: _name,
              type: SettingsItemType.action,
              onTap: () => _editName(context),
            ),
            SettingsItem(
              icon: Icons.alternate_email,
              title: tr(context, 'Username'),
              subtitle: _username,
              type: SettingsItemType.action,
              onTap: () => _editUsername(context),
            ),
          ],
        ),
      ],
    );
  }

  // ─── Email Address ────────────────────────────────────

  void _emailScreen(BuildContext context) {
    _open(
      context,
      title: tr(context, 'Email Address'),
      description: tr(context,
          'Manage the email address connected to your Nexora account.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Email'),
          items: [
            SettingsItem(
              icon: Icons.email_outlined,
              title: tr(context, 'Current Email'),
              subtitle: _email,
              type: SettingsItemType.navigation,
              onTap: () {
                _open(
                  context,
                  title: tr(context, 'Current Email'),
                  description: tr(context,
                      'View the email currently connected to your account.'),
                  sections: [
                    SettingsSection(
                      title: tr(context, 'Current Email'),
                      items: [
                        SettingsItem(
                          icon: Icons.email_outlined,
                          title: tr(context, 'Email Address'),
                          subtitle: _email,
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
              title: tr(context, 'Change Email'),
              subtitle: tr(context, 'Update your connected email address'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => _InputScreen(
                      title: tr(context, 'Change Email'),
                      description: '${tr(context,
                          'Update the email address connected to your account.')} '
                          '${tr(context, 'Enter your current password to confirm.')}',
                      label: tr(context, 'New Email Address'),
                      initialValue: '',
                      keyboardType: TextInputType.emailAddress,
                      secondaryLabel: tr(context, 'Current Password'),
                      secondaryObscure: true,
                      onSave: (value, secondaryValue) async {
                        final newEmail = value.trim();
                        if (newEmail.isEmpty) {
                          return tr(context, 'Enter your new email address');
                        }

                        final error = await _userService.updateEmail(
                          newEmail: newEmail,
                          currentPassword: secondaryValue,
                        );
                        if (error != null) return error;
                        await _loadData();
                        return null;
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

  // ─── Phone Number ─────────────────────────────────────

  void _phoneScreen(BuildContext context) {
    _open(
      context,
      title: tr(context, 'Phone Number'),
      description: tr(context,
          'Manage the phone number connected to your Nexora account.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Phone'),
          items: [
            SettingsItem(
              icon: Icons.phone_outlined,
              title: tr(context, 'Phone Number'),
              subtitle: _hasPhone ? _phone : tr(context, 'Not added'),
              type: SettingsItemType.navigation,
              onTap: () {
                _open(
                  context,
                  title: tr(context, 'Phone Number'),
                  description:
                      tr(context, 'Manage your connected phone number.'),
                  sections: [
                    SettingsSection(
                      title: tr(context, 'Current Number'),
                      items: [
                        SettingsItem(
                          icon: Icons.phone_outlined,
                          title: tr(context, 'Phone Number'),
                          subtitle: _hasPhone ? _phone : tr(context, 'Not added'),
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
              title: _hasPhone
                  ? tr(context, 'Change Phone Number')
                  : tr(context, 'Add Phone Number'),
              subtitle: _hasPhone
                  ? tr(context, 'Update your connected phone number')
                  : tr(context, 'Connect a phone number to your account'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => _InputScreen(
                      title: _hasPhone
                          ? tr(context, 'Change Phone Number')
                          : tr(context, 'Add Phone Number'),
                      description: tr(
                          context, 'Connect a phone number to your Nexora account.'),
                      label: tr(context, 'Phone Number'),
                      initialValue: _phone,
                      keyboardType: TextInputType.phone,
                      onSave: (value, _) async {
                        if (value.trim().isEmpty) {
                          return tr(context, 'Enter a phone number');
                        }
                        final error = await _userService.updatePhone(value);
                        if (error != null) return error;
                        await _loadData();
                        return null;
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

  // ─── Switch Account ───────────────────────────────────

  Future<void> _performSwitch(BuildContext context, String username) async {
    final result = await AuthService().switchToAccount(username);
    if (!mounted) return;

    if (result == 'switched') {
      // Fresh MainNavigation so every tab reloads under the new session
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const MainNavigation()),
        (route) => false,
      );
      _showSnack(trP(context, 'Switched to @{0}', [username]));
    } else if (result == 'needs-login') {
      Navigator.of(context).popUntil((route) => route.isFirst);
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => LoginScreen(initialUsername: username),
        ),
        (route) => false,
      );
    } else {
      _showSnack(tr(context, 'Could not switch accounts. Please try again.'),
          isError: true);
    }
  }

  void _switchAccount(BuildContext context) {
    final currentUsername = _user?.username ?? '';

    _open(
      context,
      title: tr(context, 'Switch Account'),
      description: tr(context, 'Switch between your Nexora accounts.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Your Accounts'),
          items: [
            for (final account in _savedAccounts)
              SettingsItem(
                icon: Icons.person_outline,
                title: account['name'] ?? account['username'] ?? '',
                subtitle: '@${account['username'] ?? ''}',
                type: SettingsItemType.selection,
                valueText: account['username'] == currentUsername
                    ? tr(context, 'Current')
                    : tr(context, 'Switch'),
                onTap: account['username'] == currentUsername
                    ? () {}
                    : () => _performSwitch(context, account['username']!),
              ),

            if (_savedAccounts.isEmpty)
              SettingsItem(
                icon: Icons.person_outline,
                title: _name.isEmpty ? tr(context, 'Current Account') : _name,
                subtitle: _username,
                type: SettingsItemType.selection,
                valueText: tr(context, 'Current'),
                onTap: () {},
              ),

            SettingsItem(
              icon: Icons.add_circle_outline,
              title: tr(context, 'Add Account'),
              subtitle: tr(context, 'Sign in with another Nexora account'),
              type: SettingsItemType.navigation,
              onTap: () {
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                  (route) => false,
                );
              },
            ),
          ],
        ),
      ],
    );
  }

  // ─── Download Your Information ────────────────────────

  Future<void> _performExport(BuildContext context) async {
    if (_exporting) return;
    setState(() => _exporting = true);

    try {
      final export = await _userService.exportAccountData();
      if (!mounted) return;

      if (export == null) {
        _showSnack(
            tr(context, 'Could not generate your information. Please try again.'),
            isError: true);
        return;
      }

      final filename = export['filename'] as String? ?? 'nexora-export.json';
      final data = export['data'] as Map<String, dynamic>? ?? const {};
      final content = const JsonEncoder.withIndent('  ').convert(data);

      final savedPath = await saveJsonDownload(filename, content);
      if (!mounted) return;

      _showSnack(trP(context, 'Downloaded: {0}', [savedPath]));
      await _loadData();
    } finally {
      if (mounted) {
        setState(() => _exporting = false);
      }
    }
  }

  void _downloadInformation(BuildContext context) {
    _open(
      context,
      title: tr(context, 'Download Your Information'),
      description: tr(context,
          'Get a copy of the information associated with your Nexora account.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Your Information'),
          items: [
            SettingsItem(
              icon: Icons.description_outlined,
              title: tr(context, 'Account Information'),
              subtitle:
                  tr(context, 'View information associated with your account'),
              type: SettingsItemType.navigation,
              onTap: () {
                _open(
                  context,
                  title: tr(context, 'Account Information'),
                  description: tr(context,
                      'Information currently associated with your account.'),
                  sections: [
                    SettingsSection(
                      title: tr(context, 'Information'),
                      items: [
                        SettingsItem(
                          icon: Icons.person_outline,
                          title: tr(context, 'Profile'),
                          subtitle:
                              '${_name.isEmpty ? _username : _name}'
                              '${_username.isNotEmpty ? ' · $_username' : ''}',
                          type: SettingsItemType.action,
                          onTap: () {},
                        ),
                        SettingsItem(
                          icon: Icons.email_outlined,
                          title: tr(context, 'Email'),
                          subtitle: _email,
                          type: SettingsItemType.action,
                          onTap: () {},
                        ),
                        SettingsItem(
                          icon: Icons.phone_outlined,
                          title: tr(context, 'Phone'),
                          subtitle: _hasPhone ? _phone : tr(context, 'Not added'),
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
              title: tr(context, 'Request Information'),
              subtitle: _exporting
                  ? tr(context, 'Generating your file…')
                  : tr(context, 'Download a copy of your information'),
              type: SettingsItemType.navigation,
              onTap: () => _performExport(context),
            ),
          ],
        ),
      ],
    );
  }

  // ─── Account History ──────────────────────────────────

  static const Map<String, String> _historyLabels = {
    'PROFILE_UPDATED': 'Profile updated',
    'AVATAR_CHANGED': 'Profile picture changed',
    'USERNAME_CHANGED': 'Username changed',
    'EMAIL_CHANGED': 'Email address changed',
    'PHONE_CHANGED': 'Phone number changed',
    'ACCOUNT_DEACTIVATED': 'Account deactivated',
    'ACCOUNT_REACTIVATED': 'Account reactivated',
    'ACCOUNT_DELETED': 'Account deleted',
    'DATA_EXPORT_REQUESTED': 'Information download requested',
    'PRIVACY_TOGGLED': 'Privacy setting changed',
    'ACCOUNT_DISABLED': 'Account disabled',
    'ACCOUNT_ENABLED': 'Account enabled',
  };

  static String _formatHistoryDate(DateTime date) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final h = date.hour.toString().padLeft(2, '0');
    final m = date.minute.toString().padLeft(2, '0');
    return '${months[date.month - 1]} ${date.day}, ${date.year} · $h:$m';
  }

  void _accountHistory(BuildContext context) {
    if (!_historyLoaded) {
      _loadData();
    }

    _open(
      context,
      title: tr(context, 'Account History'),
      description:
          tr(context, 'View important changes made to your Nexora account.'),
      sections: [
        SettingsSection(
          title: tr(context, 'Account Changes'),
          items: _history.isEmpty
              ? [
                  SettingsItem(
                    icon: Icons.history_outlined,
                    title: tr(context, 'No Recent Changes'),
                    subtitle: tr(
                        context, 'Important account changes will appear here.'),
                    type: SettingsItemType.action,
                  ),
                ]
              : [
                  for (final record in _history)
                    SettingsItem(
                      icon: Icons.history_outlined,
                      title: tr(
                          context,
                          _historyLabels[record['eventType']] ??
                              (record['description']?.toString() ??
                                  'Account activity')),
                      subtitle: record['createdAt'] != null
                          ? _formatHistoryDate(
                              DateTime.tryParse(record['createdAt'].toString()) ??
                                  DateTime.now(),
                            )
                          : tr(context, 'Account activity'),
                      type: SettingsItemType.action,
                    ),
                ],
        ),
      ],
    );
  }

  // ─── Status / Deactivate / Reactivate ─────────────────

  Future<void> _showDeactivateDialog(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: context.nexora.card,
        title: Text(
          tr(context, 'Deactivate Account?'),
          style: TextStyle(color: context.nexora.textPrimary),
        ),
        content: Text(
          '${tr(context, 'Your account will be temporarily hidden.')}\n'
          '${tr(context, 'You can return to Nexora later.')}',
          style: TextStyle(color: context.nexora.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              tr(context, 'Cancel'),
              style: TextStyle(color: context.nexora.textSecondary),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              tr(context, 'Deactivate'),
              style: TextStyle(color: Colors.redAccent),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _deactivating = true);
    final error = await _userService.deactivateAccount();
    setState(() => _deactivating = false);

    if (!mounted) return;

    if (error != null) {
      _showSnack(error, isError: true);
      return;
    }

    await _loadData();
    _showSnack(tr(context, 'Your account has been deactivated'));
  }

  Future<void> _showReactivateDialog(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: context.nexora.card,
        title: Text(
          tr(context, 'Reactivate Account?'),
          style: TextStyle(color: context.nexora.textPrimary),
        ),
        content: Text(
          tr(context,
              'Welcome back! Your Nexora account and its content will be visible again.'),
          style: TextStyle(color: context.nexora.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              tr(context, 'Cancel'),
              style: TextStyle(color: context.nexora.textSecondary),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              tr(context, 'Reactivate'),
              style: TextStyle(color: Colors.greenAccent),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _deactivating = true);
    final error = await _userService.reactivateAccount();
    setState(() => _deactivating = false);

    if (!mounted) return;

    if (error != null) {
      _showSnack(error, isError: true);
      return;
    }

    await _loadData();
    _showSnack(tr(context, 'Your account has been reactivated'));
  }

  // ─── Delete Account ───────────────────────────────────

  Future<void> _showDeleteDialog(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: context.nexora.card,
        title: Text(
          tr(context, 'Delete Account?'),
          style: TextStyle(color: context.nexora.textPrimary),
        ),
        content: Text(
          tr(context,
              'This action is permanent. Your Nexora account and its associated information will be deleted.'),
          style: TextStyle(color: context.nexora.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              tr(context, 'Cancel'),
              style: TextStyle(color: context.nexora.textSecondary),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              tr(context, 'Delete'),
              style: TextStyle(color: Colors.redAccent),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _deleting = true);
    final error = await _userService.deleteUser();
    if (!mounted) return;

    if (error != null) {
      setState(() => _deleting = false);
      _showSnack(error, isError: true);
      return;
    }

    // Account deleted — clear the session and return to the auth screen
    await AuthService().logout();
    if (!mounted) return;

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  // ─── Log Out ──────────────────────────────────────────

  Future<void> _showLogoutDialog(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: context.nexora.card,
        title: Text(
          tr(context, 'Log Out?'),
          style: TextStyle(color: context.nexora.textPrimary),
        ),
        content: Text(
          tr(context, 'You will be signed out of your Nexora account.'),
          style: TextStyle(color: context.nexora.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              tr(context, 'Cancel'),
              style: TextStyle(color: context.nexora.textSecondary),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              tr(context, 'Log Out'),
              style: TextStyle(color: Colors.redAccent),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    final authService = AuthService();
    await authService.logout();
    if (!mounted) return;

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  // ─── Widgets ──────────────────────────────────────────

  Widget _profileHeader() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.nexora.textPrimary.withOpacity(0.06)),
      ),
      child: Row(
        children: [
          _profileAvatar(),
          SizedBox(width: 15),
          Expanded(
            child: Builder(
              builder: (_) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _loading ? '' : _name,
                    style: TextStyle(
                      color: context.nexora.textPrimary,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    _loading ? '' : _username,
                    style: TextStyle(color: context.nexora.textMuted, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 62×62 circular avatar: shows the real profile picture when one is set,
  /// otherwise the original gradient circle with the person icon.
  Widget _profileAvatar() {
    final avatarUrl = _user?.profileImageUrl;
    final hasImage = avatarUrl != null && avatarUrl.isNotEmpty;

    if (!hasImage) {
      return Container(
        width: 62,
        height: 62,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(
            colors: nexoraGradient(),
          ),
        ),
        child: Icon(Icons.person, color: Colors.white, size: 31),
      );
    }

    return Container(
      width: 62,
      height: 62,
      padding: const EdgeInsets.all(2.5),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: nexoraGradient(),
        ),
      ),
      child: ClipOval(
        child: kIsWeb || avatarUrl.startsWith('http')
            ? Image.network(
                avatarUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _avatarImageFallback(),
              )
            : _avatarImageFallback(),
      ),
    );
  }

  /// Fallback shown if the profile image fails to load.
  Widget _avatarImageFallback() {
    return ColoredBox(
      color: context.nexora.card,
      child: Center(
        child: Icon(
          Icons.person,
          color: context.nexora.textSecondary,
          size: 31,
        ),
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

  Widget _iconBox(IconData icon) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        gradient: LinearGradient(
          colors: nexoraGradient(),
        ),
      ),
      child: Icon(icon, color: Colors.white, size: 21),
    );
  }

  Widget _statusCard() {
    final bool isActive = _accountStatus == 'active';
    final bool isDeactivated = _accountStatus == 'deactivated';

    final Color iconColor = isDeactivated
        ? Colors.amber
        : isActive
            ? Colors.greenAccent
            : Colors.redAccent;
    final IconData icon = isDeactivated
        ? Icons.pause_circle_outline
        : isActive
            ? Icons.verified_outlined
            : Icons.gpp_bad_outlined;
    final String title = isDeactivated
        ? tr(context, 'Account deactivated')
        : isActive
            ? tr(context, 'Account active')
            : trP(context, 'Account {0}', [tr(context, _accountStatus)]);
    final String subtitle = isDeactivated
        ? tr(context, 'Your account is temporarily hidden. Tap to reactivate.')
        : isActive
            ? tr(context, 'Your account is in good standing.')
            : trP(context, 'Your account is currently {0}.',
                [tr(context, _accountStatus)]);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor, size: 28),
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
                  style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          if (isDeactivated)
            TextButton(
              onPressed:
                  _deactivating ? null : () => _showReactivateDialog(context),
              child: Text(
                _deactivating
                    ? tr(context, 'Reactivating…')
                    : tr(context, 'Reactivate'),
                style: TextStyle(color: Colors.greenAccent, fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }

  Widget _dangerTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback? onTap,
  }) {
    return Container(
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
          child: Icon(icon, color: Colors.redAccent.withOpacity(0.85)),
        ),
        title: Text(
          title,
          style: TextStyle(
            color: Colors.redAccent,
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

class _InputScreen extends StatefulWidget {
  final String title;
  final String description;
  final String label;
  final String initialValue;
  final TextInputType? keyboardType;

  /// Optional second field (e.g. current password for email changes).
  final String? secondaryLabel;
  final bool secondaryObscure;

  /// Returns an error message on failure, or null on success.
  final Future<String?> Function(String value, String? secondaryValue) onSave;

  const _InputScreen({
    required this.title,
    required this.description,
    required this.label,
    required this.initialValue,
    this.keyboardType,
    this.secondaryLabel,
    this.secondaryObscure = false,
    required this.onSave,
  });

  @override
  State<_InputScreen> createState() => _InputScreenState();
}

class _InputScreenState extends State<_InputScreen> {
  late final TextEditingController _controller;
  final TextEditingController _secondaryController = TextEditingController();

  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _controller.dispose();
    _secondaryController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);

    final error = await widget.onSave(
      _controller.text,
      widget.secondaryLabel != null ? _secondaryController.text : null,
    );

    if (!mounted) return;

    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error),
          backgroundColor: Colors.redAccent,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      setState(() => _saving = false);
      return;
    }

    Navigator.pop(context);
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
          widget.title,
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 15, 18, 30),
        children: [
          Text(
            widget.description,
            style: TextStyle(
              color: context.nexora.textMuted,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          SizedBox(height: 25),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: context.nexora.card,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: _controller,
                  keyboardType: widget.keyboardType,
                  style:
                      TextStyle(color: context.nexora.textPrimary, fontSize: 15),
                  decoration: InputDecoration(
                    labelText: widget.label,
                    labelStyle: TextStyle(color: context.nexora.textMuted),
                    enabledBorder: UnderlineInputBorder(
                      borderSide: BorderSide(color: context.nexora.textDim),
                    ),
                    focusedBorder: const UnderlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF7C3AED)),
                    ),
                  ),
                ),
                if (widget.secondaryLabel != null) ...[
                  SizedBox(height: 18),
                  TextField(
                    controller: _secondaryController,
                    obscureText: widget.secondaryObscure,
                    style: TextStyle(
                        color: context.nexora.textPrimary, fontSize: 15),
                    decoration: InputDecoration(
                      labelText: widget.secondaryLabel,
                      labelStyle: TextStyle(color: context.nexora.textMuted),
                      enabledBorder: UnderlineInputBorder(
                        borderSide: BorderSide(color: context.nexora.textDim),
                      ),
                      focusedBorder: const UnderlineInputBorder(
                        borderSide: BorderSide(color: Color(0xFF7C3AED)),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          SizedBox(height: 22),
          SizedBox(
            height: 52,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.all(Radius.circular(16)),
                gradient: LinearGradient(
                  colors: nexoraGradient(),
                ),
              ),
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                ),
                onPressed: _saving ? null : _save,
                child: _saving
                    ? SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2.5,
                        ),
                      )                      : Text(
                        tr(context, 'Save'),
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