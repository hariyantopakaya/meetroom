const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db/prisma');
const config = require('../config/env');
const emailService = require('./emailService');

function generateJwt(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

async function registerUser({ email, password, fullName, company }) {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    const error = new Error('An account with this email address already exists.');
    error.statusCode = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash: hashedPassword,
      fullName: fullName.trim(),
      company: company ? company.trim() : 'Independent',
      role: 'USER',
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      company: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const token = generateJwt(user);
  return { user, token };
}

async function loginUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error('This account has been deactivated. Please contact support or your administrator.');
    error.statusCode = 403;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  const token = generateJwt(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      company: user.company,
      role: user.role,
      isActive: user.isActive,
    },
    token,
  };
}

async function requestPasswordReset(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Security: Do NOT reveal if email exists or not
  if (!user || !user.isActive) {
    return { success: true, message: 'If your email is registered with us, a password reset link has been sent.' };
  }

  // Generate random secure token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Invalidate previous unused tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  // Save new token
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      used: false,
    },
  });

  // Send email
  await emailService.sendPasswordResetEmail({ user, resetToken: rawToken });

  return {
    success: true,
    message: 'If your email is registered with us, a password reset link has been sent.',
  };
}

async function resetPassword({ token, newPassword }) {
  if (!token || !newPassword) {
    const error = new Error('Token and new password are required.');
    error.statusCode = 400;
    throw error;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const resetRecord = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      used: false,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!resetRecord || !resetRecord.user) {
    const error = new Error('Invalid or expired password reset link. Please request a new one.');
    error.statusCode = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update password and mark token used in a transaction
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash: hashedPassword },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { used: true },
    }),
  ]);

  return { success: true, message: 'Password has been successfully updated. You can now sign in.' };
}

module.exports = {
  generateJwt,
  registerUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
};
