import postgres from 'postgres';
import dotenv from 'dotenv';
import passwordUtils from '../lib/password.js';
import validateUtils from '../lib/validate.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { hashPassword, PASSWORD_MIN_LENGTH } = passwordUtils;
const { USERNAME_RE } = validateUtils;

const username = (process.argv[2] || '').trim().toLowerCase();
const newPassword = process.argv[3] || '';

if (!USERNAME_RE.test(username)) {
  console.error('Usage: npm run user:reset-password -- <username> <new-password>');
  console.error('Username must be 3-24 chars: a-z, 0-9, _.');
  process.exit(1);
}
if (newPassword.length < PASSWORD_MIN_LENGTH) {
  console.error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  process.exit(1);
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DIRECT_URL or DATABASE_URL.');
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
  const hash = await hashPassword(newPassword);
  const rows = await sql`
    update accounts
    set password_hash = ${hash},
        status = 'active',
        failed_login_count = 0,
        locked_until = null
    where username = ${username}
    returning id, username, role
  `;

  if (!rows.length) {
    console.error(`Account "${username}" was not found.`);
    process.exitCode = 1;
  } else {
    await sql`
      update auth_sessions
      set revoked_at = now()
      where account_id = ${rows[0].id}
        and revoked_at is null
    `;
    console.log(`Password reset for ${rows[0].username} (${rows[0].role}).`);
    console.log('Existing sessions for this account were revoked.');
  }
} catch (error) {
  console.error('Reset failed:', error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
