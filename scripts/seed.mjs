import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import dotenv from 'dotenv';
import passwordUtils from '../lib/password.js';
import validateUtils from '../lib/validate.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { hashPassword } = passwordUtils;
const { generateJoinCode, normalizeClassCode, USERNAME_RE, CLASS_CODE_RE } = validateUtils;

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DIRECT_URL or DATABASE_URL. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const adminUsername = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
if (!USERNAME_RE.test(adminUsername)) {
  console.error('ADMIN_USERNAME is not valid (3-24 chars: a-z, 0-9, _).');
  process.exit(1);
}

const adminDisplayName = process.env.ADMIN_DISPLAY_NAME || 'Quản trị viên';
const adminPassword = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
const classCodeInput = process.env.CLASS_CODE ? normalizeClassCode(process.env.CLASS_CODE) : '';
const className = process.env.CLASS_NAME || 'Lớp Demo';

if (classCodeInput && !CLASS_CODE_RE.test(classCodeInput)) {
  console.error('CLASS_CODE is not valid (4-12 letters or numbers).');
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  connect_timeout: 10,
  prepare: false,
  ssl: process.env.DATABASE_SSL === 'false' ? false : 'require',
  onnotice: () => {},
});

async function ensureAdmin() {
  const existing = await sql`
    select id, username, role from accounts where username = ${adminUsername} limit 1
  `;

  if (existing.length && existing[0].role !== 'admin') {
    throw new Error(`Account "${adminUsername}" already exists with role "${existing[0].role}", not admin.`);
  }

  if (!existing.length) {
    const hash = await hashPassword(adminPassword);
    const rows = await sql`
      insert into accounts (username, password_hash, display_name, role, status)
      values (${adminUsername}, ${hash}, ${adminDisplayName}, 'admin', 'active')
      returning id
    `;
    return { id: rows[0].id, created: true, password: adminPassword };
  }

  if (process.env.RESET_ADMIN_PASSWORD === '1') {
    const hash = await hashPassword(adminPassword);
    await sql`
      update accounts
      set password_hash = ${hash}, status = 'active', failed_login_count = 0, locked_until = null
      where id = ${existing[0].id}
    `;
    return { id: existing[0].id, created: false, password: adminPassword, reset: true };
  }

  return { id: existing[0].id, created: false, password: null };
}

async function ensureClass(adminId) {
  if (classCodeInput) {
    const existing = await sql`
      select id, name, join_code, teacher_id from classes where join_code = ${classCodeInput} limit 1
    `;
    if (existing.length) {
      if (!existing[0].teacher_id) {
        await sql`update classes set teacher_id = ${adminId} where id = ${existing[0].id}`;
      }
      return { ...existing[0], created: false };
    }
    const rows = await sql`
      insert into classes (name, join_code, teacher_id)
      values (${className}, ${classCodeInput}, ${adminId})
      returning id, name, join_code
    `;
    return { ...rows[0], created: true };
  }

  // Reuse the first class so running the seed twice is idempotent.
  const existing = await sql`
    select id, name, join_code, teacher_id from classes order by id limit 1
  `;
  if (existing.length) {
    if (!existing[0].teacher_id) {
      await sql`update classes set teacher_id = ${adminId} where id = ${existing[0].id}`;
    }
    return { ...existing[0], created: false };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateJoinCode();
    try {
      const rows = await sql`
        insert into classes (name, join_code, teacher_id)
        values (${className}, ${code}, ${adminId})
        returning id, name, join_code
      `;
      return { ...rows[0], created: true };
    } catch (error) {
      if (error.code !== '23505') throw error;
    }
  }

  throw new Error('Could not generate a unique class code.');
}

async function ensureTeacher(classId) {
  const username = (process.env.TEACHER_USERNAME || '').trim().toLowerCase();
  if (!username) return null;
  if (!USERNAME_RE.test(username)) {
    throw new Error('TEACHER_USERNAME is not valid.');
  }
  if (username === adminUsername) {
    throw new Error('TEACHER_USERNAME must be different from ADMIN_USERNAME.');
  }

  const password = process.env.TEACHER_PASSWORD || randomBytes(9).toString('base64url');
  const existing = await sql`
    select id, role from accounts where username = ${username} limit 1
  `;

  if (existing.length && existing[0].role !== 'teacher') {
    throw new Error(`Account "${username}" already exists with role "${existing[0].role}", not teacher.`);
  }

  if (existing.length) {
    await sql`update accounts set class_id = ${classId} where id = ${existing[0].id}`;
    await sql`update classes set teacher_id = ${existing[0].id} where id = ${classId}`;
    return { username, password: null, created: false };
  }

  const hash = await hashPassword(password);
  const rows = await sql`
    insert into accounts
      (username, password_hash, display_name, role, class_id, status)
    values
      (${username}, ${hash}, ${process.env.TEACHER_DISPLAY_NAME || username}, 'teacher', ${classId}, 'active')
    returning id
  `;
  await sql`update classes set teacher_id = ${rows[0].id} where id = ${classId}`;
  return { username, password, created: true };
}

try {
  const admin = await ensureAdmin();
  const clazz = await ensureClass(admin.id);
  const teacher = await ensureTeacher(clazz.id);

  console.log('');
  console.log('=== Robot Math Lab seed ===');
  if (admin.created) {
    console.log(`Admin created: ${adminUsername} / ${admin.password}`);
  } else if (admin.reset) {
    console.log(`Admin password reset: ${adminUsername} / ${admin.password}`);
  } else {
    console.log(`Admin already exists: ${adminUsername} (password unchanged)`);
    console.log('Set RESET_ADMIN_PASSWORD=1 and ADMIN_PASSWORD=... to reset it.');
  }
  console.log(`Class: ${clazz.name} | join code: ${clazz.join_code}${clazz.created ? ' (created)' : ''}`);
  if (teacher) {
    console.log(
      `Teacher: ${teacher.username}${teacher.password ? ` / ${teacher.password}` : ' (already existed; password unchanged)'}`
    );
  }
  console.log('');
  console.log('Students register at / with the class code above.');
  console.log('Admin dashboard: /admin.html');
  console.log('Save these credentials now. Passwords are not printed again.');
  console.log('');
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
