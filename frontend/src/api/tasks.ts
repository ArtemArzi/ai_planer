import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { hapticFeedback } from "@telegram-apps/sdk-react";
import { apiClient } from "./client";

const TASK_QUERY_STALE_MS = 10 * 1000;
const TASK_SYNC_INTERVAL_MS = 10 * 1000;

export type TaskStatus = "inbox" | "active" | "backlog" | "done" | "archived" | "deleted";
export type FolderSlug = string;
/** @deprecated Use FolderSlug */
export type Folder = FolderSlug;
export type RecurrenceRule = "daily" | "weekdays" | "weekly";

export type Task = {
  id: string;
  userId: number;
  content: string;
  description: string | null;
  type: "task" | "note";
  status: TaskStatus;
  folder: Folder;
  isIdea: boolean;
  isMixerResurfaced: boolean;
  deadline: number | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  recurrenceRule: RecurrenceRule | null;
  googleEventId: string | null;
  createdAt: number;
  updatedAt: number;
  lastInteractionAt: number;
  completedAt: number | null;
  deletedAt: number | null;
};

type TasksFilter = {
  status?: TaskStatus;
  folder?: Folder;
  forDate?: string;
  limit?: number;
  cursor?: string;
};

type TasksQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

type TaskUpdatePayload = Partial<Omit<Task, "id" | "userId" | "createdAt">> & {
  expectedUpdatedAt?: number;
};

type TaskCreatePayload = {
  content: string;
  folder: Folder;
  status?: TaskStatus;
  deadline?: number | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  recurrenceRule?: RecurrenceRule | null;
};

type TasksResponse = {
  items: Task[];
  cursor: string | null;
  hasMore: boolean;
};

type BatchUpdateResponse = {
  success: boolean;
  updatedCount: number;
  updatedIds: string[];
  skippedCount: number;
  skippedIds?: string[];
};

type GoogleCalendarAction = "add" | "remove";

function buildSearchParams(filter: TasksFilter): string {
  const params = new URLSearchParams();

  if (filter.status) {
    params.set("status", filter.status);
  }
  if (filter.folder) {
    params.set("folder", filter.folder);
  }
  if (filter.forDate) {
    params.set("forDate", filter.forDate);
  }
  if (filter.limit) {
    params.set("limit", String(filter.limit));
  }
  if (filter.cursor) {
    params.set("cursor", filter.cursor);
  }

  const result = params.toString();
  return result ? `?${result}` : "";
}

export async function fetchTasks(filter: TasksFilter = {}): Promise<Task[]> {
  const queryString = buildSearchParams(filter);
  const response = await apiClient.get<TasksResponse>(`/tasks${queryString}`);
  return response.items;
}

function getTodayDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function fetchUpcomingTasks(forDate = getTodayDateString()): Promise<Task[]> {
  const params = new URLSearchParams({ forDate });
  const response = await apiClient.get<TasksResponse>(`/tasks/upcoming?${params.toString()}`);
  return response.items;
}

async function patchTask(id: string, updates: TaskUpdatePayload): Promise<Task> {
  return apiClient.patch<Task>(`/tasks/${id}`, updates);
}

async function postTask(payload: TaskCreatePayload): Promise<Task> {
  return apiClient.post<Task>("/tasks", payload);
}

async function patchTasksBatch(payload: { ids: string[]; updates: TaskUpdatePayload }): Promise<BatchUpdateResponse> {
  return apiClient.patch<BatchUpdateResponse>("/tasks/batch", payload);
}

async function postTaskGoogleCalendarAction(payload: {
  id: string;
  action: GoogleCalendarAction;
}): Promise<Task> {
  return apiClient.post<Task>(`/tasks/${payload.id}/google-calendar`, { action: payload.action });
}

export function useTasks(filter: TasksFilter = {}, options: TasksQueryOptions = {}) {
  return useQuery({
    queryKey: ["tasks", filter],
    queryFn: () => fetchTasks(filter),
    staleTime: TASK_QUERY_STALE_MS,
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
  });
}

export function useInboxTasks() {
  return useTasks({ status: "inbox" }, { refetchInterval: TASK_SYNC_INTERVAL_MS });
}

export function useTodayTasks() {
  const todayDate = getTodayDateString();
  const query = useTasks({ status: "active", forDate: todayDate }, { refetchInterval: TASK_SYNC_INTERVAL_MS });

  const sorted = useMemo(() => {
    if (!query.data) {
      return [];
    }

    return [...query.data].sort((a, b) => {
      if (!a.deadline && !b.deadline) {
        return 0;
      }
      if (!a.deadline) {
        return 1;
      }
      if (!b.deadline) {
        return -1;
      }
      return a.deadline - b.deadline;
    });
  }, [query.data]);

  return {
    ...query,
    data: sorted,
  };
}

export function useUpcomingTasks(forDate = getTodayDateString()) {
  return useQuery({
    queryKey: ["tasks", "upcoming", forDate],
    queryFn: () => fetchUpcomingTasks(forDate),
    staleTime: TASK_QUERY_STALE_MS,
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: TaskUpdatePayload }) => patchTask(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      const snapshots = queryClient.getQueriesData<Task[]>({ queryKey: ["tasks"] });

      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) => {
        if (!old) {
          return old;
        }

        return old.map((task) => (task.id === id ? { ...task, ...updates } : task));
      });

      return { snapshots };
    },
    onError: (error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) => {
        queryClient.setQueryData(key as QueryKey, data);
      });

      if (hapticFeedback.notificationOccurred.isAvailable()) {
        hapticFeedback.notificationOccurred("error");
      }

      console.error("Task update failed", error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      if (hapticFeedback.notificationOccurred.isAvailable()) {
        hapticFeedback.notificationOccurred("error");
      }
      console.error("Task creation failed", error);
    },
  });
}

export function useBatchUpdateTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: patchTasksBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      if (hapticFeedback.notificationOccurred.isAvailable()) {
        hapticFeedback.notificationOccurred("error");
      }
      console.error("Batch task update failed", error);
    },
  });
}

export function useTaskGoogleCalendarAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postTaskGoogleCalendarAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      if (hapticFeedback.notificationOccurred.isAvailable()) {
        hapticFeedback.notificationOccurred("error");
      }
      console.error("Google Calendar action failed", error);
    },
  });
}
