/**
 * Simple request logger middleware.
 * Logs method, URL, status code, and response time.
 */
const logger = (req, res, next) => {
  const start = Date.now();

  // Hook into response finish to log after response is sent
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
    };

    if (process.env.NODE_ENV !== 'production') {
      // Color-coded status in dev
      const statusColor =
        res.statusCode >= 500
          ? '\x1b[31m' // red
          : res.statusCode >= 400
            ? '\x1b[33m' // yellow
            : res.statusCode >= 300
              ? '\x1b[36m' // cyan
              : '\x1b[32m'; // green
      const reset = '\x1b[0m';
      console.log(
        `${statusColor}${res.statusCode}${reset} ${req.method} ${req.originalUrl} ${duration}ms`
      );
    }
  });

  next();
};

module.exports = logger;
