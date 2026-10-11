const express = require('express');
const { z } = require('zod');
const bookingService = require('../services/bookingService');
const { authenticate } = require('../middleware/auth');
const { bookingLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const bookingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid start time format (HH:mm)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid end time format (HH:mm)'),
  topic: z.string().min(3, 'Meeting topic must be at least 3 characters'),
  forUserId: z.string().optional(), // Allow staff/admin to book on behalf of user
  wifiSsid: z.string().optional().nullable(),
  wifiPassword: z.string().optional().nullable(),
});

const rescheduleSchema = z.object({
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  newStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid start time format (HH:mm)'),
  newEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid end time format (HH:mm)'),
  reason: z.string().optional(),
});

// Check availability for a time slot without booking
router.post('/check-availability', authenticate, async (req, res, next) => {
  try {
    const { date, startTime, endTime, excludeBookingId } = req.body;
    if (!date || !startTime || !endTime) {
      return res.status(400).json({ error: 'Date, start time, and end time are required.' });
    }
    const result = await bookingService.checkConflict(date, startTime, endTime, excludeBookingId);
    res.json({
      available: !result.hasConflict,
      conflictingBooking: result.conflictingBooking
        ? {
            topic: result.conflictingBooking.topic,
            client: result.conflictingBooking.user?.fullName,
            company: result.conflictingBooking.user?.company,
            time: `${result.conflictingBooking.startTime} – ${result.conflictingBooking.endTime}`,
            date: result.conflictingBooking.bookingDate,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// List bookings (paginated & filtered)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || '';
    const status = req.query.status || 'ALL';
    const startDate = req.query.startDate || '';
    const endDate = req.query.endDate || '';

    // If normal user, by default they see all in calendar, but can filter to own in list
    const filterUserId = req.query.myBookingsOnly === 'true' || req.user.role === 'USER' ? req.user.id : null;

    const result = await bookingService.getBookings({
      page,
      limit,
      search,
      status,
      startDate,
      endDate,
      userId: filterUserId,
      userRole: req.user.role,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Create new booking
router.post('/', authenticate, bookingLimiter, async (req, res, next) => {
  try {
    const validated = bookingSchema.parse(req.body);

    // Target user ID: normal user creates for self; admin/receptionist can specify user or book for self
    let targetUserId = req.user.id;
    if (['ADMIN', 'RECEPTIONIST'].includes(req.user.role) && validated.forUserId) {
      targetUserId = validated.forUserId;
    }

    const booking = await bookingService.createBooking({
      userId: targetUserId,
      date: validated.date,
      startTime: validated.startTime,
      endTime: validated.endTime,
      topic: validated.topic,
      wifiSsid: validated.wifiSsid,
      wifiPassword: validated.wifiPassword,
    });

    res.status(201).json({
      message: 'Booking successfully confirmed!',
      booking,
    });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({
        error: err.message,
        conflictingBooking: err.conflictingBooking,
      });
    }
    next(err);
  }
});

// Get booking by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const booking = await bookingService.getBookingById(req.params.id);
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

// Reschedule booking
router.put('/:id/reschedule', authenticate, bookingLimiter, async (req, res, next) => {
  try {
    const validated = rescheduleSchema.parse(req.body);

    const booking = await bookingService.rescheduleBooking({
      bookingId: req.params.id,
      userId: req.user.id,
      userRole: req.user.role,
      newDate: validated.newDate,
      newStartTime: validated.newStartTime,
      newEndTime: validated.newEndTime,
      reason: validated.reason,
    });

    res.json({
      message: 'Booking rescheduled successfully!',
      booking,
    });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({
        error: err.message,
        conflictingBooking: err.conflictingBooking,
      });
    }
    next(err);
  }
});

// Cancel booking
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const booking = await bookingService.cancelBooking({
      bookingId: req.params.id,
      userId: req.user.id,
      userRole: req.user.role,
    });

    res.json({
      message: 'Booking cancelled successfully.',
      booking,
    });
  } catch (err) {
    next(err);
  }
});

// Update Wi-Fi credentials for an existing booking
router.patch('/:id/wifi', authenticate, async (req, res, next) => {
  try {
    const { wifiSsid, wifiPassword } = req.body;
    const booking = await bookingService.updateWifi(
      req.params.id,
      { wifiSsid, wifiPassword },
      req.user
    );

    res.json({
      message: 'Wi-Fi credentials updated successfully!',
      booking,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
