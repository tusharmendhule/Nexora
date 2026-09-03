/**
 * Centralized error handling middleware.
 * All errors thrown or passed via next(err) are caught here.
 */

// Custom API Error class
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

// Mongoose validation error handler
const handleValidationError = (err) => {
  const messages = Object.values(err.errors).map((e) => e.message);
  return new ApiError(400, 'Validation failed', messages);
};

// Mongoose duplicate key error
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue || {})[0];
  const value = err.keyValue?.[field];
  return new ApiError(
    409,
    `Duplicate value for field "${field}": "${value}". This value is already taken.`
  );
};

// Mongoose cast error (invalid ObjectId)
const handleCastError = (err) => {
  return new ApiError(400, `Invalid ${err.path}: ${err.value}`);
};

// JWT errors
const handleJwtError = () => {
  return new ApiError(401, 'Invalid or expired token');
};

const handleJwtExpiredError = () => {
  return new ApiError(401, 'Token has expired. Please log in again.');
};

// Main error handler middleware
const errorHandler = (err, req, res, _next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    error = handleValidationError(err);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    error = handleDuplicateKeyError(err);
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    error = handleCastError(err);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = handleJwtError();
  }

  if (err.name === 'TokenExpiredError') {
    error = handleJwtExpiredError();
  }

  // Multer errors (file size limit, unexpected field, etc.)
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
    const multerCode = err.code || err.name;
    switch (multerCode) {
      case 'LIMIT_FILE_SIZE':
        error = new ApiError(400, 'File too large. Maximum allowed size is 100MB for video, 10MB for images, and 20MB for audio.');
        break;
      case 'LIMIT_FILE_COUNT':
        error = new ApiError(400, 'Too many files. Maximum allowed: 10 files.');
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        error = new ApiError(400, 'Unexpected file field in upload.');
        break;
      default:
        error = new ApiError(400, 'File upload failed: ' + (err.message || 'unknown error'));
    }
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  const response = {
    success: false,
    message,
  };

  if (error.details) {
    response.errors = error.details;
  }

  // NEVER expose stack traces or internal error details to clients
  // Internal errors are logged server-side only
  if (statusCode === 500 && !error.isOperational) {
    response.message = 'Internal server error';
  }

  res.status(statusCode).json(response);
};

module.exports = { ApiError, errorHandler };
