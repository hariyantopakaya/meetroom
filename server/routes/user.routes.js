const express = require('express');
const { z } = require('zod');
const userService = require('../services/userService');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');

const router = express.Router();

// Enforce admin role for all user management routes
router.use(authenticate, requireAdmin);

const createUserSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  company: z.string().optional(),
  role: z.enum(['ADMIN', 'RECEPTIONIST', 'USER']).default('USER'),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  company: z.string().optional(),
  role: z.enum(['ADMIN', 'RECEPTIONIST', 'USER']).optional(),
});

// List users (Admin)
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';

    const result = await userService.listUsers({ page, limit, search, role, status });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Create new user (Admin)
router.post('/', async (req, res, next) => {
  try {
    const validated = createUserSchema.parse(req.body);
    const user = await userService.createUser(validated);
    res.status(201).json({
      message: 'User created successfully.',
      user,
    });
  } catch (err) {
    next(err);
  }
});

// Update user (Admin)
router.put('/:id', async (req, res, next) => {
  try {
    const validated = updateUserSchema.parse(req.body);
    const user = await userService.updateUser(req.params.id, validated);
    res.json({
      message: 'User updated successfully.',
      user,
    });
  } catch (err) {
    next(err);
  }
});

// Toggle user status (Admin)
router.put('/:id/status', async (req, res, next) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive boolean value is required.' });
    }
    const user = await userService.toggleUserStatus(req.params.id, isActive);
    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully.`,
      user,
    });
  } catch (err) {
    next(err);
  }
});

// Reset user password (Admin)
router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { password } = req.body;
    const result = await userService.resetUserPassword(req.params.id, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
