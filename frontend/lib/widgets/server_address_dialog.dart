import 'package:flutter/material.dart';

import '../config/api_config.dart';
import '../config/nexora_themes.dart';
import '../l10n/translations.dart';

/// Opens the Server address dialog, where the user can view or change the
/// host the app uses for all API + socket connections.
///
/// The value is persisted via [ApiConfig.saveServerHostOverride] and
/// survives restarts — no rebuild or `--dart-define=API_HOST` needed.
/// Leaving the field empty clears the override (build default applies).
Future<void> showServerAddressDialog(BuildContext context) async {
  final controller =
      TextEditingController(text: ApiConfig.configuredHost);

  final result = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: ctx.nexora.card,
      title: Text(
        tr(ctx, 'Server Address'),
        style: TextStyle(color: ctx.nexora.textPrimary, fontSize: 18),
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Host of the machine running the Nexora backend. Port '
            '${ApiConfig.port} is fixed.',
            style: TextStyle(color: ctx.nexora.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 8),
          Text(
            'Common values:\n'
            '• 127.0.0.1 — phone on USB via `adb reverse tcp:5000 tcp:5000`\n'
            '• 10.0.2.2 — Android emulator (the default)\n'
            '• your PC LAN IP — phone and PC on the same Wi-Fi',
            style: TextStyle(color: ctx.nexora.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 16),
          Container(
            decoration: BoxDecoration(
              color: ctx.nexora.card,
              borderRadius: BorderRadius.circular(12),
              border:
                  Border.all(color: ctx.nexora.textPrimary.withOpacity(0.08)),
            ),
            child: TextField(
              controller: controller,
              autocorrect: false,
              enableSuggestions: false,
              keyboardType: TextInputType.url,
              style: TextStyle(color: ctx.nexora.textPrimary, fontSize: 14),
              decoration: InputDecoration(
                hintText: tr(ctx, 'e.g. 127.0.0.1'),
                hintStyle:
                    TextStyle(color: ctx.nexora.textHint, fontSize: 13),
                prefixIcon: Icon(Icons.dns_outlined,
                    color: ctx.nexora.textPrimary.withOpacity(0.45), size: 21),
                border: InputBorder.none,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Leave empty to use the automatic address '
            '(Android emulator default or --dart-define=API_HOST).',
            style: TextStyle(color: ctx.nexora.textHint, fontSize: 11),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: Text(
            tr(ctx, 'Cancel'),
            style: TextStyle(color: ctx.nexora.textSecondary),
          ),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, controller.text),
          child: Text(
            tr(ctx, 'Save'),
            style: const TextStyle(color: Color(0xFF8B7CFF)),
          ),
        ),
      ],
    ),
  );

  if (result == null) return;

  final clean = ApiConfig.normalizeHostInput(result);
  await ApiConfig.saveServerHostOverride(clean);

  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(
        clean.isEmpty
            ? tr(context, 'Using the automatic server address')
            : trP(context, 'Server address set to {0}', [clean]),
      ),
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 2),
    ),
  );
}
