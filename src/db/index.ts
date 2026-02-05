import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = process.env.DB_PATH || './data/lazyflow.db';

import { mkdirSync } from 'fs';
import { dirname } from 'path';
try {
  mkdirSync(dirname(DB_PATH), { recursive: true });
} catch {}

export const db = new Database(DB_PATH);

const schemaPath = join(import.meta.dir, 'schema.sql');
const schema = readFileSync(schemaPath, 'utf-8');

db.exec(schema);

console.log('✅ Database initialized at', DB_PATH);

export * from './helpers';
