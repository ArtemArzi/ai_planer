import { Cron } from "croner";
import { runSunsetEngine } from "./sunset";
import { runMixerEngine } from "./mixer";
import { runMorningDigest, runDeadlineReminders, runSunsetNotifications } from "./notifications";
import { recoverStuckJobs } from "./startup";
import { startMediaQueueProcessor, stopMediaQueueProcessor } from "./mediaQueue";
import { getAllUserIds } from "../db/users";
import {
  archiveOldDoneTasks,
  cleanupOldQueueJobs,
  cleanupOrphanFiles,
  purgeOldDeletedTasks,
} from "./cleanup";

type JobHandler = () => Promise<void> | void;

let cronJobs: Cron[] = [];
let backgroundJobsStarted = false;

async function runJob(name: string, handler: JobHandler): Promise<void> {
  const startedAt = Date.now();
  console.log(`[Jobs] ${name} started`);

  try {
    await handler();
    const elapsedMs = Date.now() - startedAt;
    console.log(`[Jobs] ${name} completed in ${elapsedMs}ms`);
  } catch (error) {
    console.error(`[Jobs] ${name} failed`, error);
  }
}

function registerCron(name: string, pattern: string, handler: JobHandler, timezone = "UTC"): void {
  const cron = new Cron(pattern, { timezone }, async () => {
    await runJob(name, handler);
  });

  cronJobs.push(cron);
  console.log(`[Jobs] Registered ${name} (${pattern}, ${timezone})`);
}

export function registerBackgroundJobs(): void {
  if (backgroundJobsStarted) {
    return;
  }

  backgroundJobsStarted = true;

  const recovered = recoverStuckJobs();
  if (recovered > 0) {
    console.log(`[Jobs] Recovery reset ${recovered} stuck media queue jobs`);
  }

  startMediaQueueProcessor();

  registerCron("sunset", "0 3 * * *", async () => {
    const result = runSunsetEngine();
    console.log(`[Jobs] Sunset archived ${result.archivedCount} tasks`);

    if (result.archivedCount > 0) {
      const notified = await runSunsetNotifications();
      if (notified > 0) {
        console.log(`[Jobs] Sunset notifications sent: ${notified}`);
      }
    }
  });

  registerCron("mixer", "0 9 * * *", () => {
    const userIds = getAllUserIds();
    let totalResurfaced = 0;
    for (const userId of userIds) {
      const result = runMixerEngine(userId);
      if (!result.skippedByIdempotency && result.resurfacedTaskIds.length > 0) {
        totalResurfaced += result.resurfacedTaskIds.length;
      }
    }
    if (totalResurfaced > 0) {
      console.log(`[Jobs] Mixer resurfaced ${totalResurfaced} tasks across ${userIds.length} users`);
    }
  }, "Asia/Yekaterinburg");

  registerCron("morning-digest", "* * * * *", async () => {
    const sent = await runMorningDigest();
    if (sent > 0) {
      console.log(`[Jobs] Morning digest sent to ${sent} users`);
    }
  });

  registerCron("deadline-reminders", "* * * * *", async () => {
    const sent = await runDeadlineReminders();
    if (sent > 0) {
      console.log(`[Jobs] Deadline reminders sent: ${sent}`);
    }
  });

  registerCron("trash-purge", "0 5 * * *", async () => {
    const purged = await purgeOldDeletedTasks();
    const cleanedQueue = cleanupOldQueueJobs();
    const archivedDone = archiveOldDoneTasks();
    console.log(
      `[Jobs] Cleanup daily: purged=${purged}, queue=${cleanedQueue}, archivedDone=${archivedDone}`,
    );
  });

  registerCron("orphan-files", "0 4 * * 0", async () => {
    const deleted = await cleanupOrphanFiles("./uploads");
    console.log(`[Jobs] Orphan files deleted: ${deleted}`);
  });
}

export function stopBackgroundJobs(): void {
  for (const cron of cronJobs) {
    cron.stop();
  }

  cronJobs = [];
  backgroundJobsStarted = false;
  stopMediaQueueProcessor();
}
