import { db } from "../db";

const PROCESSING_STUCK_MS = 5 * 60 * 1000;

export function recoverStuckJobs(now = Date.now()): number {
  const stuckBefore = now - PROCESSING_STUCK_MS;

  const result = db.run(
    `
    UPDATE media_queue
    SET status = 'pending',
        next_attempt_at = ?,
        last_error = 'Recovered stuck processing job on startup'
    WHERE status = 'processing'
      AND created_at < ?
  `,
    [now, stuckBefore],
  );

  return result.changes;
}
