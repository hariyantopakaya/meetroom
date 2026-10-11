const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes window
  max: 100, // Limit each IP to 100 requests per windowMs for auth routes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again after 2 minutes.',
  },
});

const bookingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please slow down.',
  },
});

module.exports = {
  authLimiter,
  bookingLimiter,
};
