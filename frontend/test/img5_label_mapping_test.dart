// Frontend display check for the 5 IMAGE-band demo posts: maps the REAL
// persisted backend labels (live-results/img5-summary.json) through the app's
// actual NexoraLabel.fromBackendLabel code and asserts each band's display.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexora/models/nexora_label.dart';

void main() {
  test('5 image-band demo posts map to the correct frontend labels', () {
    final file = File('../live-results/img5-summary.json');
    expect(file.existsSync(), isTrue);
    final rows = (jsonDecode(file.readAsStringSync()) as List<dynamic>)
        .cast<Map<String, dynamic>>();
    expect(rows.length, 5);

    final expected = {
      'Green': ('verified_authentic', 'Verified and Authentic Content', 0xFF2ECC71),
      'Blue': ('ai_generated_verified', 'AI Generated but Verified', 0xFF3498DB),
      'Purple': ('edited_content', 'Opinion, Satire, or Edited Content', 0xFF8E44AD),
      'Orange': ('disputed_needs_context', 'Partially Verified / Needs Caution', 0xFFF39C12),
      'Red': ('false_or_misleading', 'Fake, Misleading, or False Content', 0xFFE74C3C),
    };

    for (final row in rows) {
      final label = NexoraLabel.fromBackendLabel(row['label'] as String?);
      final exp = expected[row['label'] as String]!;
      // ignore: avoid_print
      print('${row['band']} image post | ${row['score']} ${row['label']} '
          '→ "${label.name}" 0x${label.color.value.toRadixString(16).toUpperCase()}');
      expect(label.code, exp.$1);
      expect(label.name, exp.$2);
      expect(label.color.value, exp.$3);
    }
  });
}
