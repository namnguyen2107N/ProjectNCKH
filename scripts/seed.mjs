import postgres from 'postgres';
import dotenv from 'dotenv';
import validateUtils from '../lib/validate.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const { generateJoinCode, normalizeClassCode, CLASS_CODE_RE } = validateUtils;

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DIRECT_URL or DATABASE_URL. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

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

async function ensureClass() {
  if (classCodeInput) {
    const existing = await sql`
      select id, name, join_code from classes where join_code = ${classCodeInput} limit 1
    `;
    if (existing.length) {
      return { ...existing[0], created: false };
    }

    const rows = await sql`
      insert into classes (name, join_code)
      values (${className}, ${classCodeInput})
      returning id, name, join_code
    `;
    return { ...rows[0], created: true };
  }

  // Reuse the first class so running the seed twice is idempotent.
  const existing = await sql`
    select id, name, join_code from classes order by id limit 1
  `;
  if (existing.length) {
    return { ...existing[0], created: false };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateJoinCode();
    try {
      const rows = await sql`
        insert into classes (name, join_code)
        values (${className}, ${code})
        returning id, name, join_code
      `;
      return { ...rows[0], created: true };
    } catch (error) {
      if (error.code !== '23505') throw error;
    }
  }

  throw new Error('Could not generate a unique class code.');
}

try {
  const clazz = await ensureClass();

  console.log('');
  console.log('=== Robot Math Lab seed ===');
  console.log(`Class: ${clazz.name} | join code: ${clazz.join_code}${clazz.created ? ' (created)' : ''}`);
  console.log('');
  console.log('Students register at /; the class code is optional.');
  console.log('');
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
