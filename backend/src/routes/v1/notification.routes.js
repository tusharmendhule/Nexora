/**
 * Notification Routes (Module 22 — V1)
 * ======================================
 * Authenticated endpoints for managing notifications.
 *
 * GET    /api/v1/notifications              — List notifications (paginated)
 * GET    /api/v1/notifications/unread-count  — Get unread count
 * PATCH  /api/v1/notifications/:id/read      — Mark one as read
 * PATCH  /api/v1/notifications/read-all      — Mark all as read
 * DELETE /api/v1/notifications               — Delete all
 * GET    /api/v1/notifications/types         — Valid types (for UI)
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteAll,
  getTypes,
} = require('../../controllers/v1/notification.controller');

// All routes require authentication
router.use(protect);

// GET /api/v1/notifications/types — list valid types (must be before /:id)
router.get('/types', getTypes);

// GET /api/v1/notifications/unread-count — unread count
router.get('/unread-count', getUnreadCount);

// PATCH /api/v1/notifications/read-all — mark all as read
router.patch('/read-all', markAllAsRead);

// GET /api/v1/notifications — list notifications
router.get('/', getNotifications);

// POST /api/v1/notifications — create a notification (admin/system use)
router.post('/', async (req, res, next) => {
  try {
    const notificationService = require('../../services/notification.service');
    const { recipientId, type, title, body, targetType, targetId, metadata } = req.body;

    if (!recipientId || !type || !title || !body) {
      return res.status(400).json({
        success: false,
        message: 'recipientId, type, title, and body are required',
      });
    }

    const notification = await notificationService.create({
      recipientId,
      senderId: req.user._id,
      type,
      title,
      body,
      targetType,
      targetId,
      metadata,
    });

    if (!notification) {
      return res.status(400).json({ success: false, message: 'Failed to create notification' });
    }

    res.status(201).json({ success: true, notification });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/notifications — delete all
router.delete('/', deleteAll);

// PATCH /api/v1/notifications/:id/read — mark one as read
router.patch('/:id/read', validateObjectId('id'), markAsRead);

module.exports = router;
