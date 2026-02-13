import type { Database } from "bun:sqlite";
import { db } from "../db";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type StaleTaskRow = {
  id: string;
  user_id: number;
};

export type SunsetRunResult = {
  archivedTaskIds: string[];
  archivedCount: number;
  userCounts: Record<number, number>;
};

export function runSunsetEngine(database: Database = db): SunsetRunResult {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * DAY_MS;
  const oneHourAgo = now - HOUR_MS;

  const tx = database.transaction((): SunsetRunResult => {
    const staleTasks = database
      .query<StaleTaskRow, [number, number]>(
        `
        SELECT id, user_id
        FROM tasks
        WHERE status = 'active'
          AND is_idea = 0
          AND type = 'task'
          AND deadline IS NULL
          AND scheduled_date IS NULL
          AND recurrence_rule IS NULL
          AND last_interaction_at < ?
          AND updated_at < ?
      `,
      )
      .all(thirtyDaysAgo, oneHourAgo);

    const userCounts: Record<number, number> = {};
    const archivedTaskIds: string[] = [];

    for (const task of staleTasks) {
      database.run(
        `
        UPDATE tasks
        SET status = 'archived', updated_at = ?
        WHERE id = ?
      `,
        [now, task.id],
      );

      archivedTaskIds.push(task.id);
      userCounts[task.user_id] = (userCounts[task.user_id] ?? 0) + 1;
    }

    for (const [userId, archivedCount] of Object.entries(userCounts)) {
      database.run(
        `
        INSERT INTO sunset_notifications (user_id, archived_count, last_archived_at, shown)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(user_id) DO UPDATE SET
          archived_count = sunset_notifications.archived_count + excluded.archived_count,
          last_archived_at = excluded.last_archived_at,
          shown = 0
      `,
        [Number(userId), archivedCount, now],
      );
    }

    return {
      archivedTaskIds,
      archivedCount: archivedTaskIds.length,
      userCounts,
    };
  });

  return tx();
}
