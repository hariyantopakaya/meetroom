const assert = require('assert');
const app = require('../server/app');
const prisma = require('../server/db/prisma');

let server;
const port = 3088;
const baseUrl = `http://localhost:${port}`;

async function runE2EValidation() {
  console.log('🚀 Running Full E2E Functional Validation across ALL Roles & Features...\n');

  await new Promise((resolve) => {
    server = app.listen(port, resolve);
  });

  // Clean up any previous test dates
  await prisma.booking.deleteMany({
    where: {
      bookingDate: { in: ['2026-11-20', '2026-11-21', '2026-11-25'] },
    },
  });

  try {
    // ----------------------------------------------------
    // 1. Regular User Registration & Session
    // ----------------------------------------------------
    console.log('1. Testing User Registration & Authentication...');
    const userRegEmail = `testuser_${Date.now()}@corporate.com`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Alex Test Client',
        company: 'PT Global Solusi',
        email: userRegEmail,
        password: 'password123',
      }),
    });
    assert.strictEqual(regRes.status, 201);
    const regData = await regRes.json();
    const userCookie = regRes.headers.get('set-cookie');
    assert.ok(regData.user);
    assert.strictEqual(regData.user.role, 'USER');
    console.log('   ✅ User registered successfully with role USER');

    // Check /api/auth/me session
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: userCookie },
    });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.user.email, userRegEmail);
    console.log('   ✅ Auth session verified via Cookie');

    // ----------------------------------------------------
    // 2. User Creates Booking & Live Availability Check
    // ----------------------------------------------------
    console.log('\n2. Testing Booking Creation & Live Availability...');
    const bookingDate = '2026-11-20';

    // Live availability check before booking
    const checkRes1 = await fetch(`${baseUrl}/api/bookings/check-availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookie,
      },
      body: JSON.stringify({
        date: bookingDate,
        startTime: '09:00',
        endTime: '11:00',
      }),
    });
    const checkData1 = await checkRes1.json();
    assert.strictEqual(checkData1.available, true);
    console.log('   ✅ Availability check: slot 09:00-11:00 is free');

    // Create booking
    const createRes = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookie,
      },
      body: JSON.stringify({
        date: bookingDate,
        startTime: '09:00',
        endTime: '11:00',
        topic: 'Executive Strategy Meeting',
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    const userBookingId = createData.booking.id;
    console.log(`   ✅ Booking created: ID=${userBookingId}, status=${createData.booking.status}`);

    // Live availability check after booking (should be false)
    const checkRes2 = await fetch(`${baseUrl}/api/bookings/check-availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookie,
      },
      body: JSON.stringify({
        date: bookingDate,
        startTime: '10:00',
        endTime: '12:00',
      }),
    });
    const checkData2 = await checkRes2.json();
    assert.strictEqual(checkData2.available, false);
    assert.strictEqual(checkData2.conflictingBooking.topic, 'Executive Strategy Meeting');
    console.log('   ✅ Availability check correctly shows occupied slot');

    // ----------------------------------------------------
    // 3. Conflict Detection with 409 & Conflict Modal Info
    // ----------------------------------------------------
    console.log('\n3. Testing Conflict Rejection & Conflict Details...');
    const conflictRes = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookie,
      },
      body: JSON.stringify({
        date: bookingDate,
        startTime: '10:30',
        endTime: '11:30',
        topic: 'Conflicting Overlapping Booking',
      }),
    });
    assert.strictEqual(conflictRes.status, 409);
    const conflictData = await conflictRes.json();
    assert.ok(conflictData.error.includes('unavailable'));
    assert.strictEqual(conflictData.conflictingBooking.client, 'Alex Test Client');
    console.log('   ✅ Overlapping booking rejected with 409 Conflict & detailed payload');

    // ----------------------------------------------------
    // 4. User Reschedule Flow (1-Day-Before Rule Validation)
    // ----------------------------------------------------
    console.log('\n4. Testing Reschedule Rules...');
    // Reschedule to 2026-11-21 (future date > 1 day)
    const rescheduleRes1 = await fetch(`${baseUrl}/api/bookings/${userBookingId}/reschedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userCookie,
      },
      body: JSON.stringify({
        newDate: '2026-11-21',
        newStartTime: '14:00',
        newEndTime: '16:00',
        reason: 'Postponed by client request',
      }),
    });
    assert.strictEqual(rescheduleRes1.status, 200);
    const reschedData1 = await rescheduleRes1.json();
    assert.strictEqual(reschedData1.booking.status, 'RESCHEDULED');
    assert.strictEqual(reschedData1.booking.bookingDate, '2026-11-21');
    console.log('   ✅ Future date reschedule succeeded and updated status to RESCHEDULED');

    // Verify reschedule history was logged in DB
    const historyRecords = await prisma.rescheduleHistory.findMany({
      where: { bookingId: userBookingId },
    });
    assert.strictEqual(historyRecords.length, 1);
    assert.strictEqual(historyRecords[0].oldDate, '2026-11-20');
    assert.strictEqual(historyRecords[0].newDate, '2026-11-21');
    console.log('   ✅ RescheduleHistory audit trail stored in database');

    // ----------------------------------------------------
    // 5. Receptionist Role Validation
    // ----------------------------------------------------
    console.log('\n5. Testing Receptionist Flow...');
    const recepLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'receptionist@company.com',
        password: 'password123',
      }),
    });
    assert.strictEqual(recepLoginRes.status, 200);
    const recepCookie = recepLoginRes.headers.get('set-cookie');

    // Receptionist views calendar events
    const calRes = await fetch(`${baseUrl}/api/calendar/events?startDate=2026-11-01&endDate=2026-11-30`, {
      headers: { Cookie: recepCookie },
    });
    assert.strictEqual(calRes.status, 200);
    const calData = await calRes.json();
    assert.ok(calData.events.length >= 1);
    console.log(`   ✅ Receptionist viewed calendar grid: ${calData.events.length} events returned`);

    // Receptionist creates guest booking
    const guestBookingRes = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: recepCookie,
      },
      body: JSON.stringify({
        date: '2026-11-25',
        startTime: '13:00',
        endTime: '14:30',
        topic: 'VIP Guest Consultation',
      }),
    });
    assert.strictEqual(guestBookingRes.status, 201);
    console.log('   ✅ Receptionist created booking on behalf of client');

    // Receptionist blocked from Admin user management
    const blockRes = await fetch(`${baseUrl}/api/users`, {
      headers: { Cookie: recepCookie },
    });
    assert.strictEqual(blockRes.status, 403);
    console.log('   ✅ Receptionist correctly blocked from User Management API (403 Forbidden)');

    // ----------------------------------------------------
    // 6. Administrator Role & User Management
    // ----------------------------------------------------
    console.log('\n6. Testing Administrator User Management & CRUD...');
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sarah@admin.local',
        password: 'password123',
      }),
    });
    assert.strictEqual(adminLoginRes.status, 200);
    const adminCookie = adminLoginRes.headers.get('set-cookie');

    // Admin creates new staff user
    const staffEmail = `staff_${Date.now()}@company.com`;
    const createStaffRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        fullName: 'New Staff Member',
        company: 'Company Corp',
        email: staffEmail,
        role: 'RECEPTIONIST',
        password: 'TemporaryPass123!',
      }),
    });
    assert.strictEqual(createStaffRes.status, 201);
    const createdStaffData = await createStaffRes.json();
    const createdStaffId = createdStaffData.user.id;
    console.log('   ✅ Administrator created new Receptionist user');

    // Admin edits user
    const editStaffRes = await fetch(`${baseUrl}/api/users/${createdStaffId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        fullName: 'New Staff Member Senior',
        company: 'Company Corp',
        role: 'RECEPTIONIST',
      }),
    });
    assert.strictEqual(editStaffRes.status, 200);
    console.log('   ✅ Administrator updated user profile');

    // Admin deactivates user
    const deactRes = await fetch(`${baseUrl}/api/users/${createdStaffId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ isActive: false }),
    });
    assert.strictEqual(deactRes.status, 200);
    console.log('   ✅ Administrator deactivated user account');

    // Verify deactivated user cannot log in (403 Forbidden)
    const deactLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: staffEmail,
        password: 'TemporaryPass123!',
      }),
    });
    assert.strictEqual(deactLoginRes.status, 403);
    console.log('   ✅ Deactivated account blocked from logging in (403 Forbidden)');

    // ----------------------------------------------------
    // 7. Report Exports (Excel & PDF)
    // ----------------------------------------------------
    console.log('\n7. Testing Report Exports (Excel & PDF)...');
    // Bookings Excel
    const bExcelRes = await fetch(`${baseUrl}/api/reports/bookings/excel?month=11&year=2026`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(bExcelRes.status, 200);
    assert.ok(bExcelRes.headers.get('content-type').includes('spreadsheetml'));
    const bExcelBuf = await bExcelRes.arrayBuffer();
    assert.ok(bExcelBuf.byteLength > 1000);
    console.log(`   ✅ Bookings Excel generated (${bExcelBuf.byteLength} bytes)`);

    // Bookings PDF
    const bPdfRes = await fetch(`${baseUrl}/api/reports/bookings/pdf?month=11&year=2026`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(bPdfRes.status, 200);
    assert.ok(bPdfRes.headers.get('content-type').includes('application/pdf'));
    const bPdfBuf = await bPdfRes.arrayBuffer();
    assert.ok(bPdfBuf.byteLength > 1000);
    console.log(`   ✅ Bookings PDF generated (${bPdfBuf.byteLength} bytes)`);

    // Users Excel
    const uExcelRes = await fetch(`${baseUrl}/api/reports/users/excel`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(uExcelRes.status, 200);
    const uExcelBuf = await uExcelRes.arrayBuffer();
    assert.ok(uExcelBuf.byteLength > 1000);
    console.log(`   ✅ User Directory Excel generated (${uExcelBuf.byteLength} bytes)`);

    // Users PDF
    const uPdfRes = await fetch(`${baseUrl}/api/reports/users/pdf`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(uPdfRes.status, 200);
    const uPdfBuf = await uPdfRes.arrayBuffer();
    assert.ok(uPdfBuf.byteLength > 1000);
    console.log(`   ✅ User Directory PDF generated (${uPdfBuf.byteLength} bytes)`);

    console.log('\n====================================================');
    console.log('🎉 ALL END-TO-END FLOWS TESTED & VALIDATED WITH 100% SUCCESS!');
    console.log('====================================================');
  } finally {
    server.close();
  }
}

runE2EValidation().catch((err) => {
  console.error('Fatal validation failure:', err);
  process.exit(1);
});
