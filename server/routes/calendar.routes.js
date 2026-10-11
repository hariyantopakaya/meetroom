const express = require('express');
const bookingService = require('../services/bookingService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get calendar events for date range
router.get('/events', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate query parameters are required.' });
    }

    const events = await bookingService.getCalendarEvents({ startDate, endDate });
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// Get dashboard summary stats & today schedule
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const stats = await bookingService.getDashboardStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
