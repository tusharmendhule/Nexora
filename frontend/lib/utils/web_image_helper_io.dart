import 'dart:io';

import 'package:flutter/widgets.dart';

/// Returns true if the [url] looks like a network URL (http/https).
bool isNetworkUrl(String url) {
  return url.startsWith('http://') || url.startsWith('https://');
}

/// Build an Image widget from a URL.
///
/// - Network URLs → Image.network()
/// - Local file paths → Image.file()
Image buildImage(String url, { BoxFit fit = BoxFit.cover, double? width, double? height }) {
  if (isNetworkUrl(url)) {
    return Image.network(
      url,
      fit: fit,
      width: width,
      height: height,
      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
    );
  }
  return Image.file(
    File(url),
    fit: fit,
    width: width,
    height: height,
    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
  );
}

/// Build a DecorationImage from a URL.
DecorationImage? buildDecorationImage(String url, { BoxFit fit = BoxFit.cover }) {
  if (isNetworkUrl(url)) {
    return DecorationImage(
      image: NetworkImage(url),
      fit: fit,
    );
  }
  return DecorationImage(
    image: FileImage(File(url)),
    fit: fit,
  );
}

/// Get the appropriate ImageProvider for a URL.
ImageProvider getImageProvider(String url) {
  if (isNetworkUrl(url)) {
    return NetworkImage(url);
  }
  return FileImage(File(url));
}
