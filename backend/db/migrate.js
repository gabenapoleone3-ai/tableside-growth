import fs from 'node:fs/promises';
import pg from 'pg';

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not configured. No database changes were made.');
  process.exit(1);
}

const sql = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
});

try {
  await client.connect();
  await client.query(sql);
  console.log('TableSide Growth database schema is ready.');
} catch (error) {
  console.error('Database migration failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
