/// Thrown by API services when a backend request fails
/// (network error, non-2xx status, invalid response).
class ApiException implements Exception {
  final int? statusCode;
  final String message;

  const ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}