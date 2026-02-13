import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import { runSunsetEngine } from "../jobs/sunset";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function createTestDb(): Database {
  const database = new Database(":memory:");
  const schema = readFileSync(join(import.meta.dir, "../db/schema.sql"), "utf-8");
  database.exec(schema);
  return database;
}

function insertUser(database: Database, telegramId = 1): void {
  const now = Date.now();
  database.run(
    `
    INSERT INTO users (telegram_id, created_at, updated_at)
    VALUES (?, ?, ?)
  `,
    [telegramId, now, now],
  );
}

function insertTask(
  database: Database,
  overrides: Partial<{
    id: string;
    userId: number;
    content: string;
    type: "task" | "note";
    status: "inbox" | "active" | "backlog" | "done" | "archived" | "deleted";
    folder: "work" | "personal" | "ideas" | "media" | "notes";
    isIdea: number;
    deadline: number | null;
    lastInteractionAt: number;
    updatedAt: number;
    createdAt: number;
  }> = {},
): string {
  const now = Date.now();
  const id = overrides.id ?? crypto.randomUUID();

  database.run(
    `
    INSERT INTO tasks (
      id, user_id, content, type, status, folder, is_idea, deadline,
      created_at, updated_at, last_interaction_at, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      id,
      overrides.userId ?? 1,
      overrides.content ?? "task",
      overrides.type ?? "task",
      overrides.status ?? "active",
      overrides.folder ?? "personal",
      overrides.isIdea ?? 0,
      overrides.deadline ?? null,
      overrides.createdAt ?? now,
      overrides.updatedAt ?? now,
      overrides.lastInteractionAt ?? now,
      "bot",
    ],
  );

  return id;
}

function getTaskStatus(database: Database, id: string): string | null {
  const row = database.query<{ status: string }, [string]>("SELECT status FROM tasks WHERE id = ?").get(id);
  return row?.status ?? null;
}

describe("Sunset Engine", () => {
  it("archives tasks inactive for 30 days", () => {
    const database = createTestDb();
    insertUser(database, 1);

    const staleTaskId = insertTask(database, {
      userId: 1,
      status: "active",
      lastInteractionAt: Date.now() - 31 * DAY_MS,
      updatedAt: Date.now() - 2 * HOUR_MS,
    });

    const result = runSunsetEngine(database);

    expect(result.archivedCount).toBe(1);
    expect(result.archivedTaskIds).toContain(staleTaskId);
    expect(getTaskStatus(database, staleTaskId)).toBe("archived");
  });

  it("excludes notes from archival", () => {
    const database = createTestDb();
    insertUser(database, 1);

    const noteId = insertTask(database, {
      type: "note",
      status: "active",
      lastInteractionAt: Date.now() - 40 * DAY_MS,
      updatedAt: Date.now() - 2 * HOUR_MS,
    });

    const result = runSunsetEngine(database);

    expect(result.archivedCount).toBe(0);
    expect(getTaskStatus(database, noteId)).toBe("active");
  });

  it("excludes ideas from archival", () => {
    const database = createTestDb();
    insertUser(database, 1);

    const ideaId = insertTask(database, {
      isIdea: 1,
      folder: "ideas",
      status: "active",
      lastInteractionAt: Date.now() - 50 * DAY_MS,
      updatedAt: Date.now() - 2 * HOUR_MS,
    });

    const result = runSunsetEngine(database);

    expect(result.archivedCount).toBe(0);
    expect(getTaskStatus(database, ideaId)).toBe("active");
  });

  it("excludes tasks with deadlines", () => {
    const database = createTestDb();
    insertUser(database, 1);

    const deadlineTaskId = insertTask(database, {
      status: "active",
      deadline: Date.now() + 3 * DAY_MS,
      lastInteractionAt: Date.now() - 35 * DAY_MS,
      updatedAt: Date.now() - 2 * HOUR_MS,
    });

    const result = runSunsetEngine(database);

    expect(result.archivedCount).toBe(0);
    expect(getTaskStatus(database, deadlineTaskId)).toBe("active");
  });

  it("excludes recently edited tasks", () => {
    const database = createTestDb();
    insertUser(database, 1);

    const recentlyEditedId = insertTask(database, {
      status: "active",
      lastInteractionAt: Date.now() - 45 * DAY_MS,
      updatedAt: Date.now() - 30 * 60 * 1000,
    });

    const result = runSunsetEngine(database);

    expect(result.archivedCount).toBe(0);
    expect(getTaskStatus(database, recentlyEditedId)).toBe("active");
  });

  it("stores notification count for ghost trail", () => {
    const database = createTestDb();
    insertUser(database, 1);
    insertUser(database, 2);

    insertTask(database, {
      userId: 1,
      status: "active",
      lastInteractionAt: Date.now() - 31 * DAY_MS,
      updatedAt: Date.now() - 2 * HOUR_MS,
    });
    insertTask(database, {
      userId: 1,
      status: "active",
      lastInteractionAt: Date.now() - 40 * DAY_MS,
      updatedAt: Date.now() - 2 * HOUR_MS,
    });
    insertTask(database, {
      userId: 2,
      status: "active",
      lastInteractionAt: Date.now() - 33 * DAY_MS,
      updatedAt: Date.now() - 2 * HOUR_MS,
    });

    runSunsetEngine(database);

    const user1 = database
      .query<{ archived_count: number; shown: number }, [number]>(
        "SELECT archived_count, shown FROM sunset_notifications WHERE user_id = ?",
      )
      .get(1);
    const user2 = database
      .query<{ archived_count: number; shown: number }, [number]>(
        "SELECT archived_count, shown FROM sunset_notifications WHERE user_id = ?",
      )
      .get(2);

    expect(user1?.archived_count).toBe(2);
    expect(user2?.archived_count).toBe(1);
    expect(user1?.shown).toBe(0);
    expect(user2?.shown).toBe(0);
  });
});
