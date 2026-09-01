const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/authorize.middleware');
const { validateObjectId } = require('../../middleware/validate.middleware');
const adminController = require('../../controllers/v1/admin.controller');

// All admin routes require authentication + ADMIN role
router.use(protect, requireRole('ADMIN'));

// GET /api/v1/admin/users
router.get('/users', adminController.listUsers);

// PATCH /api/v1/admin/users/:id/role
router.patch('/users/:id/role', validateObjectId('id'), adminController.updateRole);

// PATCH /api/v1/admin/users/:id/disable
router.patch('/users/:id/disable', validateObjectId('id'), adminController.disableUser);

// PATCH /api/v1/admin/users/:id/enable
router.patch('/users/:id/enable', validateObjectId('id'), adminController.enableUser);

module.exports = router;
