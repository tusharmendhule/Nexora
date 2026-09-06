import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';

/// Result of a successful media upload.
class UploadResult {
  final String url;
  final String type;
  final String mimeType;
  final int fileSize;
  final String? thumbnailUrl;

  const UploadResult({
    required this.url,
    required this.type,
    required this.mimeType,
    required this.fileSize,
    this.thumbnailUrl,
  });

  factory UploadResult.fromJson(Map<String, dynamic> json) {
    return UploadResult(
      url: json['url'] as String? ?? '',
      type: json['type'] as String? ?? 'image',
      mimeType: json['mimeType'] as String? ?? 'application/octet-stream',
      fileSize: json['fileSize'] as int? ?? 0,
      thumbnailUrl: json['thumbnailUrl'] as String?,
    );
  }

  /// Convert to a media item map suitable for the post creation API.
  Map<String, dynamic> toMediaItem() {
    return {
      'url': url,
      'type': type,
      'mimeType': mimeType,
      'fileSize': fileSize,
      if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
    };
  }
}

/// Upload progress callback.
/// [bytesSent] is the number of bytes sent so far.
/// [totalBytes] is the total file size in bytes.
typedef UploadProgressCallback = void Function(int bytesSent, int totalBytes);

/// Upload error details.
class UploadError {
  final int? statusCode;
  final String message;

  const UploadError({
    this.statusCode,
    required this.message,
  });

  @override
  String toString() => 'UploadError($statusCode: $message)';
}

/// Service for uploading media files (images, videos, audio) to the backend.
///
/// Files are uploaded as multipart form data to the backend,
/// which then uploads them to Cloudinary and returns a secure URL.
/// Cloudinary secrets are never exposed to the Flutter client.
class UploadService {
  UploadService._internal();

  static final UploadService _instance = UploadService._internal();
  factory UploadService() => _instance;

  // ─── Size limits (matching backend) ──────────────────────
  static const int maxImageSize = 10 * 1024 * 1024; // 10 MB
  static const int maxVideoSize = 100 * 1024 * 1024; // 100 MB
  static const int maxAudioSize = 20 * 1024 * 1024; // 20 MB

  // ─── Supported MIME types ──────────────────────────────
  static const Set<String> supportedImageTypes = {
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  };

  static const Set<String> supportedVideoTypes = {
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
    'video/x-matroska',
  };

  static const Set<String> supportedAudioTypes = {
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
    'audio/flac',
    'audio/x-m4a',
  };

  // ─── Token helpers ───────────────────────────────────

  Future<String?> _getFirebaseToken() async {
    try {
      final user = fb.FirebaseAuth.instance.currentUser;
      if (user == null) return null;
      return await user.getIdToken(true);
    } catch (_) {
      return null;
    }
  }

  Future<String?> _getJwtToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  Future<String?> _getIdToken() async {
    String? token = await _getFirebaseToken();
    if (token == null || token.isEmpty) {
      token = await _getJwtToken();
    }
    return token;
  }

  // ─── Validation ─────────────────────────────────────

  /// Determine the media category from a file path or MIME type.
  String? getMediaType(String? filePath, String? mimeType) {
    if (mimeType != null) {
      if (supportedImageTypes.contains(mimeType)) return 'image';
      if (supportedVideoTypes.contains(mimeType)) return 'video';
      if (supportedAudioTypes.contains(mimeType)) return 'audio';
    }

    if (filePath != null) {
      final ext = filePath.toLowerCase().split('.').last;
      switch (ext) {
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'webp':
          return 'image';
        case 'mp4':
        case 'mov':
        case 'm4v':
        case 'webm':
        case 'avi':
        case 'mkv':
          return 'video';
        case 'mp3':
        case 'wav':
        case 'ogg':
        case 'aac':
        case 'flac':
          return 'audio';
      }
    }

    return null;
  }

  /// Get MIME type from file extension.
  String getMimeType(String filePath) {
    final ext = filePath.toLowerCase().split('.').last;
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'mp4':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'webm':
        return 'video/webm';
      case 'avi':
        return 'video/x-msvideo';
      case 'mkv':
        return 'video/x-matroska';
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'aac':
        return 'audio/aac';
      case 'flac':
        return 'audio/flac';
      default:
        return 'application/octet-stream';
    }
  }

  // ─── Upload ──────────────────────────────────────────

  /// Upload an XFile to the backend — works on both web and mobile.
  ///
  /// Uses XFile.readAsBytes() which works on all platforms including web.
  Future<UploadResult> uploadXFile({
    required XFile xFile,
    UploadProgressCallback? onProgress,
  }) async {
    final mimeType = xFile.mimeType ?? getMimeType(xFile.name);

    // Validate by MIME type (more reliable on web where path may be fake)
    final mediaType = getMediaType(xFile.name, mimeType);
    if (mediaType == null) {
      throw UploadError(
        message: 'Unsupported file type. Allowed: images (JPEG, PNG, GIF, WebP), videos (MP4, MOV, WebM), audio (MP3, WAV, OGG, AAC, FLAC).',
      );
    }

    final token = await _getIdToken();
    if (token == null) {
      throw UploadError(
        statusCode: 401,
        message: 'Not authenticated. Please log in again.',
      );
    }

    final fileBytes = await xFile.readAsBytes();

    return _doUpload(
      fileBytes: fileBytes,
      filename: xFile.name,
      mimeType: mimeType,
      fileLength: fileBytes.length,
      token: token,
      onProgress: onProgress,
    );
  }

  /// Internal: send bytes to the backend upload endpoint.
  Future<UploadResult> _doUpload({
    required Uint8List fileBytes,
    required String filename,
    required String mimeType,
    required int fileLength,
    required String token,
    UploadProgressCallback? onProgress,
  }) async {
    final url = Uri.parse('${ApiConfig.baseUrl}/posts/upload');
    final request = http.MultipartRequest('POST', url);
    request.headers['Authorization'] = 'Bearer $token';

    onProgress?.call(0, fileLength);

    final multipartFile = http.MultipartFile.fromBytes(
      'file',
      fileBytes,
      filename: filename,
      contentType: MediaType.parse(mimeType),
    );

    request.files.add(multipartFile);

    try {
      final streamedResponse = await request.send().timeout(
        const Duration(seconds: 120),
        onTimeout: () => throw UploadError(
          message: 'Upload timed out. Please check your connection and try again.',
        ),
      );

      onProgress?.call(fileLength, fileLength);

      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;

        if (body['success'] == true && body['media'] != null) {
          return UploadResult.fromJson(
            body['media'] as Map<String, dynamic>,
          );
        }

        throw UploadError(
          statusCode: response.statusCode,
          message: body['message'] as String? ?? 'Upload failed',
        );
      }

      String errorMessage;
      switch (response.statusCode) {
        case 400:
          errorMessage = _parseErrorMessage(response.body) ?? 'Invalid file. Please check the file type and size.';
          break;
        case 401:
          errorMessage = 'Not authenticated. Please log in again.';
          break;
        case 413:
          errorMessage = 'File too large. Please choose a smaller file.';
          break;
        case 500:
          errorMessage = 'Server error. Please try again later.';
          break;
        default:
          errorMessage = _parseErrorMessage(response.body) ?? 'Upload failed (HTTP ${response.statusCode})';
      }

      throw UploadError(
        statusCode: response.statusCode,
        message: errorMessage,
      );
    } on TimeoutException {
      throw UploadError(
        message: 'Upload timed out. Please check your connection and try again.',
      );
    } on UploadError {
      rethrow;
    } catch (e) {
      throw UploadError(
        message: 'Unexpected error during upload: ${e.toString()}',
      );
    }
  }

  // ─── Helpers ─────────────────────────────────────────

  String? _parseErrorMessage(String body) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map && decoded.containsKey('message')) {
        return decoded['message'] as String?;
      }
    } catch (_) {}
    return null;
  }
}
