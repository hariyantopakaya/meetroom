const prisma = require('../db/prisma');
const { z } = require('zod');

const monthSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, 'Invalid month (YYYY-MM).');
const settingSchema = z.object({
  ssid: z.string().min(1).refine(value => value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= 32, 'SSID must contain 1 to 32 bytes.'),
  password: z.string().refine(value => {
    const bytes = Buffer.byteLength(value, 'utf8');
    return (bytes >= 8 && bytes <= 63) || /^[a-fA-F0-9]{64}$/.test(value);
  }, 'Wi-Fi password must contain 8 to 63 bytes, or 64 hexadecimal characters.'),
});

async function getMonthlySetting(month) {
  return prisma.wifiMonthlySetting.findUnique({ where: { month: monthSchema.parse(month) } });
}

async function saveMonthlySetting(month, values) {
  const key = monthSchema.parse(month);
  const data = settingSchema.parse(values);
  return prisma.wifiMonthlySetting.upsert({ where: { month: key }, create: { month: key, ...data }, update: data });
}

// The monthly record is authoritative, including for existing/rescheduled bookings.
// Never fall back to old per-booking credentials or a previous month's password.
async function attachMonthlyWifi(bookings) {
  if (bookings.length === 0) return [];
  const months = [...new Set(bookings.map(booking => booking.bookingDate.slice(0, 7)))];
  const settings = await prisma.wifiMonthlySetting.findMany({ where: { month: { in: months } } });
  const byMonth = new Map(settings.map(setting => [setting.month, setting]));
  return bookings.map(booking => {
    const month = booking.bookingDate.slice(0, 7);
    const setting = byMonth.get(month);
    return { ...booking, wifiMonth: month, wifiSsid: setting?.ssid || null, wifiPassword: setting?.password || null };
  });
}

module.exports = { getMonthlySetting, saveMonthlySetting, attachMonthlyWifi };
