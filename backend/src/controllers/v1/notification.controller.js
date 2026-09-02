/**
 * Notification Controller (Module 22 — V1)
 * ==========================================
 * Handles notification listing, read state, and unread count.
 */

const notificationService = require('../../services/notification.service');

/**
 * GET /api/v1/notifications
 * Get notifications for the authenticated user.
 * Query: ?page=1&limit=20&unreadOnly=false
 */
exports.getNotifications = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const unreadOnly = req.query.unreadOnly === 'true';

    const result = await notificationService.getNotifications(req.user._id, {
      page,
      limit,
      unreadOnly,
    });

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/notifications/unread-count
 * Get unread notification count for the authenticated user.
 */
exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await notificationService.getUnreadCount(req.user._id);
    res.status(200).json({ success: true, unreadCount: count });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read.
 */
exports.markAsRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markAsRead(
      req.params.id,
      req.user._id
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    res.status(200).json({ success: true, notification });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all notifications as read for the authenticated user.
 */
exports.markAllAsRead = async (req, res, next) => {
  try {
    const count = await notificationService.markAllAsRead(req.user._id);
    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      updatedCount: count,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/notifications
 * Delete all notifications for the authenticated user.
 */
exports.deleteAll = async (req, res, next) => {
  try {
    const count = await notificationService.deleteAll(req.user._id);
    res.status(200).json({
      success: true,
      message: 'All notifications deleted',
      deletedCount: count,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/notifications/types
 * List valid notification types (for UI).
 */
exports.getTypes = async (_req, res) => {
  res.status(200).json({
    success: true,
    types: notificationService.getEventTypes(),
  });
};
