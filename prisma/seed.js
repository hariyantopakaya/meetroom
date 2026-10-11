const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing records if any
  await prisma.rescheduleHistory.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.user.deleteMany({});

  const defaultPassword = 'password123';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  // 1. Create Room (Single Meeting Room)
  const room = await prisma.room.create({
    data: {
      name: 'Main Conference Room',
      description: 'Equipped with 4K display, video conferencing, audio surround system, and glass whiteboard.',
      capacity: 14,
      isActive: true,
    },
  });

  // 2. Create Users
  const admin = await prisma.user.create({
    data: {
      email: 'sarah@admin.local',
      passwordHash: hashedPassword,
      fullName: 'Sarah Admin',
      company: 'Internal',
      role: 'ADMIN',
      isActive: true,
      createdAt: new Date('2026-01-01T08:00:00Z'),
    },
  });

  const receptionist = await prisma.user.create({
    data: {
      email: 'receptionist@company.com',
      passwordHash: hashedPassword,
      fullName: 'Maya Receptionist',
      company: 'Internal',
      role: 'RECEPTIONIST',
      isActive: true,
      createdAt: new Date('2026-02-15T08:00:00Z'),
    },
  });

  const budi = await prisma.user.create({
    data: {
      email: 'budi@teknologimaju.com',
      passwordHash: hashedPassword,
      fullName: 'Budi Santoso',
      company: 'PT Teknologi Maju',
      role: 'USER',
      isActive: true,
      createdAt: new Date('2026-03-20T08:00:00Z'),
    },
  });

  const diana = await prisma.user.create({
    data: {
      email: 'diana@solusidigital.com',
      passwordHash: hashedPassword,
      fullName: 'Diana Putri',
      company: 'PT Solusi Digital',
      role: 'USER',
      isActive: true,
      createdAt: new Date('2026-04-05T08:00:00Z'),
    },
  });

  const rina = await prisma.user.create({
    data: {
      email: 'rina@kreativenusantara.com',
      passwordHash: hashedPassword,
      fullName: 'Rina Wijaya',
      company: 'CV Kreatif Nusantara',
      role: 'USER',
      isActive: true,
      createdAt: new Date('2026-05-12T08:00:00Z'),
    },
  });

  const ahmad = await prisma.user.create({
    data: {
      email: 'ahmad@infrastrukturprima.com',
      passwordHash: hashedPassword,
      fullName: 'Ahmad Fauzi',
      company: 'PT Infrastruktur Prima',
      role: 'USER',
      isActive: true,
      createdAt: new Date('2026-06-01T08:00:00Z'),
    },
  });

  const lisa = await prisma.user.create({
    data: {
      email: 'lisa@datanusantara.com',
      passwordHash: hashedPassword,
      fullName: 'Lisa Handayani',
      company: 'PT Data Nusantara',
      role: 'USER',
      isActive: false,
      createdAt: new Date('2026-07-10T08:00:00Z'),
    },
  });

  console.log(`Users seeded: Admin (${admin.email}), Receptionist (${receptionist.email}), Users (Budi, Diana, Rina, Ahmad, Lisa)`);

  // 3. Seed Bookings
  const bookingsData = [
    // Today: 2026-08-29
    {
      userId: budi.id,
      roomId: room.id,
      bookingDate: '2026-08-29',
      startTime: '08:00',
      endTime: '09:30',
      topic: 'Sprint Planning — Q3 Features',
      status: 'CONFIRMED',
      rescheduleCount: 0,
      createdAt: new Date('2026-08-25T14:30:00Z'),
    },
    {
      userId: diana.id,
      roomId: room.id,
      bookingDate: '2026-08-29',
      startTime: '10:00',
      endTime: '11:00',
      topic: 'Client Presentation — Project Alpha',
      status: 'CONFIRMED',
      rescheduleCount: 0,
      createdAt: new Date('2026-08-26T09:15:00Z'),
    },
    {
      userId: rina.id,
      roomId: room.id,
      bookingDate: '2026-08-29',
      startTime: '13:00',
      endTime: '14:30',
      topic: 'Design Review — Mobile App Revamp',
      status: 'RESCHEDULED',
      originalDate: '2026-08-29',
      originalStartTime: '11:30',
      originalEndTime: '13:00',
      rescheduleCount: 1,
      createdAt: new Date('2026-08-26T11:00:00Z'),
    },
    {
      userId: ahmad.id,
      roomId: room.id,
      bookingDate: '2026-08-29',
      startTime: '15:00',
      endTime: '16:00',
      topic: 'Vendor Negotiation — IT Infrastructure',
      status: 'CONFIRMED',
      rescheduleCount: 0,
      createdAt: new Date('2026-08-27T10:00:00Z'),
    },
    {
      userId: admin.id,
      roomId: room.id,
      bookingDate: '2026-08-29',
      startTime: '16:30',
      endTime: '17:30',
      topic: 'Monthly Retrospective',
      status: 'CONFIRMED',
      rescheduleCount: 0,
      createdAt: new Date('2026-08-27T16:00:00Z'),
    },

    // 2026-08-25 (Monday)
    {
      userId: budi.id,
      roomId: room.id,
      bookingDate: '2026-08-25',
      startTime: '08:00',
      endTime: '09:30',
      topic: 'Architecture Overview & Roadmapping',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-20T09:00:00Z'),
    },
    {
      userId: rina.id,
      roomId: room.id,
      bookingDate: '2026-08-25',
      startTime: '11:00',
      endTime: '13:00',
      topic: 'UX Workshop: Flow Optimization',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-21T10:00:00Z'),
    },
    {
      userId: ahmad.id,
      roomId: room.id,
      bookingDate: '2026-08-25',
      startTime: '15:00',
      endTime: '16:00',
      topic: '1-on-1 Performance Review',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-22T14:00:00Z'),
    },

    // 2026-08-26 (Tuesday)
    {
      userId: diana.id,
      roomId: room.id,
      bookingDate: '2026-08-26',
      startTime: '09:00',
      endTime: '10:30',
      topic: 'Client Demo: AI Assistant',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-22T11:00:00Z'),
    },
    {
      userId: admin.id,
      roomId: room.id,
      bookingDate: '2026-08-26',
      startTime: '13:00',
      endTime: '14:30',
      topic: 'Executive Board Meeting',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-23T08:00:00Z'),
    },

    // 2026-08-27 (Wednesday)
    {
      userId: budi.id,
      roomId: room.id,
      bookingDate: '2026-08-27',
      startTime: '08:00',
      endTime: '10:00',
      topic: 'Tech Stack & Security Review',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-23T10:00:00Z'),
    },
    {
      userId: receptionist.id,
      roomId: room.id,
      bookingDate: '2026-08-27',
      startTime: '12:00',
      endTime: '13:00',
      topic: 'Lunch & Learn: Cyber Hygiene',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-24T12:00:00Z'),
    },
    {
      userId: diana.id,
      roomId: room.id,
      bookingDate: '2026-08-27',
      startTime: '14:00',
      endTime: '16:00',
      topic: 'Project Alpha Sync',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-24T15:00:00Z'),
    },

    // 2026-08-28 (Thursday)
    {
      userId: ahmad.id,
      roomId: room.id,
      bookingDate: '2026-08-28',
      startTime: '09:00',
      endTime: '10:00',
      topic: 'Cloud Vendor Strategic Call',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-25T11:00:00Z'),
    },
    {
      userId: rina.id,
      roomId: room.id,
      bookingDate: '2026-08-28',
      startTime: '11:00',
      endTime: '12:30',
      topic: 'Design Critique: Design System Tokens',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-25T13:00:00Z'),
    },
    {
      userId: admin.id,
      roomId: room.id,
      bookingDate: '2026-08-28',
      startTime: '15:00',
      endTime: '16:30',
      topic: 'Quarterly Financial Review',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-25T15:00:00Z'),
    },
    {
      userId: lisa.id,
      roomId: room.id,
      bookingDate: '2026-08-28',
      startTime: '09:00',
      endTime: '10:00',
      topic: 'Data Migration Planning',
      status: 'CANCELLED',
      createdAt: new Date('2026-08-25T08:00:00Z'),
    },

    // Future Bookings: September 2026
    {
      userId: budi.id,
      roomId: room.id,
      bookingDate: '2026-09-05',
      startTime: '09:00',
      endTime: '11:00',
      topic: 'Sprint 24 Kickoff',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-28T10:00:00Z'),
    },
    {
      userId: diana.id,
      roomId: room.id,
      bookingDate: '2026-09-08',
      startTime: '13:30',
      endTime: '15:00',
      topic: 'Client Discovery Workshop',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-28T11:00:00Z'),
    },
    {
      userId: ahmad.id,
      roomId: room.id,
      bookingDate: '2026-09-10',
      startTime: '10:00',
      endTime: '11:30',
      topic: 'DevOps Security Audit',
      status: 'CONFIRMED',
      createdAt: new Date('2026-08-28T14:00:00Z'),
    },
  ];

  for (const b of bookingsData) {
    const booking = await prisma.booking.create({ data: b });
    if (b.status === 'RESCHEDULED') {
      await prisma.rescheduleHistory.create({
        data: {
          bookingId: booking.id,
          oldDate: b.originalDate || b.bookingDate,
          oldStartTime: b.originalStartTime || '11:30',
          oldEndTime: b.originalEndTime || '13:00',
          newDate: b.bookingDate,
          newStartTime: b.startTime,
          newEndTime: b.endTime,
          reason: 'Client requested postponement due to conflicting morning meeting.',
        },
      });
    }
  }

  console.log(`Seeded ${bookingsData.length} bookings successfully!`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
