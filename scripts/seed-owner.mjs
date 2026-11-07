import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import dotenv from 'dotenv';
import passwordUtils from '../lib/password.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { hashPassword, PASSWORD_MIN_LENGTH } = passwordUtils;

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DIRECT_URL or DATABASE_URL. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const username = String(process.env.OWNER_USERNAME || 'owner').trim().toLowerCase();
if (!/^[a-z0-9_]{3,32}$/.test(username)) {
  console.error('OWNER_USERNAME must be 3-32 chars: lowercase letters, numbers, underscore.');
  process.exit(1);
}

const providedPassword = process.env.OWNER_PASSWORD || '';
const password = providedPassword || randomBytes(12).toString('base64url');
if (password.length < PASSWORD_MIN_LENGTH) {
  console.error(`OWNER_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  connect_timeout: 10,
  prepare: false,
  ssl: process.env.DATABASE_SSL === 'false' ? false : 'require',
  onnotice: () => {},
});

try {
  const passwordHash = await hashPassword(password);
  const rows = await sql`
    insert into owner_accounts (username, password_hash)
    values (${username}, ${passwordHash})
    on conflict (username) do update
    set password_hash = excluded.password_hash
    returning id, username, created_at
  `;

  console.log('');
  console.log('=== Robot Math Lab owner account ===');
  console.log(`Owner:    ${rows[0].username} (id ${rows[0].id})`);
  if (!providedPassword) {
    console.log(`Password: ${password}`);
    console.log('Save this password now. It will not be shown again.');
  } else {
    console.log('Password: (from OWNER_PASSWORD)');
  }
  console.log('');
  console.log('Owner console: /owner.html');
  console.log('');
} catch (error) {
  console.error('Owner seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
