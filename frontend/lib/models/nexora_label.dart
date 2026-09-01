import 'package:flutter/material.dart';

class NexoraLabel {
  final String code;
  final String name;
  final Color color;
  final String explanation;

  const NexoraLabel({
    required this.code,
    required this.name,
    required this.color,
    required this.explanation,
  });

  static const NexoraLabel verifiedAuthentic = NexoraLabel(
    code: 'verified_authentic',
    name: 'Verified & Authentic',
    color: Color(0xFF2ECC71),
    explanation: 'This content has been verified as authentic.',
  );

  static const NexoraLabel aiGeneratedVerified = NexoraLabel(
    code: 'ai_generated_verified',
    name: 'AI-Generated but Verified',
    color: Color(0xFF3498DB),
    explanation:
        'This content was generated with AI and its origin has been verified.',
  );

  static const NexoraLabel editedContent = NexoraLabel(
    code: 'edited_content',
    name: 'Edited Content',
    color: Color(0xFF8E44AD),
    explanation:
        'This content has been digitally modified from an existing artwork.',
  );

  static const NexoraLabel disputedNeedsContext = NexoraLabel(
    code: 'disputed_needs_context',
    name: 'Disputed / Needs Context',
    color: Color(0xFFF39C12),
    explanation: 'This content has been disputed or requires additional context before it can be considered reliable.',
  );

  static const NexoraLabel falseOrMisleading = NexoraLabel(
    code: 'false_or_misleading',
    name: 'False or Misleading',
    color: Color(0xFFE74C3C),
    explanation: 'This content has been determined to be false or materially misleading.',
  );
  static NexoraLabel fromCode(String code) {
    switch (code) {
      case 'verified_authentic':
        return NexoraLabel.verifiedAuthentic;

      case 'ai_generated_verified':
        return NexoraLabel.aiGeneratedVerified;

      case 'edited_content':
        return NexoraLabel.editedContent;

      case 'disputed_needs_context':
        return NexoraLabel.disputedNeedsContext;

      case 'false_or_misleading':
        return NexoraLabel.falseOrMisleading;

      default:
        return NexoraLabel.disputedNeedsContext;
    }
  }

  factory NexoraLabel.fromJson(Map<String, dynamic> json) {
    return NexoraLabel.fromCode(
      json['labelCode'] as String? ?? 'disputed_needs_context',
    );
  }
}
