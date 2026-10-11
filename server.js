const app = require('./server/app');
const config = require('./server/config/env');
const prisma = require('./server/db/prisma');

const PORT = config.PORT;

const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Booking Meeting server running on http://localhost:${PORT}`);
  console.log(`📁 Environment: ${config.NODE_ENV}`);
  console.log(`====================================================`);
});

// Graceful shutdown handling
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(async () => {
    await prisma.$disconnect();
    clearTimeout(timeout);
    console.log('HTTP server and database connections closed');
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
