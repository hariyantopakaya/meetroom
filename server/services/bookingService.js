const prisma = require('../db/prisma');
const emailService = require('./emailService');

// Helper to check if two time ranges overlap
// [s1, e1) and [s2, e2) overlap iff (s1 < e2) && (s2 < e1)
function isOverlapping(s1, e1, s2, e2) {
  return s1 < e2 && s2 < e1;
}

// Get or ensure primary single room exists
async function getPrimaryRoom() {
  let room = await prisma.room.findFirst({
    where: { isActive: true },
  });

  if (!room) {
    room = await prisma.room.create({
      data: {
        name: 'Main Conference Room',
        description: 'Single dedicated meeting room for reservations.',
        capacity: 12,
        isActive: true,
      },
    });
  }

  return room;
}

/**
 * Check if the requested time slot has any conflict with existing active bookings.
 * @param {string} date "YYYY-MM-DD"
 * @param {string} startTime "HH:mm"
 * @param {string} endTime "HH:mm"
 * @param {string|null} excludeBookingId
 * @returns {Promise<{ hasConflict: boolean, conflictingBooking: object|null }>}
 */
async function checkConflict(date, startTime, endTime, excludeBookingId = null) {
  if (startTime >= endTime) {
    const error = new Error('End time must be after start time.');
    error.statusCode = 400;
    throw error;
  }

  // Find all active bookings on the same date
  const existingBookings = await prisma.booking.findMany({
    where: {
      bookingDate: date,
      status: { in: ['CONFIRMED', 'RESCHEDULED'] },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    include: {
      user: {
        select: { fullName: true, company: true, email: true },
      },
    },
  });

  for (const existing of existingBookings) {
    if (isOverlapping(startTime, endTime, existing.startTime, existing.endTime)) {
      return {
        hasConflict: true,
        conflictingBooking: existing,
      };
    }
  }

  return {
    hasConflict: false,
    conflictingBooking: null,
  };
}

/**
 * Create a new meeting room booking.
 */
async function createBooking({ userId, date, startTime, endTime, topic, wifiSsid, wifiPassword }) {
  if (!date || !startTime || !endTime || !topic) {
    const error = new Error('All booking fields are required (date, start time, end time, topic).');
    error.statusCode = 400;
    throw error;
  }

  if (startTime >= endTime) {
    const error = new Error('End time must be strictly after start time.');
    error.statusCode = 400;
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }

  const room = await getPrimaryRoom();

  // Concurrency-safe atomic transaction
  return await prisma.$transaction(async (tx) => {
    // 1. Re-query existing bookings inside transaction
    const existingBookings = await tx.booking.findMany({
      where: {
        roomId: room.id,
        bookingDate: date,
        status: { in: ['CONFIRMED', 'RESCHEDULED'] },
      },
      include: {
        user: { select: { fullName: true, company: true, email: true } },
      },
    });

    const conflict = existingBookings.find((b) =>
      isOverlapping(startTime, endTime, b.startTime, b.endTime)
    );

    if (conflict) {
      // Send conflict alert email asynchronously
      emailService.sendConflictNotification({
        requestedDate: date,
        requestedStartTime: startTime,
        requestedEndTime: endTime,
        topic,
        user,
        conflictingBooking: conflict,
      }).catch((e) => console.error('Failed to dispatch conflict email:', e));

      const error = new Error('Meeting room is unavailable for the selected time range because it has already been reserved by another client.');
      error.statusCode = 409; // Conflict
      error.conflictingBooking = {
        topic: conflict.topic,
        client: conflict.user?.fullName,
        company: conflict.user?.company,
        time: `${conflict.startTime} – ${conflict.endTime}`,
        date: conflict.bookingDate,
      };
      throw error;
    }

    // 2. Create the confirmed booking
    const booking = await tx.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        bookingDate: date,
        startTime,
        endTime,
        topic: topic.trim(),
        status: 'CONFIRMED',
        rescheduleCount: 0,
        wifiSsid: wifiSsid ? String(wifiSsid).trim() : null,
        wifiPassword: wifiPassword ? String(wifiPassword).trim() : null,
      },
      include: {
        user: {
          select: { id: true, fullName: true, company: true, email: true },
        },
        room: {
          select: { id: true, name: true },
        },
      },
    });

    // 3. Send confirmation email
    emailService.sendBookingConfirmation({ booking, user }).catch((e) =>
      console.error('Failed to dispatch confirmation email:', e)
    );

    return booking;
  });
}

/**
 * Reschedule an existing booking.
 * Enforces business rule: Reschedule request must be submitted at least ONE DAY BEFORE meeting date.
 */
async function rescheduleBooking({ bookingId, userId, userRole, newDate, newStartTime, newEndTime, reason }) {
  if (!newDate || !newStartTime || !newEndTime) {
    const error = new Error('New date, start time, and end time are required.');
    error.statusCode = 400;
    throw error;
  }

  if (newStartTime >= newEndTime) {
    const error = new Error('End time must be strictly after start time.');
    error.statusCode = 400;
    throw error;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      room: true,
    },
  });

  if (!booking) {
    const error = new Error('Booking not found.');
    error.statusCode = 404;
    throw error;
  }

  // Authorization check: User can only reschedule their own bookings, staff/admin can reschedule any
  if (userRole === 'USER' && booking.userId !== userId) {
    const error = new Error('Access denied. You can only reschedule your own bookings.');
    error.statusCode = 403;
    throw error;
  }

  if (booking.status === 'CANCELLED') {
    const error = new Error('Cannot reschedule a cancelled booking.');
    error.statusCode = 400;
    throw error;
  }

  // === BUSINESS RULE: AT LEAST ONE DAY BEFORE MEETING DATE ===
  // Compare booking date with current date.
  // If meeting is on 2026-09-10, reschedule is forbidden on 2026-09-10 or later.
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
  const currentDay = String(today.getDate()).padStart(2, '0');
  const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;

  if (booking.bookingDate <= todayStr) {
    const error = new Error('Reschedule request rejected: Rescheduling is only allowed at least 1 day before the scheduled meeting date.');
    error.statusCode = 400;
    throw error;
  }

  // Atomic transaction to verify no conflicts and execute reschedule
  return await prisma.$transaction(async (tx) => {
    // 1. Conflict checking on new slot
    const existingBookings = await tx.booking.findMany({
      where: {
        roomId: booking.roomId,
        bookingDate: newDate,
        status: { in: ['CONFIRMED', 'RESCHEDULED'] },
        id: { not: booking.id }, // Exclude self
      },
      include: {
        user: { select: { fullName: true, company: true, email: true } },
      },
    });

    const conflict = existingBookings.find((b) =>
      isOverlapping(newStartTime, newEndTime, b.startTime, b.endTime)
    );

    if (conflict) {
      // Send conflict notification
      emailService.sendConflictNotification({
        requestedDate: newDate,
        requestedStartTime: newStartTime,
        requestedEndTime: newEndTime,
        topic: booking.topic,
        user: booking.user,
        conflictingBooking: conflict,
      }).catch((e) => console.error('Failed to dispatch conflict email:', e));

      const error = new Error('Meeting room is unavailable for the selected time range because it has already been reserved by another client.');
      error.statusCode = 409;
      error.conflictingBooking = {
        topic: conflict.topic,
        client: conflict.user?.fullName,
        company: conflict.user?.company,
        time: `${conflict.startTime} – ${conflict.endTime}`,
        date: conflict.bookingDate,
      };
      throw error;
    }

    const oldDate = booking.bookingDate;
    const oldStartTime = booking.startTime;
    const oldEndTime = booking.endTime;

    // 2. Update booking
    const updatedBooking = await tx.booking.update({
      where: { id: booking.id },
      data: {
        bookingDate: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
        status: 'RESCHEDULED',
        originalDate: booking.originalDate || oldDate,
        originalStartTime: booking.originalStartTime || oldStartTime,
        originalEndTime: booking.originalEndTime || oldEndTime,
        rescheduleCount: booking.rescheduleCount + 1,
      },
      include: {
        user: { select: { id: true, fullName: true, company: true, email: true } },
        room: { select: { id: true, name: true } },
      },
    });

    // 3. Record in audit history
    await tx.rescheduleHistory.create({
      data: {
        bookingId: booking.id,
        oldDate,
        oldStartTime,
        oldEndTime,
        newDate,
        newStartTime,
        newEndTime,
        reason: reason ? reason.trim() : 'Client requested reschedule',
      },
    });

    // 4. Send email notification
    emailService.sendRescheduleNotification({
      booking: updatedBooking,
      user: booking.user,
      oldDate,
      oldStartTime,
      oldEndTime,
    }).catch((e) => console.error('Failed to dispatch reschedule email:', e));

    return updatedBooking;
  });
}

/**
 * Cancel a booking.
 */
async function cancelBooking({ bookingId, userId, userRole }) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { user: true },
  });

  if (!booking) {
    const error = new Error('Booking not found.');
    error.statusCode = 404;
    throw error;
  }

  if (userRole === 'USER' && booking.userId !== userId) {
    const error = new Error('Access denied. You can only cancel your own bookings.');
    error.statusCode = 403;
    throw error;
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED' },
    include: {
      user: { select: { id: true, fullName: true, company: true, email: true } },
    },
  });

  return updated;
}

/**
 * Get booking by ID.
 */
async function getBookingById(id) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, fullName: true, company: true, email: true, role: true },
      },
      room: true,
      rescheduleHistories: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!booking) {
    const error = new Error('Booking not found.');
    error.statusCode = 404;
    throw error;
  }

  return booking;
}

/**
 * Get paginated & filtered list of bookings.
 */
async function getBookings({
  page = 1,
  limit = 10,
  search = '',
  status = 'ALL',
  startDate = '',
  endDate = '',
  userId = null,
  userRole = 'USER',
}) {
  const skip = (page - 1) * limit;
  const where = {};

  // Role visibility: Normal users only see their own in table if requested, or if staff they see all
  if (userRole === 'USER' && userId) {
    where.userId = userId;
  }

  if (status && status !== 'ALL') {
    where.status = status.toUpperCase();
  }

  if (startDate && endDate) {
    where.bookingDate = {
      gte: startDate,
      lte: endDate,
    };
  } else if (startDate) {
    where.bookingDate = { gte: startDate };
  } else if (endDate) {
    where.bookingDate = { lte: endDate };
  }

  if (search) {
    const s = search.trim();
    where.OR = [
      { topic: { contains: s } },
      { user: { fullName: { contains: s } } },
      { user: { company: { contains: s } } },
    ];
  }

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ bookingDate: 'desc' }, { startTime: 'asc' }],
      include: {
        user: {
          select: { id: true, fullName: true, company: true, email: true },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    bookings,
  };
}

/**
 * Get calendar events for a specific date range.
 */
async function getCalendarEvents({ startDate, endDate }) {
  const bookings = await prisma.booking.findMany({
    where: {
      bookingDate: {
        gte: startDate,
        lte: endDate,
      },
      status: { in: ['CONFIRMED', 'RESCHEDULED'] },
    },
    include: {
      user: {
        select: { id: true, fullName: true, company: true, email: true },
      },
    },
    orderBy: { startTime: 'asc' },
  });

  return bookings;
}

/**
 * Get dashboard overview statistics.
 */
async function getDashboardStats() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const firstDayOfMonth = `${year}-${month}-01`;
  const lastDayOfMonth = `${year}-${month}-31`;

  // Fetch today's schedule
  const todayBookings = await prisma.booking.findMany({
    where: {
      bookingDate: todayStr,
      status: { in: ['CONFIRMED', 'RESCHEDULED'] },
    },
    include: {
      user: { select: { fullName: true, company: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  // Calculate stats
  const totalUsers = await prisma.user.count({ where: { isActive: true } });
  const thisMonthBookingsCount = await prisma.booking.count({
    where: {
      bookingDate: { gte: firstDayOfMonth, lte: lastDayOfMonth },
    },
  });

  const rescheduledCount = await prisma.booking.count({
    where: {
      bookingDate: { gte: firstDayOfMonth, lte: lastDayOfMonth },
      status: 'RESCHEDULED',
    },
  });

  const cancelledCount = await prisma.booking.count({
    where: {
      bookingDate: { gte: firstDayOfMonth, lte: lastDayOfMonth },
      status: 'CANCELLED',
    },
  });

  // Calculate today's used minutes
  let todayMinutes = 0;
  todayBookings.forEach((b) => {
    const [sh, sm] = b.startTime.split(':').map(Number);
    const [eh, em] = b.endTime.split(':').map(Number);
    todayMinutes += (eh * 60 + em) - (sh * 60 + sm);
  });

  const operatingHoursMinutes = 10 * 60; // 08:00 to 18:00 = 10 hours
  const occupancyRate = Math.min(100, Math.round((todayMinutes / operatingHoursMinutes) * 100)) || 0;
  const avgHours = (todayMinutes / 60).toFixed(1);

  return {
    todayStr,
    todayBookingsCount: todayBookings.length,
    totalUsers,
    avgDailyUsage: `${avgHours}h`,
    occupancyRate: `${occupancyRate}%`,
    occupancyPercent: occupancyRate,
    thisMonthBookingsCount,
    rescheduledCount,
    cancelledCount,
    todaySchedule: todayBookings,
  };
}

/**
 * Update Wi-Fi voucher credentials for a booking.
 */
async function updateWifi(bookingId, { wifiSsid, wifiPassword }, user) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    const error = new Error('Booking not found.');
    error.statusCode = 404;
    throw error;
  }

  // Permission check: owner or staff/admin
  if (booking.userId !== user.id && !['ADMIN', 'RECEPTIONIST'].includes(user.role)) {
    const error = new Error('You are not authorized to update Wi-Fi credentials for this booking.');
    error.statusCode = 403;
    throw error;
  }

  return await prisma.booking.update({
    where: { id: bookingId },
    data: {
      wifiSsid: wifiSsid ? String(wifiSsid).trim() : null,
      wifiPassword: wifiPassword ? String(wifiPassword).trim() : null,
    },
    include: {
      user: { select: { id: true, fullName: true, company: true, email: true } },
      room: { select: { id: true, name: true } },
    },
  });
}

module.exports = {
  checkConflict,
  createBooking,
  rescheduleBooking,
  cancelBooking,
  getBookingById,
  getBookings,
  getCalendarEvents,
  getDashboardStats,
  isOverlapping,
  updateWifi,
};
