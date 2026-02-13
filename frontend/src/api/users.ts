import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "./client";

export type UserProfile = {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  timezone: string;
  notificationsEnabled: boolean;
  morningDigestTime: string;
  deadlineReminderMinutes: number;
  storiesNotifications: boolean;
  aiClassificationEnabled: boolean;
  hasGoogleCalendar: boolean;
  createdAt: number;
};

export type UserSettingsUpdate = Partial<
  Pick<
    UserProfile,
    | "timezone"
    | "notificationsEnabled"
    | "morningDigestTime"
    | "deadlineReminderMinutes"
    | "storiesNotifications"
    | "aiClassificationEnabled"
  >
>;

async function withUsersFallback<T>(request: (path: string) => Promise<T>, path: string): Promise<T> {
  try {
    return await request(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return request(`/me${path}`);
    }
    throw error;
  }
}

async function fetchMe(): Promise<UserProfile> {
  return withUsersFallback((path) => apiClient.get<UserProfile>(path), "/me");
}

async function patchSettings(payload: UserSettingsUpdate): Promise<UserProfile> {
  try {
    return await apiClient.patch<UserProfile>("/me/settings", payload);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return apiClient.patch<UserProfile>("/me/me/settings", payload);
    }
    throw error;
  }
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: patchSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
