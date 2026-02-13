import { hapticFeedback } from "@telegram-apps/sdk-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type FolderItem = {
  id: string;
  userId: number;
  slug: string;
  displayName: string;
  isSystem: boolean;
  icon: string;
  color: string;
  position: number;
  createdAt: number;
  updatedAt: number;
};

const SYSTEM_FOLDER_ORDER = ["work", "personal", "ideas", "media", "notes"] as const;

export type CreateFolderPayload = {
  displayName: string;
  icon?: string;
  color?: string;
};

export type UpdateFolderPayload = {
  displayName?: string;
  icon?: string;
  color?: string;
};

type FoldersResponse = {
  items: FolderItem[];
};

type FolderMetaResponse = {
  icons: string[];
  colors: string[];
};

type DeleteFolderResponse = {
  success: boolean;
  movedTaskCount: number;
};

type FolderSystemFallback = {
  displayName: string;
  icon: string;
  color: string;
  subtitle: string;
};

const SYSTEM_FALLBACKS: Record<string, FolderSystemFallback> = {
  work: { displayName: "Работа", icon: "work", color: "#3B82F6", subtitle: "Проекты и задачи" },
  personal: { displayName: "Личное", icon: "person", color: "#10B981", subtitle: "Здоровье и быт" },
  ideas: { displayName: "Идеи", icon: "lightbulb", color: "#F59E0B", subtitle: "Черновики" },
  media: { displayName: "Медиа", icon: "play_circle", color: "#8B5CF6", subtitle: "Фото и видео" },
  notes: { displayName: "Заметки", icon: "description", color: "#EC4899", subtitle: "Текстовые записи" },
};

export function getSystemFallbackFolders(): FolderItem[] {
  return SYSTEM_FOLDER_ORDER.map((slug, index) => {
    const fallback = SYSTEM_FALLBACKS[slug];
    return {
      id: `${slug}-fallback`,
      userId: 0,
      slug,
      displayName: fallback.displayName,
      isSystem: true,
      icon: fallback.icon,
      color: fallback.color,
      position: index,
      createdAt: 0,
      updatedAt: 0,
    };
  });
}

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function toAlphaColor(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(59, 130, 246, ${alpha})`;
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getFolderMeta(slug: string, folders: FolderItem[] = []): {
  slug: string;
  displayName: string;
  icon: string;
  color: string;
  isSystem: boolean;
  subtitle: string;
} {
  const folder = folders.find((item) => item.slug === slug);
  if (folder) {
    const fallback = SYSTEM_FALLBACKS[slug];
    const icon = folder.isSystem && fallback ? fallback.icon : folder.icon;

    return {
      slug: folder.slug,
      displayName: folder.displayName,
      icon: icon || fallback?.icon || "folder",
      color: folder.color,
      isSystem: folder.isSystem,
      subtitle: folder.isSystem ? (fallback?.subtitle ?? "Системная папка") : "Пользовательская папка",
    };
  }

  const system = SYSTEM_FALLBACKS[slug];
  if (system) {
    return {
      slug,
      displayName: system.displayName,
      icon: system.icon,
      color: system.color,
      isSystem: true,
      subtitle: system.subtitle,
    };
  }

  return {
    slug,
    displayName: titleCaseSlug(slug) || slug,
    icon: "folder",
    color: "#3B82F6",
    isSystem: false,
    subtitle: "Пользовательская папка",
  };
}

export async function fetchFolders(): Promise<FolderItem[]> {
  const response = await apiClient.get<FoldersResponse>("/folders");
  return response.items;
}

export async function fetchFolderMetaOptions(): Promise<FolderMetaResponse> {
  return apiClient.get<FolderMetaResponse>("/folders/meta");
}

async function postFolder(payload: CreateFolderPayload): Promise<FolderItem> {
  return apiClient.post<FolderItem>("/folders", payload);
}

async function patchFolder(slug: string, payload: UpdateFolderPayload): Promise<FolderItem> {
  return apiClient.patch<FolderItem>(`/folders/${slug}`, payload);
}

async function removeFolder(slug: string): Promise<DeleteFolderResponse> {
  return apiClient.delete<DeleteFolderResponse>(`/folders/${slug}`);
}

export function useFolders() {
  return useQuery({
    queryKey: ["folders"],
    queryFn: fetchFolders,
    staleTime: 30 * 1000,
  });
}

export function useFolderMetaOptions() {
  return useQuery({
    queryKey: ["folders", "meta"],
    queryFn: fetchFolderMetaOptions,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: postFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => {
      if (hapticFeedback.notificationOccurred.isAvailable()) {
        hapticFeedback.notificationOccurred("error");
      }
    },
  });
}

export function useUpdateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: UpdateFolderPayload }) =>
      patchFolder(slug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => {
      if (hapticFeedback.notificationOccurred.isAvailable()) {
        hapticFeedback.notificationOccurred("error");
      }
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) => removeFolder(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => {
      if (hapticFeedback.notificationOccurred.isAvailable()) {
        hapticFeedback.notificationOccurred("error");
      }
    },
  });
}
