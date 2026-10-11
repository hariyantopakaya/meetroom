const bcrypt = require('bcryptjs');
const prisma = require('../db/prisma');

async function listUsers({ page = 1, limit = 10, search = '', role = '', status = '' }) {
  const skip = (page - 1) * limit;
  const where = {};

  if (role && role !== 'ALL') {
    where.role = role.toUpperCase();
  }

  if (status && status !== 'ALL') {
    where.isActive = status === 'ACTIVE';
  }

  if (search) {
    const s = search.trim();
    where.OR = [
      { fullName: { contains: s } },
      { email: { contains: s } },
      { company: { contains: s } },
    ];
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        company: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    users,
  };
}

async function createUser({ fullName, email, company, role = 'USER', password }) {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    const error = new Error('A user with this email already exists.');
    error.statusCode = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password || 'Temp@12345', 10);

  const user = await prisma.user.create({
    data: {
      fullName: fullName.trim(),
      email: normalizedEmail,
      company: company ? company.trim() : 'Internal',
      role: ['ADMIN', 'RECEPTIONIST', 'USER'].includes(role) ? role : 'USER',
      passwordHash: hashedPassword,
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

  return user;
}

async function updateUser(id, { fullName, company, role }) {
  const data = {};
  if (fullName) data.fullName = fullName.trim();
  if (company) data.company = company.trim();
  if (role && ['ADMIN', 'RECEPTIONIST', 'USER'].includes(role)) data.role = role;

  const user = await prisma.user.update({
    where: { id },
    data,
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

  return user;
}

async function toggleUserStatus(id, isActive) {
  const user = await prisma.user.update({
    where: { id },
    data: { isActive },
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

  return user;
}

async function resetUserPassword(id, newPassword) {
  const hashedPassword = await bcrypt.hash(newPassword || 'Temp@12345', 10);

  await prisma.user.update({
    where: { id },
    data: { passwordHash: hashedPassword },
  });

  return { success: true, message: 'User password reset successfully.' };
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  toggleUserStatus,
  resetUserPassword,
};
