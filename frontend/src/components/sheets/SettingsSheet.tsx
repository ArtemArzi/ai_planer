import { useEffect, useState } from "react";
import { openLink } from "@telegram-apps/sdk-react";
import { Drawer } from "vaul";
import { useMe, useUpdateSettings } from "../../api/users";
import { fetchGoogleConnectUrl, useDisconnectGoogleCalendar } from "../../api/google";
import { useHaptic } from "../../hooks/useHaptic";

type SettingsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const { data: me } = useMe();
  const updateSettings = useUpdateSettings();
  const disconnectGoogleCalendar = useDisconnectGoogleCalendar();
  const haptic = useHaptic();

  const [morningDigestTime, setMorningDigestTime] = useState("09:00");
  const [deadlineReminderMinutes, setDeadlineReminderMinutes] = useState(30);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [aiClassificationEnabled, setAiClassificationEnabled] = useState(true);
  const [storiesNotifications, setStoriesNotifications] = useState(true);

  useEffect(() => {
    if (!me) {
      return;
    }

    setMorningDigestTime(me.morningDigestTime);
    setDeadlineReminderMinutes(me.deadlineReminderMinutes);
    setNotificationsEnabled(me.notificationsEnabled);
    setAiClassificationEnabled(me.aiClassificationEnabled);
    setStoriesNotifications(me.storiesNotifications);
  }, [me]);

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      morningDigestTime,
      deadlineReminderMinutes,
      notificationsEnabled,
      aiClassificationEnabled,
      storiesNotifications,
    });

    haptic.notification("success");
    onOpenChange(false);
  };

  const handleGoogleCalendarClick = async () => {
    try {
      if (me?.hasGoogleCalendar) {
        await disconnectGoogleCalendar.mutateAsync();
        haptic.notification("success");
        return;
      }

      const googleAuthUrl = await fetchGoogleConnectUrl();

      if (openLink.isAvailable()) {
        openLink(googleAuthUrl, {
          tryInstantView: false,
        });
      } else {
        window.open(googleAuthUrl, "_blank");
      }
    } catch (error) {
      console.error("Google Calendar action failed", error);
      haptic.notification("error");
    }
  };

  return (
    <Drawer.Root fixed repositionInputs={false} open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-tg-secondary-bg">
          <div className="mx-auto mb-4 mt-4 h-1.5 w-10 rounded-full bg-tg-hint/40" />
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <Drawer.Title className="text-lg font-semibold text-tg-text">Настройки</Drawer.Title>

            <div className="mt-4 space-y-3">
              <label className="block text-sm text-tg-hint">Часовой пояс</label>
              <input
                type="text"
                value={me?.timezone ?? "UTC"}
                readOnly
                className="h-10 w-full rounded-xl border border-black/10 bg-white/60 px-3 text-sm text-tg-text"
              />

              <label className="block text-sm text-tg-hint">Утренний дайджест</label>
              <input
                data-vaul-no-drag
                type="time"
                value={morningDigestTime}
                onChange={(event) => setMorningDigestTime(event.target.value)}
                className="h-10 w-full rounded-xl border border-black/10 bg-white/70 px-3 text-sm text-tg-text"
              />

              <label className="block text-sm text-tg-hint">Напоминание о дедлайне (мин)</label>
              <input
                data-vaul-no-drag
                type="number"
                min={0}
                max={240}
                value={deadlineReminderMinutes}
                onChange={(event) => setDeadlineReminderMinutes(Number(event.target.value) || 0)}
                className="h-10 w-full rounded-xl border border-black/10 bg-white/70 px-3 text-sm text-tg-text"
              />

              <label className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm text-tg-text">
                Уведомления
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(event) => setNotificationsEnabled(event.target.checked)}
                />
              </label>

              <label className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm text-tg-text">
                AI классификация
                <input
                  type="checkbox"
                  checked={aiClassificationEnabled}
                  onChange={(event) => setAiClassificationEnabled(event.target.checked)}
                />
              </label>

              <label className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm text-tg-text">
                Показывать истории идей
                <input
                  type="checkbox"
                  checked={storiesNotifications}
                  onChange={(event) => setStoriesNotifications(event.target.checked)}
                />
              </label>

              <button
                type="button"
                onClick={handleGoogleCalendarClick}
                disabled={disconnectGoogleCalendar.isPending || !me}
                className="h-10 w-full rounded-xl bg-blue-500/20 text-sm font-medium text-blue-700 disabled:opacity-60"
              >
                {me?.hasGoogleCalendar
                  ? disconnectGoogleCalendar.isPending
                    ? "Отключение Google Calendar..."
                    : "Отключить Google Calendar"
                  : "Подключить Google Calendar"}
              </button>

              <button type="button" className="h-10 w-full rounded-xl bg-red-500/15 text-sm font-medium text-red-600">
                Удалить аккаунт
              </button>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={updateSettings.isPending}
              className="mt-4 h-11 w-full rounded-xl bg-tg-button text-sm font-medium text-tg-button-text disabled:opacity-60"
            >
              {updateSettings.isPending ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
