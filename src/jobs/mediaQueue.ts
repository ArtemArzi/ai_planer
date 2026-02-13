import OpenAI from "openai";
import { createReadStream } from "fs";
import { db } from "../db";
import { env } from "../env";

const MEDIA_QUEUE_CONFIG = {
  MAX_JOBS_PER_USER_PER_MINUTE: 5,
  RATE_LIMIT_WINDOW_MS: 60_000,
  MAX_ATTEMPTS: 3,
  RETRY_DELAYS_MS: [1000, 2000, 4000],
  POLL_INTERVAL_MS: 1000,
  PROCESSING_TIMEOUT_MS: 30_000,
  FALLBACK_CONTENT: "Голосовое сообщение (не удалось расшифровать)",
} as const;

type QueueJobRow = {
  id: string;
  media_id: string;
  user_id: number;
  job_type: "transcription" | "link_preview";
  file_path: string | null;
  url: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  created_at: number;
  next_attempt_at: number;
  completed_at: number | null;
  last_error: string | null;
};

type TranscriptionResult = {
  text: string;
};

let openai: OpenAI | null = null;
let processorTimer: Timer | null = null;

function getOpenAIClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (!openai) {
    openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  return openai;
}

export function startMediaQueueProcessor(): void {
  if (processorTimer) {
    return;
  }

  processorTimer = setInterval(() => {
    processNextMediaQueueJob().catch((error) => {
      console.error("[MediaQueue] Processor loop error", error);
    });
  }, MEDIA_QUEUE_CONFIG.POLL_INTERVAL_MS);

  console.log("[MediaQueue] Processor started");
}

export function stopMediaQueueProcessor(): void {
  if (!processorTimer) {
    return;
  }

  clearInterval(processorTimer);
  processorTimer = null;
}

function getNextPendingJob(now: number): QueueJobRow | null {
  return db
    .query<QueueJobRow, [number]>(
      `
      SELECT *
      FROM media_queue
      WHERE status = 'pending'
        AND next_attempt_at <= ?
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT 1
    `,
    )
    .get(now);
}

function canProcessUserJob(userId: number, now: number): boolean {
  const row = db
    .query<{ count: number }, [number, number]>(
      `
      SELECT COUNT(*) as count
      FROM media_queue
      WHERE user_id = ?
        AND status IN ('processing', 'completed')
        AND created_at > ?
    `,
    )
    .get(userId, now - MEDIA_QUEUE_CONFIG.RATE_LIMIT_WINDOW_MS);

  return (row?.count ?? 0) < MEDIA_QUEUE_CONFIG.MAX_JOBS_PER_USER_PER_MINUTE;
}

function markJobPending(jobId: string, nextAttemptAt: number, lastError: string | null): void {
  db.run(
    `
    UPDATE media_queue
    SET status = 'pending',
        next_attempt_at = ?,
        last_error = ?
    WHERE id = ?
  `,
    [nextAttemptAt, lastError, jobId],
  );
}

function markJobProcessing(jobId: string): void {
  db.run(
    `
    UPDATE media_queue
    SET status = 'processing'
    WHERE id = ?
  `,
    [jobId],
  );
}

function markJobCompleted(jobId: string, completedAt: number): void {
  db.run(
    `
    UPDATE media_queue
    SET status = 'completed',
        completed_at = ?
    WHERE id = ?
  `,
    [completedAt, jobId],
  );
}

function markJobFailed(jobId: string, attempts: number, errorMessage: string): void {
  db.run(
    `
    UPDATE media_queue
    SET status = 'failed',
        attempts = ?,
        last_error = ?
    WHERE id = ?
  `,
    [attempts, errorMessage, jobId],
  );
}

function incrementJobRetry(job: QueueJobRow, errorMessage: string, now: number): void {
  const attempts = job.attempts + 1;

  if (attempts >= job.max_attempts) {
    markJobFailed(job.id, attempts, errorMessage);
    applyFallbackForMedia(job.media_id);
    return;
  }

  const delay = MEDIA_QUEUE_CONFIG.RETRY_DELAYS_MS[Math.min(attempts - 1, MEDIA_QUEUE_CONFIG.RETRY_DELAYS_MS.length - 1)];

  db.run(
    `
    UPDATE media_queue
    SET status = 'pending',
        attempts = ?,
        next_attempt_at = ?,
        last_error = ?
    WHERE id = ?
  `,
    [attempts, now + delay, errorMessage, job.id],
  );
}

function applyFallbackForMedia(mediaId: string): void {
  db.run(
    `
    UPDATE media
    SET transcription = ?,
        transcription_status = 'failed'
    WHERE id = ?
  `,
    [MEDIA_QUEUE_CONFIG.FALLBACK_CONTENT, mediaId],
  );

  const row = db
    .query<{ task_id: string }, [string]>("SELECT task_id FROM media WHERE id = ?")
    .get(mediaId);

  if (!row) {
    return;
  }

  db.run(
    `
    UPDATE tasks
    SET content = ?,
        updated_at = ?
    WHERE id = ?
      AND (content = 'Голосовое сообщение' OR content IS NULL OR content = '')
  `,
    [MEDIA_QUEUE_CONFIG.FALLBACK_CONTENT, Date.now(), row.task_id],
  );
}

async function processTranscriptionJob(job: QueueJobRow): Promise<void> {
  if (!job.file_path) {
    throw new Error("No file path for transcription job");
  }

  const client = getOpenAIClient();

  const transcriptionPromise = client.audio.transcriptions.create({
    file: createReadStream(job.file_path) as any,
    model: "whisper-1",
    language: "ru",
  }) as Promise<TranscriptionResult>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("Transcription timeout"));
    }, MEDIA_QUEUE_CONFIG.PROCESSING_TIMEOUT_MS);
  });

  const transcription = await Promise.race([transcriptionPromise, timeoutPromise]);

  db.run(
    `
    UPDATE media
    SET transcription = ?,
        transcription_status = 'completed'
    WHERE id = ?
  `,
    [transcription.text, job.media_id],
  );

  const mediaTaskRow = db
    .query<{ task_id: string }, [string]>("SELECT task_id FROM media WHERE id = ?")
    .get(job.media_id);

  if (!mediaTaskRow) {
    return;
  }

  db.run(
    `
    UPDATE tasks
    SET content = ?,
        updated_at = ?,
        last_interaction_at = ?
    WHERE id = ?
      AND (content = 'Голосовое сообщение' OR content = ? OR content IS NULL OR content = '')
  `,
    [
      transcription.text,
      Date.now(),
      Date.now(),
      mediaTaskRow.task_id,
      MEDIA_QUEUE_CONFIG.FALLBACK_CONTENT,
    ],
  );
}

export async function processNextMediaQueueJob(): Promise<boolean> {
  const now = Date.now();
  const job = getNextPendingJob(now);

  if (!job) {
    return false;
  }

  if (!canProcessUserJob(job.user_id, now)) {
    markJobPending(job.id, now + MEDIA_QUEUE_CONFIG.RATE_LIMIT_WINDOW_MS, "Rate limited");
    return false;
  }

  markJobProcessing(job.id);

  try {
    if (job.job_type === "transcription") {
      await processTranscriptionJob(job);
    }

    markJobCompleted(job.id, Date.now());
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    incrementJobRetry(job, message, Date.now());
    return false;
  }
}

export function getMediaQueueConfig() {
  return MEDIA_QUEUE_CONFIG;
}
