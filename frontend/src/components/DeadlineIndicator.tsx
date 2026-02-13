type DeadlineStatus = "overdue" | "today" | "tomorrow" | "future";

type DeadlineIndicatorProps = {
  deadline: number;
  size?: "sm" | "md";
  className?: string;
};

function getDeadlineStatus(deadline: number): DeadlineStatus {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrowStart = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);

  if (deadline < now.getTime()) {
    return "overdue";
  }
  if (deadlineDate < tomorrowStart) {
    return "today";
  }
  if (deadlineDate < dayAfterTomorrowStart) {
    return "tomorrow";
  }
  return "future";
}

const statusColors: Record<DeadlineStatus, string> = {
  overdue: "text-red-500",
  today: "text-orange-500",
  tomorrow: "text-yellow-500",
  future: "text-tg-hint",
};

function formatDeadline(deadline: number): string {
  const date = new Date(deadline);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DeadlineIndicator({ deadline, size = "md", className = "" }: DeadlineIndicatorProps) {
  const status = getDeadlineStatus(deadline);
  const iconSize = size === "sm" ? "text-sm" : "text-base";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div className={`inline-flex items-center gap-1 ${statusColors[status]} ${textSize} ${className}`}>
      <span className={`material-symbols-outlined ${iconSize}`}>event</span>
      <span>{formatDeadline(deadline)}</span>
    </div>
  );
}
