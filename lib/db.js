'use strict';

const postgres = require('postgres');
const { HttpError } = require('./http');

let client = null;

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new HttpError(
      503,
      'DB_NOT_CONFIGURED',
      'Hệ thống chưa được cấu hình cơ sở dữ liệu. Vui lòng liên hệ quản trị viên.'
    );
  }

  if (!client) {
    client = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      // Required when connecting through PgBouncer / Neon pooler.
      prepare: false,
      ssl: process.env.DATABASE_SSL === 'false' ? false : 'require',
      onnotice: () => {},
    });
  }

  return client;
}

module.exports = { getDb };
