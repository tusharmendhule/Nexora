const User = require('../../models/user.model');
const { ApiError } = require('../../middleware/error.middleware');
const auditService = require('../../services/audit.service');
const notificationService = require('../../services/notification.service');

class AdminController {
  /**
   * GET /api/v1/admin/users
   * List all users with pagination and search.
   */
  async listUsers(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const search = req.query.search || '';
      const skip = (page - 1) * limit;

      const filter = {};
      if (search && typeof search === 'string') {
        // Escape regex special characters to prevent NoSQL injection
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { name: { $regex: escaped, $options: 'i' } },
          { username: { $regex: escaped, $options: 'i' } },
          { email: { $regex: escaped, $options: 'i' } },
        ];
      }

      const users = await User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await User.countDocuments(filter);

      res.status(200).json({
        success: true,
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/users/:id/role
   * Change a user's role.
   * Body: { role: 'USER' | 'MODERATOR' | 'ADMIN' }
   */
  async updateRole(req, res, next) {
    try {
      const { role } = req.body;
      const validRoles = ['USER', 'MODERATOR', 'ADMIN'];

      if (!role || !validRoles.includes(role)) {
        throw new ApiError(400, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
      }

      // Prevent self-demotion from ADMIN (optional safety check)
      if (req.user._id.toString() === req.params.id && role !== 'ADMIN') {
        throw new ApiError(400, 'Admins cannot change their own role');
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      // Audit: log role change (non-critical)
      try {
        await auditService.logAdminEvent({
          eventType: 'USER_ROLE_CHANGED',
          admin: { _id: req.user._id, username: req.user.username },
          target: { _id: user._id, username: user.username },
          details: { newRole: role },
          request: req.auditContext || null,
        });
      } catch (_) { /* audit logging is non-critical */ }

      // Notify affected user (non-critical)
      try {
        await notificationService.notifyAccountSecurity({
          userId: user._id,
          adminId: req.user._id,
          eventType: 'USER_ROLE_CHANGED',
          details: { newRole: role },
        });
      } catch (_) { /* notification is non-critical */ }

      res.status(200).json({
        success: true,
        message: `User role updated to ${role}`,
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/users/:id/disable
   * Disable a user account.
   */
  async disableUser(req, res, next) {
    try {
      if (req.user._id.toString() === req.params.id) {
        throw new ApiError(400, 'Cannot disable your own account');
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isDisabled: true },
        { new: true }
      ).select('-password');

      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      // Audit: log user disable (non-critical)
      try {
        await auditService.logAdminEvent({
          eventType: 'USER_DISABLED',
          admin: { _id: req.user._id, username: req.user.username },
          target: { _id: user._id, username: user.username },
          request: req.auditContext || null,
        });
      } catch (_) { /* audit logging is non-critical */ }

      // Notify affected user (non-critical)
      try {
        await notificationService.notifyAccountSecurity({
          userId: user._id,
          adminId: req.user._id,
          eventType: 'USER_DISABLED',
        });
      } catch (_) { /* notification is non-critical */ }

      res.status(200).json({
        success: true,
        message: 'User account has been disabled',
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/users/:id/enable
   * Re-enable a disabled user account.
   */
  async enableUser(req, res, next) {
    try {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isDisabled: false },
        { new: true }
      ).select('-password');

      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      // Audit: log user enable (non-critical)
      try {
        await auditService.logAdminEvent({
          eventType: 'USER_ENABLED',
          admin: { _id: req.user._id, username: req.user.username },
          target: { _id: user._id, username: user.username },
          request: req.auditContext || null,
        });
      } catch (_) { /* audit logging is non-critical */ }

      // Notify affected user (non-critical)
      try {
        await notificationService.notifyAccountSecurity({
          userId: user._id,
          adminId: req.user._id,
          eventType: 'USER_ENABLED',
        });
      } catch (_) { /* notification is non-critical */ }

      res.status(200).json({
        success: true,
        message: 'User account has been re-enabled',
        user,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();
