import { db } from "../db";
import { readdir, stat, unlink } from "fs/promises";
import { join, resolve } from "path";

const DAY_MS = 24 * 60 * 60 * 1000;
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

async function listFilesRecursive(rootPath: string): Promise<string[]> {
  const files: string[] = [];

  let entries: string[];
  try {
    entries = await readdir(rootPath);
  } catch {
    return files;
  }

  for (const entryName of entries) {
    const absolute = join(rootPath, entryName);

    try {
      const meta = await stat(absolute);
      if (meta.isDirectory()) {
        files.push(...(await listFilesRecursive(absolute)));
      } else if (meta.isFile()) {
        files.push(absolute);
      }
    } catch {
      continue;
    }
  }

  return files;
}

export async function purgeOldDeletedTasks(now = Date.now()): Promise<number> {
  const ninetyDaysAgo = now - 90 * DAY_MS;

  const rows = db
    .query<{ id: string; file_path: string | null }, [number]>(
      `
      SELECT t.id, m.file_path
      FROM tasks t
      LEFT JOIN media m ON m.task_id = t.id
      WHERE t.status = 'deleted'
        AND t.deleted_at < ?
    `,
    )
    .all(ninetyDaysAgo);

  for (const row of rows) {
    if (!row.file_path) {
      continue;
    }

    try {
      await unlink(row.file_path);
    } catch {}
  }

  const result = db.run(
    `
    DELETE FROM tasks
    WHERE status = 'deleted'
      AND deleted_at < ?
  `,
    [ninetyDaysAgo],
  );

  return result.changes;
}

export async function cleanupOrphanFiles(uploadDir = "./uploads", now = Date.now()): Promise<number> {
  const files = await listFilesRecursive(uploadDir);

  if (files.length === 0) {
    return 0;
  }

  const referenced = new Set(
    db
      .query<{ file_path: string }, []>(
        `
        SELECT file_path
        FROM media
        WHERE file_path IS NOT NULL
      `,
      )
      .all()
      .map((row) => resolve(row.file_path)),
  );

  let deleted = 0;

  for (const filePath of files) {
    const normalized = resolve(filePath);
    if (referenced.has(normalized)) {
      continue;
    }

    try {
      const meta = await stat(filePath);
      if (now - meta.mtimeMs < ORPHAN_GRACE_MS) {
        continue;
      }

      await unlink(filePath);
      deleted += 1;
    } catch {}
  }

  return deleted;
}

export function cleanupOldQueueJobs(now = Date.now()): number {
  const sevenDaysAgo = now - 7 * DAY_MS;

  const result = db.run(
    `
    DELETE FROM media_queue
    WHERE status IN ('completed', 'failed')
      AND completed_at IS NOT NULL
      AND completed_at < ?
  `,
    [sevenDaysAgo],
  );

  return result.changes;
}

export function archiveOldDoneTasks(now = Date.now()): number {
  const sevenDaysAgo = now - 7 * DAY_MS;

  const result = db.run(
    `
    UPDATE tasks
    SET status = 'archived',
        updated_at = ?
    WHERE status = 'done'
      AND type = 'task'
      AND completed_at < ?
  `,
    [now, sevenDaysAgo],
  );

  return result.changes;
}

export async function runCleanupJobs(now = Date.now()): Promise<{
  purgedDeletedTasks: number;
  deletedOrphanFiles: number;
  cleanedQueueJobs: number;
  archivedDoneTasks: number;
}> {
  const purgedDeletedTasks = await purgeOldDeletedTasks(now);
  const deletedOrphanFiles = await cleanupOrphanFiles("./uploads", now);
  const cleanedQueueJobs = cleanupOldQueueJobs(now);
  const archivedDoneTasks = archiveOldDoneTasks(now);

  return {
    purgedDeletedTasks,
    deletedOrphanFiles,
    cleanedQueueJobs,
    archivedDoneTasks,
  };
}
