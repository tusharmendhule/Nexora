import 'package:flutter/material.dart';

import '../models/nexora_label.dart';

/// Badge widget that displays a Nexora trust label.
///
/// Accessibility requirements (Module 16):
///   - Color is NEVER the only information shown — label name is always visible.
///   - Semantics wraps the badge for screen readers.
///   - Tooltip shows the explanation on long-press.
class NexoraLabelBadge extends StatelessWidget {
  final NexoraLabel label;
  final bool showName;
  final bool showExplanation;
  final VoidCallback? onTap;

  const NexoraLabelBadge({
    super.key,
    required this.label,
    this.showName = true,
    this.showExplanation = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // Screen reader text always includes the label name, even when
    // the visual badge hides it (showName=false).
    final semanticsLabel =
        '${label.name}. Trust score label: ${label.explanation}';

    final badge = Tooltip(
      message: showExplanation ? label.explanation : label.name,
      preferBelow: false,
      waitDuration: const Duration(milliseconds: 400),
      child: Semantics(
        label: semanticsLabel,
        button: onTap != null,
        child: Container(
          padding: EdgeInsets.symmetric(
            horizontal: showName ? 10 : 6,
            vertical: 6,
          ),
          decoration: BoxDecoration(
          color: label.color.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: label.color.withValues(alpha: 0.55),
            width: 1,
          ),
          boxShadow: [
            BoxShadow(
              color: label.color.withValues(alpha: 0.22),
                blurRadius: 8,
                spreadRadius: 0.5,
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Color dot — never the only indicator
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: label.color,
                ),
              ),

              if (showName) ...[
                const SizedBox(width: 7),
                Text(
                  label.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );

    if (onTap == null) {
      return badge;
    }

    return GestureDetector(onTap: onTap, child: badge);
  }
}
