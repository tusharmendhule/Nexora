import 'package:flutter/material.dart';

/// Trust label model for Nexora content verification.
///
/// Labels map to five tiers defined by the Trust Score engine:
///   GREEN  — Verified and Authentic Content
///   BLUE   — AI Generated but Verified
///   PURPLE — Opinion, Satire, or Edited Content
///   ORANGE — Partially Verified / Needs Caution
///   RED    — Fake, Misleading, or False Content
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

  // ─── Static instances (Module 16 spec) ────────────────────────

  static const NexoraLabel verifiedAuthentic = NexoraLabel(
    code: 'verified_authentic',
    name: 'Verified and Authentic Content',
    color: Color(0xFF2ECC71),
    explanation:
        'This content has been independently verified as authentic and accurate.',
  );

  static const NexoraLabel aiGeneratedVerified = NexoraLabel(
    code: 'ai_generated_verified',
    name: 'AI Generated but Verified',
    color: Color(0xFF3498DB),
    explanation:
        'This content was generated with AI tools, but its claims and sources have been verified.',
  );

  static const NexoraLabel editedContent = NexoraLabel(
    code: 'edited_content',
    name: 'Opinion, Satire, or Edited Content',
    color: Color(0xFF8E44AD),
    explanation:
        'This content is opinion, satire, or has been digitally edited. It may not represent factual claims.',
  );

  static const NexoraLabel disputedNeedsContext = NexoraLabel(
    code: 'disputed_needs_context',
    name: 'Partially Verified / Needs Caution',
    color: Color(0xFFF39C12),
    explanation:
        'This content is partially verified or has conflicting evidence. Additional context is recommended before sharing.',
  );

  static const NexoraLabel falseOrMisleading = NexoraLabel(
    code: 'false_or_misleading',
    name: 'Fake, Misleading, or False Content',
    color: Color(0xFFE74C3C),
    explanation:
        'This content has been determined to be fake, misleading, or materially false. Exercise extreme caution.',
  );

  // ─── From code ────────────────────────────────────────────────

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

  // ─── From backend TrustScore label ─────────────────────────────
  /// Map a backend TrustScore `label` string (Green, Blue, Purple, Orange, Red)
  /// to the corresponding [NexoraLabel].
  static NexoraLabel fromBackendLabel(String? label, {String? explanation}) {
    final base = switch (label) {
      'Green' => verifiedAuthentic,
      'Blue' => aiGeneratedVerified,
      'Purple' => editedContent,
      'Orange' => disputedNeedsContext,
      'Red' => falseOrMisleading,
      _ => disputedNeedsContext,
    };

    // If the backend provided a richer explanation, use it
    if (explanation != null && explanation.isNotEmpty) {
      return NexoraLabel(
        code: base.code,
        name: base.name,
        color: base.color,
        explanation: explanation,
      );
    }

    return base;
  }

  // ─── From JSON ────────────────────────────────────────────────

  factory NexoraLabel.fromJson(Map<String, dynamic> json) {
    return NexoraLabel.fromCode(
      json['labelCode'] as String? ?? 'disputed_needs_context',
    );
  }
}
