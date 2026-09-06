/// Platform-aware image/file helper.
///
/// - On web, all image URLs are treated as network URLs (no local File support).
/// - On mobile/desktop, supports both network URLs and local file paths.
///
/// This avoids importing dart:io on web which would cause compilation errors.
export 'web_image_helper_io.dart'
    if (dart.library.html) 'web_image_helper_web.dart';
