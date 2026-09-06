import 'dart:io';

void main() {
  final keys = <String>{};
  final dir = Directory('lib');
  final files = dir
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'));

  final re = RegExp(r"""trP?\s*\(\s*context\s*,\s*'((?:[^'\\]|\\.)*)'""");
  for (final f in files) {
    final text = f.readAsStringSync();
    for (final m in re.allMatches(text)) {
      var k = m.group(1)!;
      // unescape simple escapes
      k = k.replaceAll(r"\'", "'").replaceAll(r"\\", r'\');
      keys.add(k);
    }
  }
  final sorted = keys.toList()..sort();
  File('.scan-keys-out.txt').writeAsStringSync(sorted.join('\n'));
  stdout.writeln('${sorted.length} literal keys extracted');
}
