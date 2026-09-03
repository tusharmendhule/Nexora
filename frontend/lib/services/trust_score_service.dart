import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/nexora_label.dart';

/// Trust Score detail returned by the backend.
class TrustScoreDetail {
  final int score;
  final NexoraLabel label;
  final String explanation;
  final bool isOverrideApplied;
  final double authenticity;
  final double factualVerification;
  final double sourceCredibility;
  final double modelConfidence;
  final DateTime? createdAt;

  const TrustScoreDetail({
    required this.score,
    required this.label,
    required this.explanation,
    required this.isOverrideApplied,
    required this.authenticity,
    required this.factualVerification,
    required this.sourceCredibility,
    required this.modelConfidence,
    this.createdAt,
  });

  factory TrustScoreDetail.fromJson(Map<String, dynamic> json) {
    return TrustScoreDetail(
      score: (json['score'] as num?)?.toInt() ?? 0,
      label: NexoraLabel.fromBackendLabel(
        json['label']?.toString(),
        explanation: json['explanation']?.toString(),
      ),
      explanation: json['explanation']?.toString() ?? 'No explanation available.',
      isOverrideApplied: json['isOverrideApplied'] as bool? ?? false,
      authenticity: (json['authenticity'] as num?)?.toDouble() ?? 0,
      factualVerification: (json['factualVerification'] as num?)?.toDouble() ?? 0,
      sourceCredibility: (json['sourceCredibility'] as num?)?.toDouble() ?? 0,
      modelConfidence: (json['modelConfidence'] as num?)?.toDouble() ?? 0,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }
}

/// Service for fetching trust score data from the backend.
///
/// Reads from `/api/trust-score/:postId` (legacy route) and
/// `/api/v1/posts/:id` (v1 route with embedded trustScoreDetail).
class TrustScoreService {
  TrustScoreService._internal();

  static final TrustScoreService _instance = TrustScoreService._internal();
  factory TrustScoreService() => _instance;

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

  Future<Map<String, String>> _headers() async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    String? token = await _getFirebaseToken();
    if (token == null || token.isEmpty) {
      token = await _getJwtToken();
    }
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  // ─── GET /api/trust-score/:postId ────────────────────

  /// Fetch trust score detail for a specific post from the dedicated
  /// trust score endpoint.
  Future<TrustScoreDetail?> getTrustScore(String postId) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/../../api/trust-score/$postId');
      final response = await http
          .get(url, headers: await _headers())
          .timeout(ApiConfig.timeout);

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['success'] == true && body['trustScore'] != null) {
          return TrustScoreDetail.fromJson(
            body['trustScore'] as Map<String, dynamic>,
          );
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── Extract from post JSON ──────────────────────────

  /// Extract trust score detail from a post's JSON that already
  /// includes `trustScoreDetail` (as returned by the v1 feed endpoint).
  static TrustScoreDetail? fromPostJson(Map<String, dynamic> postJson) {
    final detail = postJson['trustScoreDetail'] as Map<String, dynamic>?;
    if (detail == null) return null;
    return TrustScoreDetail.fromJson(detail);
  }

  // ─── Request moderation review ────────────────────────

  /// Request that a post's trust score be reviewed by a moderator.
  /// Returns true if the request was accepted.
  Future<bool> requestModeratorReview(String postId, {String? reason}) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/moderation/posts/$postId/flag');
      final response = await http
          .post(
            url,
            headers: await _headers(),
            body: jsonEncode({
              'reason': reason ?? 'User-requested review',
            }),
          )
          .timeout(ApiConfig.timeout);

      return response.statusCode == 200 || response.statusCode == 201;
    } catch (_) {
      return false;
    }
  }
}
