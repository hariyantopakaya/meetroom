// Production receives configuration only from the deployment environment.
if (process.env.NODE_ENV !== 'production') require('dotenv').config();

const config = {
  PORT: Number(process.env.PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  JWT_SECRET: process.env.JWT_SECRET || 'fallback_jwt_secret_booking_meeting_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'fallback_cookie_secret_booking_meeting_2026',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'Booking Meeting <no-reply@bookingmeeting.local>',
  DATABASE_URL: process.env.DATABASE_URL || '',
  TRUST_PROXY_HOPS: Number(process.env.TRUST_PROXY_HOPS || 0),
  ROOM_NAME: process.env.ROOM_NAME || '',
  ROOM_CAPACITY: Number(process.env.ROOM_CAPACITY || 12),
};

if (!Number.isInteger(config.PORT) || config.PORT < 1 || config.PORT > 65535) throw new Error('PORT must be a valid port.');
if (!Number.isInteger(config.TRUST_PROXY_HOPS) || config.TRUST_PROXY_HOPS < 0) throw new Error('TRUST_PROXY_HOPS must be a nonnegative integer.');
const appUrl = new URL(config.APP_URL);
config.APP_ORIGIN = appUrl.origin;

if (config.NODE_ENV === 'production') {
  for (const name of ['JWT_SECRET', 'COOKIE_SECRET']) {
    const value = process.env[name] || '';
    if (value.length < 32 || /fallback_|production_secure_|super_secret_|change[_ -]?me|change_in_production/i.test(value)) {
      throw new Error(`${name} must be an independent random secret of at least 32 characters.`);
    }
  }
  if (config.JWT_SECRET === config.COOKIE_SECRET) throw new Error('JWT_SECRET and COOKIE_SECRET must be different.');
  if (appUrl.protocol !== 'https:' || appUrl.username || appUrl.password || appUrl.pathname !== '/' || appUrl.search || appUrl.hash) {
    throw new Error('APP_URL must be the public HTTPS origin (without a path or credentials).');
  }
  if (!/^file:(\/|[a-zA-Z]:[\\/])/.test(config.DATABASE_URL) || /(^|[\\/])dev\.db($|[?])/i.test(config.DATABASE_URL)) {
    throw new Error('Production DATABASE_URL must be an absolute SQLite file path, separate from dev.db.');
  }
  for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'ROOM_NAME']) {
    if (!process.env[name]?.trim()) throw new Error(`${name} is required in production.`);
  }
  if (!/^\d+$/.test(process.env.SMTP_PORT || '587') || config.SMTP_PORT < 1 || config.SMTP_PORT > 65535) throw new Error('SMTP_PORT must be a valid port.');
  if (process.env.SMTP_SECURE && !['true', 'false'].includes(process.env.SMTP_SECURE)) throw new Error('SMTP_SECURE must be true or false.');
  if (!Number.isInteger(config.ROOM_CAPACITY) || config.ROOM_CAPACITY < 1) throw new Error('ROOM_CAPACITY must be a positive integer.');
}

module.exports = config;
