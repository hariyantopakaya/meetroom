const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { PrismaClient } = require('@prisma/client');

const root = path.resolve(__dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'meetroom-production-test-'));
const dbUrl = (name) => {
  const file = path.join(temp, name);
  // Prisma 5's Windows schema engine needs the empty SQLite file to exist.
  if (!existsSync(file)) writeFileSync(file, '');
  return `file:${file.replace(/\\/g, '/')}`;
};
const productionEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: dbUrl('production.db'),
  APP_URL: 'https://meet.example.com',
  JWT_SECRET: 'f'.repeat(64), COOKIE_SECRET: 'a'.repeat(64),
  SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_SECURE: 'false',
  SMTP_USER: 'mailer@example.com', SMTP_PASS: 'test-smtp-password',
  SMTP_FROM: 'Meetroom <mailer@example.com>',
  ROOM_NAME: 'Office Meeting Room', ROOM_CAPACITY: '10',
};
function node(args, env = productionEnv) {
  return spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', timeout: 45000 });
}
function prisma(command, env) {
  const result = node([path.join(root, 'node_modules/prisma/build/index.js'), ...command], env);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
function loadConfig(overrides) {
  const env = { ...productionEnv, ...overrides };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
  return node(['-e', 'require("./server/config/env")'], env);
}

test('production refuses missing/default secrets, insecure origin and nonpersistent database paths', () => {
  for (const overrides of [
    { JWT_SECRET: undefined }, { COOKIE_SECRET: 'short' },
    { JWT_SECRET: 'production_secure_jwt_secret_booking_meeting_2026' },
    { COOKIE_SECRET: productionEnv.JWT_SECRET },
    { APP_URL: 'http://meet.example.com' },
    { DATABASE_URL: 'file:./dev.db' }, { DATABASE_URL: dbUrl('dev.db') },
    { SMTP_HOST: '' }, { SMTP_PASS: '' }, { SMTP_PORT: 'not-a-port' },
  ]) {
    const result = loadConfig(overrides);
    assert.notEqual(result.status, 0, `Accepted unsafe config: ${JSON.stringify(overrides)}`);
  }
  assert.equal(loadConfig({}).status, 0);
});

test('schema migrations create an empty production database and safely rerun', async () => {
  prisma(['migrate', 'deploy'], productionEnv);
  const db = new PrismaClient({ datasources: { db: { url: productionEnv.DATABASE_URL } } });
  try {
    assert.equal(await db.user.count(), 0);
    assert.equal(await db.booking.count(), 0);
    assert.equal(await db.room.count(), 0);
    prisma(['migrate', 'deploy'], productionEnv);
    assert.equal(await db.user.count(), 0);
  } finally { await db.$disconnect(); }
});

test('production seed is refused before it changes data', async () => {
  const env = { ...productionEnv, DATABASE_URL: dbUrl('seed.db'), ALLOW_DEMO_SEED: 'true' };
  prisma(['db', 'push', '--skip-generate'], env);
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const user = await db.user.create({ data: { email: 'preserve@example.com', passwordHash: 'existing', fullName: 'Existing User', company: 'Office' } });
    const result = node(['prisma/seed.js'], env);
    assert.notEqual(result.status, 0, 'Demo seed ran in production');
    assert.equal(await db.user.count(), 1);
    assert.ok(await db.user.findUnique({ where: { id: user.id } }));
    assert.equal(await db.booking.count(), 0);
  } finally { await db.$disconnect(); }
});

test('bootstrap creates only the operator admin and real room; reruns preserve credentials', async () => {
  const env = { ...productionEnv, DATABASE_URL: dbUrl('bootstrap.db'),
    BOOTSTRAP_ADMIN_EMAIL: 'owner@example.com', BOOTSTRAP_ADMIN_NAME: 'Owner',
    BOOTSTRAP_ADMIN_COMPANY: 'Office', BOOTSTRAP_ADMIN_PASSWORD: 'Unique-test-passphrase-42!',
  };
  prisma(['db', 'push', '--skip-generate'], env);
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const first = node(['scripts/bootstrap-admin.js'], env);
    assert.equal(first.status, 0, first.stderr);
    const admin = await db.user.findUnique({ where: { email: 'owner@example.com' } });
    assert.equal(admin.role, 'ADMIN');
    assert.equal(await db.user.count(), 1);
    assert.equal(await db.booking.count(), 0);
    assert.equal((await db.room.findFirst()).name, 'Office Meeting Room');
    const again = node(['scripts/bootstrap-admin.js'], { ...env, BOOTSTRAP_ADMIN_PASSWORD: 'Different-test-passphrase!' });
    assert.equal(again.status, 0, again.stderr);
    assert.equal(await db.user.count(), 1);
    assert.equal(await db.room.count(), 1);
    assert.equal((await db.user.findUnique({ where: { id: admin.id } })).passwordHash, admin.passwordHash);
    const invalid = node(['scripts/bootstrap-admin.js'], { ...env, BOOTSTRAP_ADMIN_EMAIL: 'another@example.com' });
    assert.notEqual(invalid.status, 0, 'Bootstrap must not create additional admins');
    assert.equal(await db.user.count(), 1);
  } finally { await db.$disconnect(); }
});

let appServer, api, db, owner, stranger, staff, booking;
before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = dbUrl('api.db');
  process.env.APP_URL = 'http://localhost:3000';
  process.env.SMTP_HOST = '';
  process.env.SMTP_USER = '';
  prisma(['db', 'push', '--skip-generate'], process.env);
  db = require('../server/db/prisma');
  const app = require('../server/app');
  const createUser = (email, role = 'USER') => db.user.create({ data: { email, role, passwordHash: 'not-used', fullName: 'Test User', company: 'Test Office' } });
  owner = await createUser('owner@test.local');
  stranger = await createUser('stranger@test.local');
  staff = await createUser('staff@test.local', 'ADMIN');
  const room = await db.room.create({ data: { name: 'Test Room' } });
  booking = await db.booking.create({ data: { userId: owner.id, roomId: room.id, bookingDate: '2026-11-15', startTime: '09:00', endTime: '10:00', topic: 'Private meeting', wifiSsid: 'Real Office', wifiPassword: 'private-wifi-password' } });
  await db.wifiMonthlySetting.create({ data: { month: '2026-11', ssid: 'Real Office', password: 'private-wifi-password' } });
  appServer = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  api = `http://127.0.0.1:${appServer.address().port}`;
});
after(async () => {
  if (appServer) await new Promise(resolve => appServer.close(resolve));
  if (db) await db.$disconnect();
  rmSync(temp, { recursive: true, force: true });
});
function headers(user) {
  return { Authorization: `Bearer ${require('../server/services/authService').generateJwt(user)}` };
}

test('anonymous calendar reads are rejected', async () => {
  const res = await fetch(`${api}/api/calendar/events?startDate=2026-11-01&endDate=2026-11-30`);
  assert.equal(res.status, 401);
});
test('shared calendar and dashboard exclude Wi-Fi credentials and email addresses', async () => {
  const res = await fetch(`${api}/api/calendar/events?startDate=2026-11-01&endDate=2026-11-30`, { headers: headers(stranger) });
  assert.equal(res.status, 200);
  const event = (await res.json()).events[0];
  assert.equal(event.topic, 'Private meeting');
  assert.equal(event.wifiPassword, undefined);
  assert.equal(event.wifiSsid, undefined);
  assert.equal(event.user.email, undefined);
  const stats = await fetch(`${api}/api/calendar/stats`, { headers: headers(stranger) });
  const data = await stats.json();
  assert.ok(data.todaySchedule.every(b => b.wifiPassword === undefined));
});
test('booking details allow owner/staff and deny another user', async () => {
  const other = await fetch(`${api}/api/bookings/${booking.id}`, { headers: headers(stranger) });
  assert.equal(other.status, 403);
  for (const user of [owner, staff]) {
    const res = await fetch(`${api}/api/bookings/${booking.id}`, { headers: headers(user) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).booking.wifiPassword, 'private-wifi-password');
  }
});
test('foreign browser origins cannot make authenticated mutations', async () => {
  const res = await fetch(`${api}/api/bookings`, { method: 'POST', headers: { ...headers(owner), Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});
test('admin user creation and password reset require an explicit password', async () => {
  const created = await fetch(`${api}/api/users`, { method: 'POST', headers: { ...headers(staff), 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'new@test.local', fullName: 'New User' }) });
  assert.equal(created.status, 400);
  const reset = await fetch(`${api}/api/users/${owner.id}/reset-password`, { method: 'POST', headers: { ...headers(staff), 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(reset.status, 400);
});
test('health fails when application tables are missing', async () => {
  const healthy = await fetch(`${api}/api/health`);
  assert.equal(healthy.status, 200);
  await db.$executeRawUnsafe('DROP TABLE PasswordResetToken');
  const unhealthy = await fetch(`${api}/api/health`);
  assert.equal(unhealthy.status, 503);
});

test('booking form delegates monthly Wi-Fi to the server and starts on the current calendar date', async () => {
  const elements = new Map(['booking-date', 'booking-start', 'booking-end', 'booking-topic'].map((id, i) => [id, { value: ['2026-11-15', '10:00', '11:00', 'Real meeting'][i] }]));
  let payload;
  const context = vm.createContext({
    document: { addEventListener() {}, getElementById: id => elements.get(id) || null, querySelectorAll: () => [] },
    window: {}, localStorage: { getItem: () => null }, Date, setTimeout, clearTimeout, console,
  });
  vm.runInContext(readFileSync(path.join(root, 'public/app.js'), 'utf8'), context);
  vm.runInContext('apiRequest = async (url, options) => capture(options.body); closeModal = showToast = loadDashboardStats = loadCalendar = loadBookings = () => {};', context);
  context.capture = body => { payload = body; return {}; };
  assert.equal(vm.runInContext('currentCalendarDate.toDateString()', context), new Date().toDateString());
  await vm.runInContext('handleNewBookingSubmit({preventDefault(){}, stopPropagation(){}})', context);
  assert.equal(payload.wifiSsid, undefined);
  assert.equal(payload.wifiPassword, undefined);
});
