import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DIRECT_URL or DATABASE_URL. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
// Strip SQL comments before splitting: comments may contain semicolons.
const schemaWithoutComments = schema
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '');
const statements = schemaWithoutComments
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);

const sql = postgres(url, {
  max: 1,
  connect_timeout: 10,
  prepare: false,
  ssl: process.env.DATABASE_SSL === 'false' ? false : 'require',
  onnotice: () => {},
});

try {
  console.log(`Applying ${statements.length} schema statements...`);
  for (const statement of statements) {
    await sql.unsafe(statement);
  }
  console.log('Schema applied successfully.');
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
