import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export type MediaType = "photo" | "document" | "voice" | "link";
export type TranscriptionStatus = "pending" | "completed" | "failed";

export type Media = {
  id: string;
  taskId: string;
  userId: number;
  type: MediaType;
  filePath: string | null;
  fileSize: number | null;
  mimeType: string | null;
  originalFilename: string | null;
  transcription: string | null;
  transcriptionStatus: TranscriptionStatus | null;
  createdAt: number;
};

async function fetchTaskMedia(taskId: string): Promise<Media[]> {
  return apiClient.get<Media[]>(`/media/task/${taskId}`);
}

async function uploadMedia(taskId: string, file: File): Promise<Media> {
  const formData = new FormData();
  formData.append("file", file);
  return apiClient.upload<Media>(`/media/task/${taskId}`, formData);
}

async function removeMedia(mediaId: string): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>(`/media/${mediaId}`);
}

export function useTaskMedia(taskId: string | null) {
  return useQuery({
    queryKey: ["media", taskId],
    queryFn: () => fetchTaskMedia(taskId!),
    enabled: !!taskId,
    staleTime: 30 * 1000,
  });
}

export function useUploadMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, file }: { taskId: string; file: File }) =>
      uploadMedia(taskId, file),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["media", variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mediaId }: { mediaId: string; taskId: string }) =>
      removeMedia(mediaId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["media", variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
