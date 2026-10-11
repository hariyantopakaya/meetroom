const express = require('express');
const { z } = require('zod');
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const registerSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  company: z.string().min(1, 'Company name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const validated = registerSchema.parse(req.body);
    const { user, token } = await authService.registerUser(validated);

    // Set secure HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      message: 'Account created successfully.',
      user,
      token,
    });
  } catch (err) {
    next(err);
  }
});

// Login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const validated = loginSchema.parse(req.body);
    const { user, token } = await authService.loginUser(validated);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Login successful.',
      user,
      token,
    });
  } catch (err) {
    next(err);
  }
});

// Forgot Password
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const validated = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(validated.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Reset Password
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const validated = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword({
      token: validated.token,
      newPassword: validated.password,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get Current User Profile
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Signed out successfully.' });
});

module.exports = router;
