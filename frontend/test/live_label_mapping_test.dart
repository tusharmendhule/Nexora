// Live label-mapping verification (generated for the end-to-end Trust Score
// test run). Reads the REAL persisted backend labels produced by the live
// API run (live-results/live20-summary.json) and maps them through the REAL
// frontend mapping code (NexoraLabel.fromBackendLabel) — the exact function
// the app uses to render trust badges.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexora/models/nexora_label.dart';

void main() {
  test('map live persisted labels through the real frontend mapping', () {
    final file = File('../live-results/live20-summary.json');
    expect(file.existsSync(), isTrue,
        reason: 'live20-summary.json must exist (live run artifact)');

    final rows = jsonDecode(file.readAsStringSync()) as List<dynamic>;
    expect(rows.length, 20, reason: 'the live corpus contains 20 posts');

    for (final row in rows) {
      final r = row as Map<String, dynamic>;
      final label = NexoraLabel.fromBackendLabel(r['persistedLabel'] as String?);
      // ignore: avoid_print
      print('${r['id']} (${r['category']}): backend=${r['persistedLabel']} '
          '→ frontend="${label.name}" color=0x${label.color.value.toRadixString(16).toUpperCase()} '
          '(${label.code})');
      expect(label.code, isNot(''), reason: 'mapping must produce a label');
    }

    // The five-tier mapping itself (same code path, explicit assertions)
    final green = NexoraLabel.fromBackendLabel('Green');
    final blue = NexoraLabel.fromBackendLabel('Blue');
    final purple = NexoraLabel.fromBackendLabel('Purple');
    final orange = NexoraLabel.fromBackendLabel('Orange');
    final red = NexoraLabel.fromBackendLabel('Red');

    expect(green.code, 'verified_authentic');
    expect(green.color.value, 0xFF2ECC71);
    expect(blue.code, 'ai_generated_verified');
    expect(blue.color.value, 0xFF3498DB);
    expect(purple.code, 'edited_content');
    expect(purple.color.value, 0xFF8E44AD);
    expect(orange.code, 'disputed_needs_context');
    expect(orange.color.value, 0xFFF39C12);
    expect(red.code, 'false_or_misleading');
    expect(red.color.value, 0xFFE74C3C);
  });
}
