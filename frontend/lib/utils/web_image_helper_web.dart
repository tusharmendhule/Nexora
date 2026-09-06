import 'package:flutter/widgets.dart';

/// Returns true if the [url] looks like a network URL (http/https).
/// On web, all URLs are treated as network URLs.
bool isNetworkUrl(String url) {
  return url.startsWith('http://') || url.startsWith('https://');
}

/// Build an Image widget from a URL.
/// On web, all URLs are treated as network URLs (no local file support).
Image buildImage(String url, { BoxFit fit = BoxFit.cover, double? width, double? height }) {
  return Image.network(
    url,
    fit: fit,
    width: width,
    height: height,
    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
  );
}

/// Build a DecorationImage from a URL.
/// On web, all URLs are treated as network URLs.
DecorationImage? buildDecorationImage(String url, { BoxFit fit = BoxFit.cover }) {
  return DecorationImage(
    image: NetworkImage(url),
    fit: fit,
  );
}

/// Get the appropriate ImageProvider for a URL.
/// On web, all URLs are treated as network URLs.
ImageProvider getImageProvider(String url) {
  return NetworkImage(url);
}
