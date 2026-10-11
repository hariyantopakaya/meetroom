const fs = require('node:fs');
const path = require('node:path');
const config = require('../server/config/env');

if (config.NODE_ENV !== 'production') throw new Error('The container entrypoint requires NODE_ENV=production.');
const dbPath = config.DATABASE_URL.slice('file:'.length);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
try {
  fs.closeSync(fs.openSync(dbPath, 'wx', 0o600));
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
