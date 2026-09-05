import 'api_client.dart';

/// Client for the backend age-assurance API (`/api/v1/age-verification`).
///
/// The backend — driven by the configured age-assurance provider — is the
/// only authority on verification state. This client never declares a user
/// verified; it only reports the status the backend returns.
///
/// Statuses use the backend terminology:
///   NOT_STARTED / PENDING / VERIFIED / FAILED / REQUIRES_REVIEW
class AgeVerificationService {
  AgeVerificationService._internal();

  static final AgeVerificationService _instance =
      AgeVerificationService._internal();
  factory AgeVerificationService() => _instance;

  final ApiClient _api = ApiClient();

  /// Start (or restart) age assurance for the current user.
  ///
  /// Returns the backend result payload, e.g. `{status, ageCategory,
  /// sessionUrl}`. For instant providers the status may already be terminal
  /// (e.g. VERIFIED); interactive providers return PENDING and require
  /// [getStatus] to be polled (or the user to finish the provider session).
  Future<Map<String, dynamic>> initiate() =>
      _request(() => _api.post('/age-verification/initiate', auth: true));

  /// Fetch the current assurance status/result from the backend.
  Future<Map<String, dynamic>> getStatus() =>
      _request(() => _api.get('/age-verification/status', auth: true));

  /// Retry after a failed attempt. The backend enforces the attempt limit
  /// and only the backend may re-open a verification.
  Future<Map<String, dynamic>> retry() =>
      _request(() => _api.post('/age-verification/retry', auth: true));

  Future<Map<String, dynamic>> _request(
    Future<ApiResponse> Function() send,
  ) async {
    final response = await send();
    if (!response.success) {
      throw AgeVerificationException(
        response.message ?? 'Age verification failed. Please try again.',
      );
    }
    final body = response.data;
    if (body == null || body['data'] is! Map<String, dynamic>) {
      throw const AgeVerificationException(
        'Unexpected response from the age verification service.',
      );
    }
    return Map<String, dynamic>.from(body['data'] as Map);
  }
}

/// Raised when the backend refuses or fails an age-assurance request.
/// [message] is already user-safe (no provider internals).
class AgeVerificationException implements Exception {
  final String message;
  const AgeVerificationException(this.message);

  @override
  String toString() => message;
}
