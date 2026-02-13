import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export function useGoogleCalendarCallbackSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentUrl = new URL(window.location.href);
    const callbackStatus = currentUrl.searchParams.get("googleCalendar");
    if (!callbackStatus) {
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["me"] });

    currentUrl.searchParams.delete("googleCalendar");
    currentUrl.searchParams.delete("reason");

    const search = currentUrl.searchParams.toString();
    const nextRelativeUrl = `${currentUrl.pathname}${search ? `?${search}` : ""}${currentUrl.hash}`;
    window.history.replaceState({}, "", nextRelativeUrl);
  }, [queryClient]);
}
