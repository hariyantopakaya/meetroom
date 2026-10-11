const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const config = require('../server/config/env');
const prisma = require('../server/db/prisma');

async function readAdmin() {
  const values = {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    fullName: process.env.BOOTSTRAP_ADMIN_NAME,
    company: process.env.BOOTSTRAP_ADMIN_COMPANY,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  };
  const prompts = { email: 'Admin email: ', fullName: 'Full name: ', company: 'Company: ', password: 'Password (at least 12 characters, hidden): ' };
  if (Object.values(values).some(value => !value)) {
    if (!process.stdin.isTTY) throw new Error('Run bootstrap interactively or supply all BOOTSTRAP_ADMIN_* variables.');
    let hidden = false;
    const output = new Writable({ write(chunk, encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
    const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
    try {
      for (const key of Object.keys(values)) {
        if (values[key]) continue;
        if (key === 'password') {
          process.stdout.write(prompts[key]);
          hidden = true;
          try { values[key] = await rl.question(''); } finally { hidden = false; process.stdout.write('\n'); }
        } else values[key] = await rl.question(prompts[key]);
      }
    } finally { rl.close(); }
  }
  return z.object({
    email: z.string().trim().email().transform(value => value.toLowerCase()),
    fullName: z.string().trim().min(2), company: z.string().trim().min(1),
    password: z.string().min(12),
  }).parse(values);
}

async function main() {
  if (!config.ROOM_NAME.trim()) throw new Error('Set ROOM_NAME to the actual meeting room name before bootstrap.');
  const admin = await readAdmin();
  const passwordHash = await bcrypt.hash(admin.password, 12);
  await prisma.$transaction(async tx => {
    const existingAdmin = await tx.user.findFirst({ where: { role: 'ADMIN' } });
    if (existingAdmin && existingAdmin.email !== admin.email) throw new Error('An administrator already exists. Use authenticated user management to add another.');
    const existingUser = await tx.user.findUnique({ where: { email: admin.email } });
    if (existingUser && existingUser.role !== 'ADMIN') throw new Error('This email belongs to a non-admin account. Bootstrap will not promote or overwrite it.');
    if (!existingUser) {
      await tx.user.create({ data: { email: admin.email, fullName: admin.fullName, company: admin.company, passwordHash, role: 'ADMIN' } });
    }
    if (!(await tx.room.findFirst({ where: { isActive: true } }))) {
      await tx.room.create({ data: { name: config.ROOM_NAME.trim(), capacity: config.ROOM_CAPACITY } });
    }
  });
  console.log('Admin and room are ready. Existing credentials and bookings were preserved.');
}

main().catch(error => {
  console.error(error.name === 'ZodError' ? 'Invalid admin details: provide a valid email, name, company and password of at least 12 characters.' : error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
