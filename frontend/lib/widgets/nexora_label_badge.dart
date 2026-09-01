import 'package:flutter/material.dart';

import '../models/nexora_label.dart';

class NexoraLabelBadge extends StatelessWidget {
  final NexoraLabel label;
  final bool showName;
  final VoidCallback? onTap;

  const NexoraLabelBadge({
    super.key,
    required this.label,
    this.showName = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final badge = Container(
      padding: EdgeInsets.symmetric(horizontal: showName ? 10 : 6, vertical: 6),
      decoration: BoxDecoration(
        color: label.color.withOpacity(0.16),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: label.color.withOpacity(0.55), width: 1),
        boxShadow: [
          BoxShadow(
            color: label.color.withOpacity(0.22),
            blurRadius: 8,
            spreadRadius: 0.5,
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
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
    );

    if (onTap == null) {
      return badge;
    }

    return GestureDetector(onTap: onTap, child: badge);
  }
}
