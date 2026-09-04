import 'dart:io';

/// Write [content] to a file in the system temp directory and return the
/// absolute path where the file was saved.
Future<String> saveJsonDownload(String filename, String content) async {
  final dir = Directory.systemTemp;
  final file = File(
    '${dir.path}${Platform.pathSeparator}$filename',
  );
  await file.writeAsString(content, flush: true);
  return file.path;
}