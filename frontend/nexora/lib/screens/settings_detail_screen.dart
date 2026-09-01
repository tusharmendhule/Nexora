import 'package:flutter/material.dart';

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
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
        children: [
          if (description != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 20),
              child: Text(
                description!,
                style: const TextStyle(
                  color: Colors.white54,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
            ),
          ],

          for (final section in sections) ...[
            _sectionTitle(section.title),
            _sectionCard(section.items),
            const SizedBox(height: 24),
          ],
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
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

  Widget _sectionCard(List<SettingsItem> items) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        children: [
          for (int i = 0; i < items.length; i++) ...[
            _item(items[i]),
            if (i < items.length - 1)
              Padding(
                padding: const EdgeInsets.only(left: 70),
                child: Divider(
                  height: 1,
                  color: Colors.white.withValues(alpha: 0.05),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _item(SettingsItem item) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
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
        child: Icon(item.icon, color: Colors.white, size: 21),
      ),
      title: Text(
        item.title,
        style: const TextStyle(
          color: Colors.white,
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
                style: const TextStyle(color: Colors.white54, fontSize: 11.5),
              ),
            ),
      trailing: _trailing(item),
      onTap: item.onTap,
    );
  }

  Widget? _trailing(SettingsItem item) {
    switch (item.type) {
      case SettingsItemType.navigation:
        return const Icon(Icons.chevron_right, color: Colors.white38);

      case SettingsItemType.toggle:
        return Switch(
          value: item.value ?? false,
          onChanged: item.onChanged,
          activeThumbColor: Colors.white,
          activeTrackColor: const Color(0xFF6C63FF),
          inactiveThumbColor: Colors.white54,
          inactiveTrackColor: Colors.white12,
        );

      case SettingsItemType.selection:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (item.valueText != null)
              Text(
                item.valueText!,
                style: const TextStyle(color: Colors.white54, fontSize: 12),
              ),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right, color: Colors.white38),
          ],
        );

      case SettingsItemType.action:
        return const Icon(Icons.chevron_right, color: Colors.white38);
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
