const jwt = require('jsonwebtoken');
const config = require('../config/env');
const prisma = require('../db/prisma');

async function authenticate(req, res, next) {
  try {
    let token = req.cookies?.token;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }

    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        company: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account has been deactivated. Please contact administrator.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

// Optional auth for public calendar / checking without throwing
async function optionalAuth(req, res, next) {
  try {
    let token = req.cookies?.token;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (token) {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, fullName: true, company: true, role: true, isActive: true },
      });
      if (user && user.isActive) {
        req.user = user;
      }
    }
  } catch {
    // Ignore invalid token in optional mode
  }
  next();
}

module.exports = {
  authenticate,
  optionalAuth,
};
