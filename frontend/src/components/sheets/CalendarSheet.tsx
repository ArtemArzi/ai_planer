import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { openLink } from "@telegram-apps/sdk-react";
import { useUpdateTask, useTaskGoogleCalendarAction } from "../../api/tasks";
import { useMe } from "../../api/users";
import { fetchGoogleConnectUrl } from "../../api/google";
import { useHaptic } from "../../hooks/useHaptic";

type CalendarSheetProps = {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAY_NAMES_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTH_NAMES = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatDayLabel(date: Date, today: Date): string {
  if (isSameDay(date, today)) return "Сегодня";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, tomorrow)) return "Завтра";
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

type TimePreset = {
  label: string;
  icon: string;
  time: string;
};

const TIME_PRESETS: TimePreset[] = [
  { label: "Утро", icon: "wb_sunny", time: "09:00" },
  { label: "Обед", icon: "restaurant", time: "12:00" },
  { label: "День", icon: "wb_cloudy", time: "14:00" },
  { label: "Вечер", icon: "dark_mode", time: "19:00" },
];

function buildDayStrip(startDate: Date, count: number): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = startOfDay(new Date(startDate));
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

export function CalendarSheet({ taskId, open, onOpenChange }: CalendarSheetProps) {
  const updateTask = useUpdateTask();
  const googleCalendarAction = useTaskGoogleCalendarAction();
  const { data: me } = useMe();
  const haptic = useHaptic();

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState("");
  const [showCustomTime, setShowCustomTime] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(() => buildDayStrip(today, 14), [today]);

  useEffect(() => {
    if (!open) {
      setSelectedDate(null);
      setSelectedTime(null);
      setCustomTime("");
      setShowCustomTime(false);
    }
  }, [open]);

  const effectiveTime = customTime || selectedTime;
  const canSchedule = !!selectedDate;
  const canAddToGoogle = canSchedule && !!effectiveTime;
  const isPending = updateTask.isPending || googleCalendarAction.isPending;

  const scheduleTask = async (addToGoogle: boolean) => {
    if (!taskId || !selectedDate) return;

    const scheduledDate = toDateString(selectedDate);
    const scheduledTime = effectiveTime || null;

    let deadline: number | null = null;
    if (scheduledTime) {
      const [hours, minutes] = scheduledTime.split(":").map(Number);
      const d = new Date(selectedDate);
      d.setHours(hours, minutes, 0, 0);
      deadline = d.getTime();
    }

    try {
      const updated = await updateTask.mutateAsync({
        id: taskId,
        updates: {
          status: "active",
          scheduledDate,
          scheduledTime,
          deadline,
        },
      });

      if (addToGoogle) {
        if (!me?.hasGoogleCalendar) {
          try {
            const url = await fetchGoogleConnectUrl();
            if (openLink.isAvailable()) {
              openLink(url, { tryInstantView: false });
            } else {
              window.open(url, "_blank");
            }
          } catch {
          }
        } else {
          await googleCalendarAction.mutateAsync({
            id: updated.id,
            action: "add",
          });
        }
      }

      haptic.notification("success");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to schedule task", error);
      haptic.notification("error");
    }
  };

  return (
    <Drawer.Root fixed open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-tg-secondary-bg p-4"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-tg-hint/40" />
          <Drawer.Title className="text-base font-semibold text-tg-text">Запланировать</Drawer.Title>

          <div
            ref={stripRef}
            className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-1 scrollbar-none"
          >
            {days.map((day) => {
              const isToday = isSameDay(day, today);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const dayOfWeek = DAY_NAMES_SHORT[day.getDay()];
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    setSelectedDate(day);
                    haptic.selection();
                  }}
                  className={`flex flex-shrink-0 flex-col items-center rounded-xl px-2.5 py-2 transition-transform active:scale-95 ${
                    isSelected
                      ? "bg-tg-button text-tg-button-text"
                      : isToday
                        ? "bg-tg-button/10 text-tg-button"
                        : "bg-tg-bg text-tg-text"
                  }`}
                  style={{ minWidth: "3.2rem" }}
                >
                  <span className={`text-[10px] ${isWeekend && !isSelected ? "text-red-400" : ""}`}>
                    {dayOfWeek}
                  </span>
                  <span className="text-lg font-semibold leading-tight">{day.getDate()}</span>
                </button>
              );
            })}
          </div>

          {selectedDate && (
            <p className="mt-2 text-xs text-tg-hint">{formatDayLabel(selectedDate, today)}</p>
          )}

          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {TIME_PRESETS.map((preset) => {
              const isActive = selectedTime === preset.time && !customTime;

              return (
                <button
                  key={preset.time}
                  type="button"
                  onClick={() => {
                    setSelectedTime(preset.time);
                    setCustomTime("");
                    setShowCustomTime(false);
                    haptic.selection();
                  }}
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] transition-transform active:scale-95 ${
                    isActive
                      ? "bg-tg-button text-tg-button-text"
                      : "bg-tg-bg text-tg-text"
                  }`}
                >
                  <span className="material-symbols-outlined text-base">{preset.icon}</span>
                  {preset.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setShowCustomTime((prev) => !prev);
                setSelectedTime(null);
                haptic.selection();
              }}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] transition-transform active:scale-95 ${
                customTime || showCustomTime
                  ? "bg-tg-button text-tg-button-text"
                  : "bg-tg-bg text-tg-text"
              }`}
            >
              <span className="material-symbols-outlined text-base">schedule</span>
              {customTime || "Точно"}
            </button>
          </div>

          {showCustomTime && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="time"
                data-vaul-no-drag
                value={customTime}
                onChange={(e) => {
                  setCustomTime(e.target.value);
                  setSelectedTime(null);
                  haptic.selection();
                }}
                className="h-10 flex-1 rounded-xl border border-tg-button/30 bg-tg-bg px-3 text-sm text-tg-text outline-none"
              />
              {customTime && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomTime("");
                    setShowCustomTime(false);
                    haptic.selection();
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-bg text-tg-hint active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void scheduleTask(false)}
              disabled={!canSchedule || isPending}
              className="h-11 rounded-xl bg-tg-button text-sm font-medium text-tg-button-text disabled:opacity-40"
            >
              Запланировать
            </button>
            <button
              type="button"
              onClick={() => void scheduleTask(true)}
              disabled={!canAddToGoogle || isPending}
              className="h-11 rounded-xl bg-blue-500/20 text-sm font-medium text-blue-700 disabled:opacity-40"
            >
              + Google
            </button>
          </div>

          {!me?.hasGoogleCalendar && canAddToGoogle && (
            <p className="mt-2 text-center text-[11px] text-tg-hint">
              Нажмите «+ Google» чтобы подключить календарь
            </p>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
