/// API configuration for Nexora backend.
///
/// Base URL points to the v1 API.
/// Change [baseUrl] to your deployed backend URL in production.
class ApiConfig {
  ApiConfig._();

  /// Backend base URL — change this for production.
  static const String baseUrl = 'http://10.0.2.2:5000/api/v1';

  /// Timeout for HTTP requests.
  static const Duration timeout = Duration(seconds: 15);
}
