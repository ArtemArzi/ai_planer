import { db } from "../db";
import { bot } from "../bot";

type NotificationUserRow = {
  telegram_id: number;
  timezone: string;
  morning_digest_time: string;
  deadline_reminder_minutes: number;
  notifications_enabled: number;
};

type ReminderTaskRow = {
  id: string;
  content: string;
  deadline: number;
};

type SunsetNotificationRow = {
  user_id: number;
  archived_count: number;
  notifications_enabled: number;
};

function getTimeInTimezone(date: Date, timezone: string): { hour: string; minute: string } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";

  return { hour, minute };
}

function isBotBlockedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = "message" in error ? String((error as any).message ?? "") : "";
  const description = "description" in error ? String((error as any).description ?? "") : "";
  const statusCode = "error_code" in error ? Number((error as any).error_code ?? 0) : 0;

  return (
    statusCode === 403 ||
    /bot was blocked by the user/i.test(message) ||
    /user is deactivated/i.test(message) ||
    /forbidden: bot was blocked by the user/i.test(description)
  );
}

function disableNotificationsForUser(userId: number): void {
  db.run(
    `
    UPDATE users
    SET notifications_enabled = 0,
        updated_at = ?
    WHERE telegram_id = ?
  `,
    [Date.now(), userId],
  );
}

export async function runMorningDigest(now = Date.now()): Promise<number> {
  const users = db
    .query<NotificationUserRow, []>(
      `
      SELECT telegram_id, timezone, morning_digest_time, deadline_reminder_minutes, notifications_enabled
      FROM users
      WHERE notifications_enabled = 1
        AND morning_digest_time IS NOT NULL
    `,
    )
    .all();

  let sentCount = 0;

  for (const user of users) {
    const local = getTimeInTimezone(new Date(now), user.timezone || "UTC");
    const expected = `${local.hour}:${local.minute}`;

    if (expected !== user.morning_digest_time) {
      continue;
    }

    const inboxCount =
      db
        .query<{ count: number }, [number]>(
          "SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = 'inbox'",
        )
        .get(user.telegram_id)?.count ?? 0;
    const activeCount =
      db
        .query<{ count: number }, [number]>(
          "SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = 'active'",
        )
        .get(user.telegram_id)?.count ?? 0;

    if (inboxCount === 0 && activeCount === 0) {
      continue;
    }

    let message = "";
    if (inboxCount > 0) {
      message += `📥 ${inboxCount} задач в Inbox\n`;
    }
    if (activeCount > 0) {
      message += `🎯 ${activeCount} задач на сегодня`;
    }

    try {
      await bot.api.sendMessage(user.telegram_id, message.trim());
      sentCount += 1;
    } catch (error) {
      if (isBotBlockedError(error)) {
        disableNotificationsForUser(user.telegram_id);
      }
    }
  }

  return sentCount;
}

export async function runDeadlineReminders(now = Date.now()): Promise<number> {
  const users = db
    .query<NotificationUserRow, []>(
      `
      SELECT telegram_id, timezone, morning_digest_time, deadline_reminder_minutes, notifications_enabled
      FROM users
      WHERE notifications_enabled = 1
    `,
    )
    .all();

  let reminderCount = 0;

  for (const user of users) {
    const reminderWindowMs = user.deadline_reminder_minutes * 60 * 1000;
    const windowStart = now;
    const windowEnd = now + reminderWindowMs + 60_000;

    const tasks = db
      .query<ReminderTaskRow, [number, number, number]>(
        `
        SELECT id, content, deadline
        FROM tasks
        WHERE user_id = ?
          AND deadline BETWEEN ? AND ?
          AND status IN ('inbox', 'active', 'backlog')
          AND deadline_notified = 0
      `,
      )
      .all(user.telegram_id, windowStart, windowEnd);

    for (const task of tasks) {
      try {
        await bot.api.sendMessage(user.telegram_id, `⏰ Напоминание: "${task.content.slice(0, 80)}"`);
        db.run(
          `
          UPDATE tasks
          SET deadline_notified = 1,
              updated_at = ?
          WHERE id = ?
        `,
          [Date.now(), task.id],
        );
        reminderCount += 1;
      } catch (error) {
        if (isBotBlockedError(error)) {
          disableNotificationsForUser(user.telegram_id);
          break;
        }
      }
    }
  }

  return reminderCount;
}

export async function runSunsetNotifications(now = Date.now()): Promise<number> {
  const rows = db
    .query<SunsetNotificationRow, []>(
      `
      SELECT sn.user_id, sn.archived_count, u.notifications_enabled
      FROM sunset_notifications sn
      INNER JOIN users u ON u.telegram_id = sn.user_id
      WHERE sn.shown = 0
        AND sn.archived_count > 0
    `,
    )
    .all();

  let sentCount = 0;

  for (const row of rows) {
    if (row.notifications_enabled !== 1) {
      db.run(
        `
        UPDATE sunset_notifications
        SET shown = 1,
            archived_count = 0
        WHERE user_id = ?
      `,
        [row.user_id],
      );
      continue;
    }

    const message = `🌇 Sunset архивировал ${row.archived_count} задач(и).\nПроверьте архив в Shelves, если хотите вернуть что-то обратно.`;

    try {
      await bot.api.sendMessage(row.user_id, message);
      db.run(
        `
        UPDATE sunset_notifications
        SET shown = 1,
            archived_count = 0,
            last_archived_at = ?
        WHERE user_id = ?
      `,
        [now, row.user_id],
      );
      sentCount += 1;
    } catch (error) {
      if (isBotBlockedError(error)) {
        disableNotificationsForUser(row.user_id);
        db.run(
          `
          UPDATE sunset_notifications
          SET shown = 1,
              archived_count = 0
          WHERE user_id = ?
        `,
          [row.user_id],
        );
      }
    }
  }

  return sentCount;
}
