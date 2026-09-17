import pg from 'pg';

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000
    })
  : null;

export function databaseConfigured() {
  return Boolean(pool);
}

export async function query(text, params = []) {
  if (!pool) throw new Error('Database is not configured');
  return pool.query(text, params);
}
