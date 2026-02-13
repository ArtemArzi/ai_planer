import type { Database } from "bun:sqlite";
import { db } from "../db";

const DAY_MS = 24 * 60 * 60 * 1000;

type MixerCandidateRow = {
  id: string;
};

export type MixerRunResult = {
  resurfacedTaskIds: string[];
  skippedByIdempotency: boolean;
};

export function runMixerEngine(userId: number, database: Database = db): MixerRunResult {
  const now = Date.now();
  const oneDayAgo = now - DAY_MS;
  const fourteenDaysAgo = now - 14 * DAY_MS;

  const tx = database.transaction((): MixerRunResult => {
    const user = database
      .query<{ last_mixer_run: number | null }, [number]>(
        "SELECT last_mixer_run FROM users WHERE telegram_id = ?",
      )
      .get(userId);

    if (!user) {
      return { resurfacedTaskIds: [], skippedByIdempotency: true };
    }

    const lastRun = user.last_mixer_run ?? 0;
    if (lastRun > oneDayAgo) {
      return { resurfacedTaskIds: [], skippedByIdempotency: true };
    }

    const candidates = database
      .query<MixerCandidateRow, [number, number]>(
        `
        SELECT id
        FROM tasks
        WHERE user_id = ?
          AND status = 'backlog'
          AND type = 'task'
          AND is_idea = 0
          AND (last_seen_at IS NULL OR last_seen_at < ?)
        ORDER BY RANDOM()
        LIMIT 5
      `,
      )
      .all(userId, fourteenDaysAgo);

    const resurfacedTaskIds: string[] = [];

    for (const candidate of candidates) {
      database.run(
        `
        UPDATE tasks
        SET status = 'inbox',
            is_mixer_resurfaced = 1,
            last_seen_at = ?,
            updated_at = ?
        WHERE id = ?
      `,
        [now, now, candidate.id],
      );

      resurfacedTaskIds.push(candidate.id);
    }

    database.run(
      `
      UPDATE users
      SET last_mixer_run = ?, updated_at = ?
      WHERE telegram_id = ?
    `,
      [now, now, userId],
    );

    return {
      resurfacedTaskIds,
      skippedByIdempotency: false,
    };
  });

  return tx();
}
