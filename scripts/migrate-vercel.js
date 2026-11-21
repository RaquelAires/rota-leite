import { readdir, readFile } from 'node:fs/promises';
import { createDatabase } from '../server/vercel/db.js';

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) throw new Error('Configure o banco antes de executar as migrações.');

const db = createDatabase({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
try {
  const directory = new URL('../drizzle/', import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  for (const file of files) {
    await db.migrate(await readFile(new URL(file, directory), 'utf8'));
    console.log('Esquema preparado:', file);
  }
} finally {
  db.close();
}
