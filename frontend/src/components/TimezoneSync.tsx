import { useEffect, useRef } from "react";
import { useMe, useUpdateSettings } from "../api/users";

export function TimezoneSync() {
  const { data: me } = useMe();
  const updateSettings = useUpdateSettings();
  const pendingTimezone = useRef<string | null>(null);

  useEffect(() => {
    if (!me) {
      return;
    }

    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (!deviceTimezone) {
      return;
    }

    if (me.timezone === deviceTimezone) {
      pendingTimezone.current = null;
      return;
    }

    if (pendingTimezone.current === deviceTimezone || updateSettings.isPending) {
      return;
    }

    pendingTimezone.current = deviceTimezone;
    updateSettings.mutate({ timezone: deviceTimezone });
  }, [me?.timezone, updateSettings.isPending]);

  return null;
}
