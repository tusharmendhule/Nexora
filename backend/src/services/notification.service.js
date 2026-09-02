/**
 * Notification Service (Module 22)
 * =================================
 * Manages notification creation, querying, and read state.
 *
 * Design principles:
 *   - Notifications are fire-and-forget: creation failures never block operations
 *   - Structured event format for consistent querying
 *   - Support for pagination and unread count
 *   - No fake notifications — only real events generate notifications
 */

const Notification = require('../models/notification.model');
const { NOTIFICATION_TYPE } = require('../models/notification.model');

class NotificationService {
  // ─── Create Notifications ──────────────────────────────────────────

  /**
   * Create a notification. Non-critical — never throws.
   *
   * @param {Object} params
   * @param {string} params.recipientId — User receiving the notification
   * @param {string} [params.senderId]  — User who triggered the event (null for system)
   * @param {string} params.type        — One of NOTIFICATION_TYPE
   * @param {string} params.title       — Short title
   * @param {string} params.body        — Notification body text
   * @param {string} [params.targetType] — 'Post', 'Report', 'User', 'System'
   * @param {string} [params.targetId]   — ObjectId of the related resource
   * @param {Object} [params.metadata]   — Additional structured data
   * @returns {Promise<Object|null>} Created notification or null on failure
   */
  async create({ recipientId, senderId, type, title, body, targetType, targetId, metadata }) {
    if (!recipientId || !type || !title || !body) {
      return null; // Missing required fields — silent fail
    }

    if (!NOTIFICATION_TYPE[type]) {
      return null; // Invalid type — silent fail
    }

    // Don't notify the user about their own actions
    if (senderId && recipientId.toString() === senderId.toString()) {
      return null;
    }

    try {
      const notification = await Notification.create({
        recipient: recipientId,
        sender: senderId || null,
        type,
        title: title.substring(0, 200).trim(),
        body: body.substring(0, 500).trim(),
        targetType: targetType || null,
        targetId: targetId || null,
        metadata: metadata || null,
      });

      return notification;
    } catch (err) {
      // Notification creation is non-critical
      console.error('[NotificationService] Failed to create notification:', err.message);
      return null;
    }
  }

  /**
   * Convenience: notify post owner about a moderation action.
   *
   * @param {Object} params
   * @param {string} params.postOwnerId — The post author's user ID
   * @param {string} params.moderatorId — The moderator's user ID
   * @param {string} params.action      — 'POST_APPROVED', 'POST_REJECTED', 'LABEL_OVERRIDE'
   * @param {string} params.postId      — The post's _id
   * @param {string} [params.reason]    — Moderation reason
   * @param {Object} [params.changes]   — { previousLabel, newLabel, previousStatus, newStatus }
   */
  async notifyModerationAction({ postOwnerId, moderatorId, action, postId, reason, changes }) {
    const titleMap = {
      POST_APPROVED: 'Post Approved',
      POST_REJECTED: 'Post Requires Attention',
      LABEL_OVERRIDE: 'Trust Label Updated',
      POST_FLAGGED: 'Post Flagged for Review',
      CONTENT_REMOVED: 'Content Removed',
      CONTENT_RESTORED: 'Content Restored',
    };

    const bodyMap = {
      POST_APPROVED: 'Your post has been approved and is now visible to the community.',
      POST_REJECTED: reason
        ? `Your post was not approved. Reason: ${reason}`
        : 'Your post was not approved. Please review the community guidelines.',
      LABEL_OVERRIDE: changes?.newLabel
        ? `Your post trust label has been updated to "${changes.newLabel}".`
        : 'Your post trust label has been updated.',
      POST_FLAGGED: 'Your post has been flagged for further review.',
      CONTENT_REMOVED: reason
        ? `Your content has been removed. Reason: ${reason}`
        : 'Your content has been removed for a guidelines violation.',
      CONTENT_RESTORED: 'Your content has been restored and is now visible again.',
    };

    return this.create({
      recipientId: postOwnerId,
      senderId: moderatorId,
      type: action,
      title: titleMap[action] || 'Moderation Update',
      body: bodyMap[action] || 'A moderation action was taken on your post.',
      targetType: 'Post',
      targetId: postId,
      metadata: { reason: reason || null, changes: changes || null },
    });
  }

  /**
   * Convenience: notify report reporter about report resolution.
   *
   * @param {Object} params
   * @param {string} params.reporterId  — The user who filed the report
   * @param {string} params.moderatorId — The moderator who resolved it
   * @param {string} params.reportId    — The report's _id
   * @param {string} params.status      — 'RESOLVED' or 'DISMISSED'
   * @param {string} [params.reason]    — Resolution/dismissal reason
   */
  async notifyReportResolution({ reporterId, moderatorId, reportId, status, reason }) {
    const isResolved = status === 'RESOLVED';

    return this.create({
      recipientId: reporterId,
      senderId: moderatorId,
      type: isResolved ? 'REPORT_RESOLVED' : 'REPORT_DISMISSED',
      title: isResolved ? 'Report Resolved' : 'Report Dismissed',
      body: isResolved
        ? 'Your report has been reviewed and resolved. Thank you for helping keep Nexora safe.'
        : 'Your report has been reviewed. No violation was found.',
      targetType: 'Report',
      targetId: reportId,
      metadata: { status, reason: reason || null },
    });
  }

  /**
   * Convenience: notify post owner about pipeline completion.
   *
   * @param {Object} params
   * @param {string} params.postOwnerId — The post author's user ID
   * @param {string} params.postId      — The post's _id
   * @param {string} params.status      — Final verification status
   * @param {Object} [params.trustScoreResult] — Trust score details
   */
  async notifyVerificationComplete({ postOwnerId, postId, status, trustScoreResult }) {
    const statusMessages = {
      PUBLISHED: {
        title: 'Verification Complete',
        body: 'Your post has been verified and published.',
      },
      REVIEW_REQUIRED: {
        title: 'Verification Complete — Review Needed',
        body: 'Your post requires additional review before publication.',
      },
      REJECTED: {
        title: 'Verification Complete — Action Required',
        body: 'Your post did not pass verification. Please review the community guidelines.',
      },
      FAILED: {
        title: 'Verification Failed',
        body: 'There was an issue verifying your post. Please try again.',
      },
    };

    const msg = statusMessages[status] || statusMessages.REVIEW_REQUIRED;

    return this.create({
      recipientId: postOwnerId,
      senderId: null, // System-generated
      type: status === 'PUBLISHED' ? 'POST_VERIFIED' : 'POST_REQUIRES_MODERATION',
      title: msg.title,
      body: msg.body,
      targetType: 'Post',
      targetId: postId,
      metadata: {
        status,
        trustScore: trustScoreResult?.score || null,
        trustLabel: trustScoreResult?.label || null,
      },
    });
  }

  /**
   * Convenience: notify user about account security events.
   *
   * @param {Object} params
   * @param {string} params.userId      — The affected user's ID
   * @param {string} params.adminId     — The admin who made the change
   * @param {string} params.eventType   — 'USER_ROLE_CHANGED', 'USER_DISABLED', 'USER_ENABLED'
   * @param {Object} [params.details]   — Event-specific details
   */
  async notifyAccountSecurity({ userId, adminId, eventType, details }) {
    const messages = {
      USER_ROLE_CHANGED: {
        title: 'Account Role Updated',
        body: details?.newRole
          ? `Your account role has been updated to "${details.newRole}".`
          : 'Your account role has been updated.',
      },
      USER_DISABLED: {
        title: 'Account Disabled',
        body: 'Your account has been disabled by an administrator. Please contact support for more information.',
      },
      USER_ENABLED: {
        title: 'Account Re-enabled',
        body: 'Your account has been re-enabled by an administrator.',
      },
    };

    const msg = messages[eventType] || {
      title: 'Account Update',
      body: 'A change was made to your account.',
    };

    return this.create({
      recipientId: userId,
      senderId: adminId,
      type: 'ACCOUNT_SECURITY',
      title: msg.title,
      body: msg.body,
      targetType: 'User',
      targetId: userId,
      metadata: { eventType, details: details || null },
    });
  }

  // ─── Read Operations ───────────────────────────────────────────────

  /**
   * Get notifications for a user with pagination.
   */
  async getNotifications(userId, opts) {
    opts = opts || {};
    const page = opts.page || 1;
    const limit = opts.limit || 20;
    const unreadOnly = opts.unreadOnly || false;
    const skip = (page - 1) * limit;

    const filter = { recipient: userId };
    if (unreadOnly) filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).populate('sender', 'name username avatar').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: userId, isRead: false }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getUnreadCount(userId) {
    return Notification.countDocuments({ recipient: userId, isRead: false });
  }

  async markAsRead(notificationId, userId) {
    const result = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    // Populate sender if result exists and has populate method
    if (result && typeof result.populate === 'function') {
      return result.populate('sender', 'name username avatar');
    }
    return result;
  }

  async markAllAsRead(userId) {
    const result = await Notification.updateMany(
      { recipient: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    return result.modifiedCount;
  }

  async deleteAll(userId) {
    const result = await Notification.deleteMany({ recipient: userId });
    return result.deletedCount;
  }

  getEventTypes() {
    return Object.values(NOTIFICATION_TYPE);
  }
}

module.exports = new NotificationService();
