/**
 * ensure-admin.js
 *
 * Ensures the default admin account exists in the database.
 * Safe to rerun — will NOT overwrite an existing account's password.
 *
 * Usage (non-interactive, via env vars):
 *   ENSURE_ADMIN_EMAIL=hariyantopakaya25@gmail.com \
 *   ENSURE_ADMIN_PASSWORD=yourpassword \
 *   node scripts/ensure-admin.js
 *
 * Or just run and fill in interactively:
 *   node scripts/ensure-admin.js
 */

const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const bcrypt = require('bcryptjs');
const prisma = require('../server/db/prisma');

// ─── Default credentials (change as needed) ──────────────────────────────────
const DEFAULT_EMAIL    = 'hariyantopakaya25@gmail.com';
const DEFAULT_NAME     = 'Hariyanto Pakaya';
const DEFAULT_COMPANY  = 'Internal';
// Leave DEFAULT_PASSWORD blank to force password prompt / env var.
const DEFAULT_PASSWORD = '';
// ─────────────────────────────────────────────────────────────────────────────

async function prompt(question, hidden = false) {
  if (!process.stdin.isTTY) throw new Error(`Cannot prompt for "${question}" in non-TTY mode. Set env vars instead.`);
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, done) { if (!muted) process.stdout.write(chunk); done(); },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  try {
    if (hidden) {
      process.stdout.write(question);
      muted = true;
      const value = await rl.question('');
      process.stdout.write('\n');
      return value;
    }
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main() {
  const email    = (process.env.ENSURE_ADMIN_EMAIL    || DEFAULT_EMAIL).trim().toLowerCase();
  const fullName = (process.env.ENSURE_ADMIN_NAME     || DEFAULT_NAME).trim();
  const company  = (process.env.ENSURE_ADMIN_COMPANY  || DEFAULT_COMPANY).trim();
  let   password =  process.env.ENSURE_ADMIN_PASSWORD || DEFAULT_PASSWORD;

  if (!email)    throw new Error('Admin email is required. Set ENSURE_ADMIN_EMAIL.');
  if (!fullName) throw new Error('Admin name is required. Set ENSURE_ADMIN_NAME.');
  if (!company)  throw new Error('Admin company is required. Set ENSURE_ADMIN_COMPANY.');

  if (!password) {
    password = await prompt('Password (min 12 chars, hidden): ', true);
  }

  if (!password || password.length < 12) {
    throw new Error('Password must be at least 12 characters.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role !== 'ADMIN') {
      throw new Error(`${email} already exists as role ${existing.role}. Will not overwrite.`);
    }
    console.log(`✓ Admin ${email} already exists. Password NOT changed.`);
    console.log('  To reset the password, use the app\'s Forgot Password feature.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: { email, fullName, company, passwordHash, role: 'ADMIN', isActive: true },
  });

  // Ensure at least one active room exists
  const room = await prisma.room.findFirst({ where: { isActive: true } });
  if (!room) {
    const roomName = (process.env.ROOM_NAME || 'Main Conference Room').trim();
    const capacity = parseInt(process.env.ROOM_CAPACITY || '12', 10);
    await prisma.room.create({ data: { name: roomName, capacity, isActive: true } });
    console.log(`✓ Room "${roomName}" created.`);
  }

  console.log(`✓ Admin account created: ${email}`);
  console.log('  You can now log in with the password you provided.');
}

main()
  .catch(err => { console.error('Error:', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
