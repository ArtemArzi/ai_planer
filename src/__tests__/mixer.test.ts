import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import { runMixerEngine } from "../jobs/mixer";

const DAY_MS = 24 * 60 * 60 * 1000;

function createTestDb(): Database {
  const database = new Database(":memory:");
  const schema = readFileSync(join(import.meta.dir, "../db/schema.sql"), "utf-8");
  database.exec(schema);
  return database;
}

function insertUser(database: Database, telegramId = 1, lastMixerRun: number | null = null): void {
  const now = Date.now();
  database.run(
    `
    INSERT INTO users (telegram_id, last_mixer_run, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `,
    [telegramId, lastMixerRun, now, now],
  );
}

function insertBacklogTask(
  database: Database,
  overrides: Partial<{
    userId: number;
    type: "task" | "note";
    isIdea: number;
    lastSeenAt: number | null;
  }> = {},
): string {
  const now = Date.now();
  const id = crypto.randomUUID();

  database.run(
    `
    INSERT INTO tasks (
      id, user_id, content, type, status, folder, is_idea,
      created_at, updated_at, last_interaction_at, last_seen_at, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      id,
      overrides.userId ?? 1,
      "backlog task",
      overrides.type ?? "task",
      "backlog",
      overrides.isIdea ? "ideas" : "personal",
      overrides.isIdea ?? 0,
      now,
      now,
      now,
      overrides.lastSeenAt ?? null,
      "bot",
    ],
  );

  return id;
}

function getTaskState(database: Database, id: string) {
  return database
    .query<{ status: string; is_mixer_resurfaced: number; last_seen_at: number | null }, [string]>(
      "SELECT status, is_mixer_resurfaced, last_seen_at FROM tasks WHERE id = ?",
    )
    .get(id);
}

describe("Mixer Engine", () => {
  it("resurfaces up to 5 tasks from backlog", () => {
    const database = createTestDb();
    insertUser(database, 1, null);

    for (let i = 0; i < 8; i += 1) {
      insertBacklogTask(database);
    }

    const result = runMixerEngine(1, database);

    expect(result.skippedByIdempotency).toBe(false);
    expect(result.resurfacedTaskIds.length).toBe(5);

    const inboxCount = database
      .query<{ count: number }, [number]>("SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = 'inbox'")
      .get(1)?.count;
    expect(inboxCount).toBe(5);
  });

  it("runs only once per 24 hours", () => {
    const database = createTestDb();
    insertUser(database, 1, Date.now() - 2 * 60 * 60 * 1000);
    const taskId = insertBacklogTask(database);

    const result = runMixerEngine(1, database);

    expect(result.skippedByIdempotency).toBe(true);
    expect(result.resurfacedTaskIds).toHaveLength(0);
    expect(getTaskState(database, taskId)?.status).toBe("backlog");
  });

  it("excludes notes", () => {
    const database = createTestDb();
    insertUser(database, 1, null);
    const noteId = insertBacklogTask(database, { type: "note" });

    const result = runMixerEngine(1, database);

    expect(result.resurfacedTaskIds).toHaveLength(0);
    expect(getTaskState(database, noteId)?.status).toBe("backlog");
  });

  it("excludes ideas", () => {
    const database = createTestDb();
    insertUser(database, 1, null);
    const ideaId = insertBacklogTask(database, { isIdea: 1 });

    const result = runMixerEngine(1, database);

    expect(result.resurfacedTaskIds).toHaveLength(0);
    expect(getTaskState(database, ideaId)?.status).toBe("backlog");
  });

  it("respects 14-day cooldown", () => {
    const database = createTestDb();
    insertUser(database, 1, null);

    const freshSeenId = insertBacklogTask(database, { lastSeenAt: Date.now() - 5 * DAY_MS });
    const oldSeenId = insertBacklogTask(database, { lastSeenAt: Date.now() - 20 * DAY_MS });
    const neverSeenId = insertBacklogTask(database, { lastSeenAt: null });

    const result = runMixerEngine(1, database);

    expect(result.resurfacedTaskIds).toContain(oldSeenId);
    expect(result.resurfacedTaskIds).toContain(neverSeenId);
    expect(result.resurfacedTaskIds).not.toContain(freshSeenId);

    expect(getTaskState(database, freshSeenId)?.status).toBe("backlog");
    expect(getTaskState(database, oldSeenId)?.status).toBe("inbox");
    expect(getTaskState(database, neverSeenId)?.status).toBe("inbox");
  });
});
