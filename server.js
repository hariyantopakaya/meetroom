const app = require('./server/app');
const config = require('./server/config/env');

const PORT = config.PORT;

const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Booking Meeting server running on http://localhost:${PORT}`);
  console.log(`📁 Environment: ${config.NODE_ENV}`);
  console.log(`====================================================`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
