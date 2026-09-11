const path = require('path');

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'db');

module.exports = {
  ROOT,
  DATA_DIR,
  PORT: Number(process.env.PORT || 3000),
  ADMIN_EMAIL: String(process.env.ADMIN_EMAIL || 'aimloqris@gmail.com').trim().toLowerCase(),
  SESSION_SECRET: process.env.SESSION_SECRET || 'CHANGE_ME_IN_PRODUCTION',
  NODE_ENV: process.env.NODE_ENV || 'development'
};
