require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

const isDev = process.env.NODE_ENV !== 'production';

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      // In development, allow any localhost origin (Flutter web uses random ports)
      if (isDev && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Length'],
    credentials: true,
    maxAge: isDev ? 0 : 86400, // Disable preflight cache in dev for easier debugging
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
app.use('/api/v1/settings', require('./routes/v1/settings.routes'));
app.use('/api/v1/stories', require('./routes/v1/story.routes'));

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

// ─── Serve Flutter Web Build ──────────────────────────
// The Flutter web build output lives in frontend/build/web/.
// We serve it from the same port as the API so everything
// runs on a single URL.

const flutterBuildPath = path.join(__dirname, '..', '..', 'frontend', 'build', 'web');
const hasFlutterBuild = fs.existsSync(flutterBuildPath);

if (hasFlutterBuild) {
  // Serve static assets (JS, CSS, images, fonts)
  app.use(express.static(flutterBuildPath, {
    index: 'index.html',
    maxAge: isDev ? 0 : '1d',
  }));

  console.log('   Frontend:  Flutter web build served from /');
} else {
  console.log('   Frontend:  No Flutter build found (run: cd frontend && flutter build web)');
}

// ─── Root Health ────────────────────────────────────────

app.get('/', (_req, res) => {
  if (hasFlutterBuild) {
    // Serve Flutter's index.html for the root path
    res.sendFile(path.join(flutterBuildPath, 'index.html'));
  } else {
    res.json({
      success: true,
      message: 'Nexora Backend Running 🚀',
      api: {
        v1: '/api/v1/health',
        legacy: '/api/auth',
      },
    });
  }
});

// ─── SPA Catch-All ─────────────────────────────────────
// For any non-API route that didn't match a static file,
// serve index.html so Flutter's client-side router handles it.

if (hasFlutterBuild) {
  app.get('*path', (req, res) => {
    // Don't serve index.html for API routes that don't exist
    if (req.path.startsWith('/api')) {
      return res.status(404).json({
        success: false,
        message: 'API route not found',
      });
    }
    res.sendFile(path.join(flutterBuildPath, 'index.html'));
  });
} else {
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found',
    });
  });
}

// ─── Error Handler (must be last) ───────────────────────

app.use(errorHandler);

// ─── Start Server ───────────────────────────────────────

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`\n🚀 Nexora API Server`);
  console.log(`   Port:      ${PORT}`);
  console.log(`   App:       http://localhost:${PORT}`);
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

// ─── Socket.IO Setup ─────────────────────────────────
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      if (isDev && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io accessible to route handlers via req.app.locals.io
app.locals.io = io;

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    // Try Firebase token first, then JWT
    const { firebaseAuth } = require('./config/firebase');
    const { verifyToken } = require('./utils/generateToken');
    const User = require('./models/user.model');

    let user = null;

    try {
      const decoded = await firebaseAuth.verifyIdToken(token);
      user = await User.findOne({ firebaseUid: decoded.uid }).select('-password');
    } catch (_) {
      // Try JWT
      try {
        const decoded = verifyToken(token);
        user = await User.findById(decoded.id).select('-password');
      } catch (_) {
        return next(new Error('Authentication error'));
      }
    }

    if (!user || user.isDisabled) {
      return next(new Error('Authentication error'));
    }

    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`[Socket] User connected: ${socket.userId}`);

  // Join a room named after the user for targeted messaging
  socket.join(`user:${socket.userId}`);

  // Handle joining a specific conversation room
  socket.on('join_conversation', (conversationId) => {
    if (conversationId) {
      socket.join(`conversation:${conversationId}`);
    }
  });

  // Handle leaving a conversation room
  socket.on('leave_conversation', (conversationId) => {
    if (conversationId) {
      socket.leave(`conversation:${conversationId}`);
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    if (data?.recipientId) {
      io.to(`user:${data.recipientId}`).emit('typing', {
        userId: socket.userId,
        conversationId: data.conversationId
      });
    }
  });

  // Handle stop typing
  socket.on('stop_typing', (data) => {
    if (data?.recipientId) {
      io.to(`user:${data.recipientId}`).emit('stop_typing', {
        userId: socket.userId,
        conversationId: data.conversationId
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] User disconnected: ${socket.userId}`);
  });
});

console.log('   Socket.IO:   enabled');

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  io.close();
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;
