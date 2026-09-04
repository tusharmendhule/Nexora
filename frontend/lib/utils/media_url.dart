/// Shared helpers for media URLs.
library;

/// Returns a playable URL for a media file.
///
/// Cloudinary stores videos with whatever codec was uploaded (e.g. AV1),
/// which some browsers/devices can't decode. Inserting `f_auto` makes
/// Cloudinary transcode on the fly to the most compatible rendition
/// (h264/avc1 in an mp4 container), which every browser and Flutter's
/// video_player can play.
String mediaPlaybackUrl(String url) {
  if (url.isEmpty) return url;

  // Only rewrite Cloudinary URLs.
  final cloudinaryIdx = url.indexOf('res.cloudinary.com/');
  if (cloudinaryIdx == -1) return url;

  // https://res.cloudinary.com/<cloud>/<video|image>/upload/[<transform>]/<version>/<path>
  // Transformations come after "upload/"; insert f_auto before the version.
  const uploadMarker = '/upload/';
  final uploadIdx = url.indexOf(uploadMarker);
  if (uploadIdx == -1) return url;

  final head = url.substring(0, uploadIdx + uploadMarker.length);
  final rest = url.substring(uploadIdx + uploadMarker.length);

  // If a transformation already exists (e.g. `q_auto/f.jpg`, `f_auto/v1/…`,
  // `c_pad,w_640/…`), leave the URL untouched.
  final firstSegment = rest.split('/').firstOrNull ?? '';
  if (firstSegment.contains(',')) return url;
  if (firstSegment == 'f_auto') return url;

  return '$head${'f_auto'}/$rest';
}
