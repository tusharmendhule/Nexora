import 'dart:io';

void main() {
  final keys = File('.scan-keys-out.txt')
      .readAsLinesSync()
      .where((l) => l.trim().isNotEmpty)
      .toSet();
  final hi = File('lib/l10n/translations_hi.dart').readAsStringSync();
  final mapKeys = <String>{};
  final re = RegExp(r"""^\s*'((?:[^'\\]|\\.)*)':\s*""", multiLine: true);
  for (final m in re.allMatches(hi)) {
    mapKeys.add(m.group(1)!.replaceAll(r"\'", "'"));
  }
  final missing = keys.difference(mapKeys).toList()..sort();
  File('.scan-missing.txt').writeAsStringSync(missing.join('\n'));
  stdout.writeln('total used: ${keys.length}, existing: ${mapKeys.length}, missing: ${missing.length}');
}
