const assert = require('assert');
const app = require('../server/app');
const prisma = require('../server/db/prisma');
const bookingService = require('../server/services/bookingService');
const authService = require('../server/services/authService');
const exportService = require('../server/services/exportService');

let server;
let port = 3099;
let baseUrl = `http://localhost:${port}`;

async function runTests() {
  console.log('🧪 Starting Booking Meeting automated test suite...\n');

  // Start temporary server
  await new Promise((resolve) => {
    server = app.listen(port, resolve);
  });

  let passCount = 0;
  let failCount = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`  ▶ ${name}... `);
      await fn();
      console.log('✅ PASSED');
      passCount++;
    } catch (err) {
      console.log('❌ FAILED');
      console.error('    Error:', err.message);
      failCount++;
    }
  }

  try {
    // ----------------------------------------------------
    // 1. Overlap Algorithm Unit Tests
    // ----------------------------------------------------
    console.log('--- 1. Overlap Conflict Detection Logic ---');

    await test('Existing 10:00-11:00 rejects 09:30-10:30', async () => {
      const overlap = bookingService.isOverlapping('09:30', '10:30', '10:00', '11:00');
      assert.strictEqual(overlap, true);
    });

    await test('Existing 10:00-11:00 rejects 10:00-10:30 (inside)', async () => {
      const overlap = bookingService.isOverlapping('10:00', '10:30', '10:00', '11:00');
      assert.strictEqual(overlap, true);
    });

    await test('Existing 10:00-11:00 rejects 10:30-11:30', async () => {
      const overlap = bookingService.isOverlapping('10:30', '11:30', '10:00', '11:00');
      assert.strictEqual(overlap, true);
    });

    await test('Existing 10:00-11:00 rejects 09:00-11:00 (enclosing)', async () => {
      const overlap = bookingService.isOverlapping('09:00', '11:00', '10:00', '11:00');
      assert.strictEqual(overlap, true);
    });

    await test('Existing 10:00-11:00 accepts 08:00-10:00 (adjacent before)', async () => {
      const overlap = bookingService.isOverlapping('08:00', '10:00', '10:00', '11:00');
      assert.strictEqual(overlap, false);
    });

    await test('Existing 10:00-11:00 accepts 11:00-12:00 (adjacent after)', async () => {
      const overlap = bookingService.isOverlapping('11:00', '12:00', '10:00', '11:00');
      assert.strictEqual(overlap, false);
    });

    // ----------------------------------------------------
    // 2. Authentication & RBAC Tests
    // ----------------------------------------------------
    console.log('\n--- 2. Authentication & RBAC Tests ---');

    let adminToken, userToken;

    await test('Admin login returns valid JWT and user info', async () => {
      const { user, token } = await authService.loginUser({
        email: 'sarah@admin.local',
        password: 'password123',
      });
      assert.strictEqual(user.role, 'ADMIN');
      assert.ok(token);
      adminToken = token;
    });

    await test('User login returns valid JWT and user info', async () => {
      const { user, token } = await authService.loginUser({
        email: 'budi@teknologimaju.com',
        password: 'password123',
      });
      assert.strictEqual(user.role, 'USER');
      assert.ok(token);
      userToken = token;
    });

    await test('Invalid password rejected with 401', async () => {
      try {
        await authService.loginUser({
          email: 'budi@teknologimaju.com',
          password: 'wrongpassword',
        });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.strictEqual(err.statusCode, 401);
      }
    });

    await test('Regular user blocked from Admin User Management API (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/users`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    await test('Admin successfully accesses User Management API (200 OK)', async () => {
      const res = await fetch(`${baseUrl}/api/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.users.length > 0);
    });

    // ----------------------------------------------------
    // 3. Booking Creation & Conflict Prevention Tests
    // ----------------------------------------------------
    console.log('\n--- 3. Database Booking & Concurrency Conflict Tests ---');

    const testDate = '2026-10-15';

    // Clean any previous test bookings for that testDate and reschedule date
    await prisma.booking.deleteMany({ where: { bookingDate: { in: ['2026-10-15', '2026-10-16'] } } });

    let createdBookingId;

    await test('Create valid booking (10:00 – 11:00) on 2026-10-15 succeeds', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          date: testDate,
          startTime: '10:00',
          endTime: '11:00',
          topic: 'Initial Automated Test Booking',
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.booking.status, 'CONFIRMED');
      createdBookingId = data.booking.id;
    });

    await test('Attempting overlapping booking (10:30 – 11:30) is REJECTED with 409 Conflict', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          date: testDate,
          startTime: '10:30',
          endTime: '11:30',
          topic: 'Conflicting Booking Attempt',
        }),
      });

      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.ok(data.error.includes('unavailable'));
      assert.ok(data.conflictingBooking);
      assert.strictEqual(data.conflictingBooking.time, '10:00 – 11:00');
    });

    await test('Attempting non-overlapping booking (11:00 – 12:00) SUCCEEDS', async () => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          date: testDate,
          startTime: '11:00',
          endTime: '12:00',
          topic: 'Adjacent Non-conflicting Booking',
        }),
      });

      assert.strictEqual(res.status, 201);
    });

    // ----------------------------------------------------
    // 4. Reschedule Business Rule Tests
    // ----------------------------------------------------
    console.log('\n--- 4. Reschedule Business Rule Tests ---');

    await test('Rescheduling $> 1$ day in future (2026-10-15 booking) to 2026-10-16 SUCCEEDS', async () => {
      const res = await fetch(`${baseUrl}/api/bookings/${createdBookingId}/reschedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          newDate: '2026-10-16',
          newStartTime: '14:00',
          newEndTime: '15:30',
          reason: 'Client requested postponement',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.booking.status, 'RESCHEDULED');
      assert.strictEqual(data.booking.bookingDate, '2026-10-16');
      assert.strictEqual(data.booking.startTime, '14:00');
    });

    await test('Rescheduling booking on the same day is REJECTED by 1-day rule', async () => {
      // Create a booking with today's date
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const sameDayBooking = await prisma.booking.create({
        data: {
          userId: (await prisma.user.findFirst({ where: { role: 'USER' } })).id,
          roomId: (await prisma.room.findFirst()).id,
          bookingDate: todayStr,
          startTime: '16:00',
          endTime: '17:00',
          topic: 'Same Day Meeting',
          status: 'CONFIRMED',
        },
      });

      const res = await fetch(`${baseUrl}/api/bookings/${sameDayBooking.id}/reschedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          newDate: '2026-11-01',
          newStartTime: '09:00',
          newEndTime: '10:00',
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('1 day'));
    });

    // ----------------------------------------------------
    // 5. Password Reset Flow Tests
    // ----------------------------------------------------
    console.log('\n--- 5. Password Reset Flow Tests ---');

    await test('Password reset request does not leak non-existent email', async () => {
      const result = await authService.requestPasswordReset('nonexistent@random.com');
      assert.strictEqual(result.success, true);
      assert.ok(result.message.includes('If your email is registered'));
    });

    await test('Password reset token generates and can be used once', async () => {
      const testEmail = 'budi@teknologimaju.com';
      await authService.requestPasswordReset(testEmail);

      // Fetch the token hash directly from db for testing
      const tokenRecord = await prisma.passwordResetToken.findFirst({
        where: { used: false },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(tokenRecord);
      assert.strictEqual(tokenRecord.used, false);
    });

    // ----------------------------------------------------
    // 6. Export Reports Generation Tests
    // ----------------------------------------------------
    console.log('\n--- 6. Excel & PDF Export Tests ---');

    await test('Generate Excel monthly booking report buffer', async () => {
      const buffer = await exportService.exportBookingsExcel({ month: 8, year: 2026 });
      assert.ok(buffer);
      assert.ok(buffer.length > 1000);
    });

    await test('Generate PDF monthly booking report buffer', async () => {
      const buffer = await exportService.exportBookingsPdf({ month: 8, year: 2026 });
      assert.ok(buffer);
      assert.ok(buffer.length > 1000);
    });

    await test('Generate Excel User Management directory without password fields', async () => {
      const buffer = await exportService.exportUsersExcel();
      assert.ok(buffer);
      assert.ok(buffer.length > 1000);
    });

    await test('Generate PDF User Management directory', async () => {
      const buffer = await exportService.exportUsersPdf();
      assert.ok(buffer);
      assert.ok(buffer.length > 1000);
    });

    console.log('\n====================================================');
    console.log(`🎉 TEST SUMMARY: ${passCount} Passed, ${failCount} Failed.`);
    console.log('====================================================');

    if (failCount > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
