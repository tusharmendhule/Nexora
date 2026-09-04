import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../services/appearance_controller.dart';

class SettingsDetailScreen extends StatelessWidget {
  final String title;
  final String? description;
  final List<SettingsSection> sections;

  const SettingsDetailScreen({
    super.key,
    required this.title,
    this.description,
    required this.sections,
  });

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
          title,
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
          if (description != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 20),
              child: Text(
                description!,
                style: TextStyle(
                  color: context.nexora.textMuted,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
            ),
          ],

          for (final section in sections) ...[
            _sectionTitle(context, section.title),
            _sectionCard(context, section.items),
            const SizedBox(height: 24),
          ],
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

  Widget _sectionCard(BuildContext context, List<SettingsItem> items) {
    return Container(
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.nexora.textPrimary.withValues(alpha: 0.05)),
      ),
      child: Column(
        children: [
          for (int i = 0; i < items.length; i++) ...[
            _item(context, items[i]),
            if (i < items.length - 1)
              Padding(
                padding: const EdgeInsets.only(left: 70),
                child: Divider(
                  height: 1,
                  color: context.nexora.textPrimary.withValues(alpha: 0.05),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _item(BuildContext context, SettingsItem item) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
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
        child: Icon(item.icon, color: Colors.white, size: 21),
      ),
      title: Text(
        item.title,
        style: TextStyle(
          color: context.nexora.textPrimary,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: item.subtitle == null
          ? null
          : Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                item.subtitle!,
                style: TextStyle(color: context.nexora.textMuted, fontSize: 11.5),
              ),
            ),
      trailing: _trailing(context, item),
      onTap: item.onTap,
    );
  }

  Widget? _trailing(BuildContext context, SettingsItem item) {
    switch (item.type) {
      case SettingsItemType.navigation:
        return Icon(Icons.chevron_right, color: context.nexora.textHint);

      case SettingsItemType.toggle:
        return Switch(
          value: item.value ?? false,
          onChanged: item.onChanged,
          activeThumbColor: Colors.white,
          activeTrackColor: const Color(0xFF6C63FF),
          inactiveThumbColor: context.nexora.textMuted,
          inactiveTrackColor: context.nexora.surfaceSubtle,
        );

      case SettingsItemType.selection:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (item.valueText != null)
              Text(
                item.valueText!,
                style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
              ),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, color: context.nexora.textHint),
          ],
        );

      case SettingsItemType.action:
        return Icon(Icons.chevron_right, color: context.nexora.textHint);
    }
  }
}

enum SettingsItemType { navigation, toggle, selection, action }

class SettingsItem {
  final IconData icon;
  final String title;
  final String? subtitle;
  final SettingsItemType type;

  final bool? value;
  final ValueChanged<bool>? onChanged;

  final String? valueText;
  final VoidCallback? onTap;

  const SettingsItem({
    required this.icon,
    required this.title,
    this.subtitle,
    this.type = SettingsItemType.navigation,
    this.value,
    this.onChanged,
    this.valueText,
    this.onTap,
  });
}

class SettingsSection {
  final String title;
  final List<SettingsItem> items;

  const SettingsSection({required this.title, required this.items});
}
