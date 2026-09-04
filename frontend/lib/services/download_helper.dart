/// Platform-aware JSON download helper.
///
/// - On web, triggers a real browser download (Blob + anchor).
/// - On mobile/desktop (dart:io), writes the file to the system temp
///   directory and returns the absolute path for the user.
export 'download_helper_io.dart'
    if (dart.library.html) 'download_helper_web.dart';