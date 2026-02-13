import { Database } from 'bun:sqlite';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { ensureSystemFolders } from './folders';

const DB_PATH = process.env.DB_PATH || (process.env.NODE_ENV === 'production' ? '/app/data/lazyflow.db' : './data/lazyflow.db');
try {
  mkdirSync(dirname(DB_PATH), { recursive: true });
} catch {}

export const db = new Database(DB_PATH);

const schemaPath = join(import.meta.dir, 'schema.sql');
const schema = readFileSync(schemaPath, 'utf-8');

db.exec(schema);

type TableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

function hasColumn(tableName: string, columnName: string): boolean {
  const rows = db.query<TableInfoRow, []>(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function needsFolderCheckMigration(): boolean {
  const row = db.query<{ sql: string }, [string]>(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`
  ).get('tasks');
  
  if (!row) return false;
  return row.sql.includes('CHECK(folder IN');
}

function migrateTasksRemoveFolderCheck(): void {
  if (!needsFolderCheckMigration()) return;
  
  console.log('[Migration] Removing folder CHECK constraint from tasks table...');
  
  db.exec('PRAGMA foreign_keys = OFF');
  
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        type TEXT CHECK(type IN ('task', 'note')) DEFAULT 'task',
        status TEXT CHECK(status IN ('inbox', 'active', 'backlog', 'done', 'archived', 'deleted')) DEFAULT 'inbox',
        folder TEXT NOT NULL DEFAULT 'personal',
        is_idea INTEGER DEFAULT 0,
        is_mixer_resurfaced INTEGER DEFAULT 0,
        deadline INTEGER,
        scheduled_date TEXT,
        scheduled_time TEXT,
        recurrence_rule TEXT CHECK(recurrence_rule IN ('daily', 'weekdays', 'weekly')),
        google_event_id TEXT,
        created_at INTEGER DEFAULT (unixepoch() * 1000),
        updated_at INTEGER DEFAULT (unixepoch() * 1000),
        last_interaction_at INTEGER DEFAULT (unixepoch() * 1000),
        last_seen_at INTEGER,
        completed_at INTEGER,
        deleted_at INTEGER,
        deadline_notified INTEGER DEFAULT 0,
        source TEXT CHECK(source IN ('bot', 'miniapp', 'calendar')) DEFAULT 'bot',
        telegram_message_id INTEGER
      )
    `);

    db.exec(`
      INSERT INTO tasks_new (
        id, user_id, content, type, status, folder, is_idea, is_mixer_resurfaced,
        deadline, scheduled_date, scheduled_time, recurrence_rule, google_event_id,
        created_at, updated_at, last_interaction_at, last_seen_at,
        completed_at, deleted_at, deadline_notified, source, telegram_message_id
      )
      SELECT
        id, user_id, content, type, status, folder, is_idea, is_mixer_resurfaced,
        deadline, scheduled_date, scheduled_time, recurrence_rule, google_event_id,
        created_at, updated_at, last_interaction_at, last_seen_at,
        completed_at, deleted_at, deadline_notified, source, telegram_message_id
      FROM tasks
    `);

    db.exec('DROP TABLE tasks');
    db.exec('ALTER TABLE tasks_new RENAME TO tasks');

    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user_folder ON tasks(user_id, folder)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline) WHERE deadline IS NOT NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_mixer ON tasks(user_id, status, last_seen_at) WHERE status = \'backlog\'');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_sunset ON tasks(status, last_interaction_at) WHERE status = \'active\'');
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_telegram_idempotency 
      ON tasks(user_id, telegram_message_id) 
      WHERE telegram_message_id IS NOT NULL`);
  });

  tx();
  
  db.exec('PRAGMA foreign_keys = ON');
  
  const fkErrors = db.query<{ table: string }, []>('PRAGMA foreign_key_check').all();
  if (fkErrors.length > 0) {
    console.error('[Migration] Foreign key violations detected:', fkErrors);
    throw new Error(`Foreign key check failed: ${fkErrors.length} violations`);
  }
  
  console.log('[Migration] Tasks table migrated successfully');
}

function seedFoldersForExistingUsers(): void {
  const users = db.query<{ telegram_id: number }, []>(
    'SELECT telegram_id FROM users'
  ).all();
  
  for (const user of users) {
    ensureSystemFolders(user.telegram_id);
  }
  
  if (users.length > 0) {
    console.log(`[Migration] Seeded system folders for ${users.length} existing users`);
  }
}

function runMigrations(): void {
  if (!hasColumn('tasks', 'recurrence_rule')) {
    db.exec("ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT CHECK(recurrence_rule IN ('daily', 'weekdays', 'weekly'))");
  }
  
  migrateTasksRemoveFolderCheck();
  seedFoldersForExistingUsers();

  if (!hasColumn('tasks', 'description')) {
    db.exec("ALTER TABLE tasks ADD COLUMN description TEXT");
  }
}

runMigrations();

console.log('✅ Database initialized at', DB_PATH);

export * from './helpers';
export * from './folders';
