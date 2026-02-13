import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { retrieveLaunchParams } from "@telegram-apps/sdk-react";
import { apiClient } from "./client";

type GoogleConnectUrlResponse = {
  url: string;
};

type GoogleDisconnectResponse = {
  success: boolean;
};

export async function fetchGoogleConnectUrl(): Promise<string> {
  const response = await apiClient.get<GoogleConnectUrlResponse>("/google/auth/url");
  return response.url;
}

async function disconnectGoogleCalendar(): Promise<GoogleDisconnectResponse> {
  return apiClient.post<GoogleDisconnectResponse>("/google/disconnect");
}

export function useDisconnectGoogleCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectGoogleCalendar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

function getGoogleCallbackStatus(): string | null {
  try {
    const { startParam } = retrieveLaunchParams();
    if (startParam?.startsWith("google_connected")) return "connected";
    if (startParam?.startsWith("google_error")) return "error";
  } catch {}

  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("googleCalendar");
}

export function useGoogleCalendarCallbackSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const status = getGoogleCallbackStatus();
    if (!status) return;

    queryClient.invalidateQueries({ queryKey: ["me"] });

    if (typeof window !== "undefined") {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("googleCalendar");
      currentUrl.searchParams.delete("reason");
      const search = currentUrl.searchParams.toString();
      const nextRelativeUrl = `${currentUrl.pathname}${search ? `?${search}` : ""}${currentUrl.hash}`;
      window.history.replaceState({}, "", nextRelativeUrl);
    }
  }, [queryClient]);
}
