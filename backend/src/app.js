require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const logger = require('./middleware/logger.middleware');
const { errorHandler } = require('./middleware/error.middleware');
const securityHeaders = require('./middleware/security.middleware');

// Connect to MongoDB
connectDB();

const app = express();

// ─── Security Headers (must be first) ───────────────────
app.use(securityHeaders);

// ─── Global Middleware ──────────────────────────────────

// CORS — restrict to configured origins (never wildcard with credentials)
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:5000'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400, // Preflight cache: 24 hours
  })
);

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging
app.use(logger);

// ─── Health Check ───────────────────────────────────────

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Nexora API is running',
    version: 'v1',
    timestamp: new Date().toISOString(),
  });
});

// ─── V1 API Routes ─────────────────────────────────────

app.use('/api/v1/auth', require('./routes/v1/auth.routes'));
app.use('/api/v1/users', require('./routes/v1/user.routes'));
app.use('/api/v1/posts', require('./routes/v1/post.routes'));
app.use('/api/v1/comments', require('./routes/v1/comment.routes'));
app.use('/api/v1/reports', require('./routes/v1/report.routes'));
app.use('/api/v1/admin', require('./routes/v1/admin.routes'));
app.use('/api/v1/content', require('./routes/v1/content.routes'));
app.use('/api/v1/analyze', require('./routes/v1/analyze.routes'));
app.use('/api/v1/verification', require('./routes/v1/verification.routes'));
app.use('/api/v1/pipeline', require('./routes/v1/pipeline.routes'));
app.use('/api/v1/age-verification', require('./routes/v1/age-verification.routes'));
app.use('/api/v1/moderation', require('./routes/v1/moderation.routes'));
app.use('/api/v1/audit', require('./routes/v1/audit.routes'));
app.use('/api/v1/notifications', require('./routes/v1/notification.routes'));

// ─── Legacy Routes (backward compatibility) ─────────────
// Keep old endpoints working so the existing Flutter frontend doesn't break.

const legacyAuthRoutes = require('./routes/auth.route');
const legacyUserRoutes = require('./routes/user.route');
const legacyPostRoutes = require('./routes/post.route');
const legacyNotificationRoutes = require('./routes/notification.route');
const legacyStoryRoutes = require('./routes/story.route');
const legacyHighlightRoutes = require('./routes/highlight.route');
const legacyMessageRoutes = require('./routes/message.route');
const legacyActivityRoutes = require('./routes/activity.route');
const legacyAnalyticsRoutes = require('./routes/analytics.route');
const legacyOtpRoutes = require('./routes/otp.route');
const legacyHashtagRoutes = require('./routes/hashtag.route');
const legacySettingsRoutes = require('./routes/settings.route');
const legacyReportRoutes = require('./routes/report.route');
const legacyTrustScoreRoutes = require('./routes/trustScore.route');
const legacyFactCheckRoutes = require('./routes/factCheck.route');
const legacyModerationRoutes = require('./routes/moderation.route');
const legacyFollowRoutes = require('./routes/follow.route');
const legacyCommentRoutes = require('./routes/comment.route');
const legacyLikeRoutes = require('./routes/like.route');
const legacyConversationRoutes = require('./routes/conversation.route');

app.use('/api/auth', legacyAuthRoutes);
app.use('/api/users', legacyUserRoutes);
app.use('/api/users', legacyFollowRoutes); // mounted on same prefix as user routes
app.use('/api/posts', legacyPostRoutes);
app.use('/api/notifications', legacyNotificationRoutes);
app.use('/api/stories', legacyStoryRoutes);
app.use('/api/highlights', legacyHighlightRoutes);
app.use('/api/messages', legacyMessageRoutes);
app.use('/api/activities', legacyActivityRoutes);
app.use('/api/analytics', legacyAnalyticsRoutes);
app.use('/api/otp', legacyOtpRoutes);
app.use('/api/hashtags', legacyHashtagRoutes);
app.use('/api/settings', legacySettingsRoutes);
app.use('/api/reports', legacyReportRoutes);
app.use('/api/trust-score', legacyTrustScoreRoutes);
app.use('/api/fact-check', legacyFactCheckRoutes);
app.use('/api/moderation', legacyModerationRoutes);
app.use('/api/comments', legacyCommentRoutes);
app.use('/api/likes', legacyLikeRoutes);
app.use('/api/conversations', legacyConversationRoutes);

// ─── Root Health ────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Nexora Backend Running 🚀',
    api: {
      v1: '/api/v1/health',
      legacy: '/api/auth',
    },
  });
});

// ─── 404 Handler ────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ─── Error Handler (must be last) ───────────────────────

app.use(errorHandler);

// ─── Start Server ───────────────────────────────────────

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`\n🚀 Nexora API Server`);
  console.log(`   Port:      ${PORT}`);
  console.log(`   V1 API:    http://localhost:${PORT}/api/v1/health`);
  console.log(`   Legacy:    http://localhost:${PORT}/api/auth`);
  console.log(`   Env:       ${process.env.NODE_ENV || 'development'}\n`);

  // Start the content processing queue drain loop
  try {
    const processingQueue = require('./services/processing-queue.service');
    processingQueue.startDrainLoop();
    console.log('   Content processing queue: started');
  } catch (err) {
    console.error('   Content processing queue: failed to start -', err.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;
