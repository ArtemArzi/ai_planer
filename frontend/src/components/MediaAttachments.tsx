import { useRef, useState } from "react";
import { openLink } from "@telegram-apps/sdk-react";
import { useTaskMedia, useUploadMedia, useDeleteMedia, type Media } from "../api/media";

type MediaAttachmentsProps = {
  taskId: string;
};

function PhotoItem({ item }: { item: Media }) {
  const fileUrl = `/files/${item.id}`;

  const handleTap = () => {
    if (openLink.isAvailable()) {
      openLink(fileUrl, { tryInstantView: false });
    } else {
      window.open(fileUrl, "_blank");
    }
  };

  return (
    <button type="button" onClick={handleTap} className="shrink-0">
      <img
        src={fileUrl}
        alt=""
        className="h-20 w-20 rounded-xl object-cover"
        loading="lazy"
      />
    </button>
  );
}

function DocumentItem({ item }: { item: Media }) {
  const fileUrl = `/files/${item.id}`;

  return (
    <a
      href={fileUrl}
      download={item.originalFilename ?? undefined}
      className="flex items-center gap-2 rounded-xl bg-tg-bg px-3 py-2"
    >
      <span className="material-symbols-outlined text-lg text-tg-hint">description</span>
      <span className="truncate text-sm text-tg-text">{item.originalFilename || "Файл"}</span>
    </a>
  );
}

function VoiceItem({ item }: { item: Media }) {
  if (item.transcriptionStatus === "pending") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-tg-bg px-3 py-2">
        <span className="material-symbols-outlined animate-pulse text-lg text-tg-hint">mic</span>
        <span className="text-sm italic text-tg-hint">Расшифровка...</span>
      </div>
    );
  }

  if (item.transcription) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-tg-bg px-3 py-2">
        <span className="material-symbols-outlined mt-0.5 text-lg text-tg-hint">mic</span>
        <p className="text-sm text-tg-text">{item.transcription}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-tg-bg px-3 py-2">
      <span className="material-symbols-outlined text-lg text-tg-hint">mic</span>
      <span className="text-sm text-tg-hint">Голосовое сообщение</span>
    </div>
  );
}

function MediaItem({ item, onDelete }: { item: Media; onDelete: (id: string) => void }) {
  return (
    <div className="group relative">
      {item.type === "photo" && <PhotoItem item={item} />}
      {item.type === "document" && <DocumentItem item={item} />}
      {item.type === "voice" && <VoiceItem item={item} />}

      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm"
      >
        <span className="material-symbols-outlined text-xs">close</span>
      </button>
    </div>
  );
}

export function MediaAttachments({ taskId }: MediaAttachmentsProps) {
  const { data: mediaItems = [], isLoading } = useTaskMedia(taskId);
  const uploadMedia = useUploadMedia();
  const deleteMediaMutation = useDeleteMedia();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadMedia.mutateAsync({ taskId, file });
    } catch (err) {
      console.error("[MediaAttachments] Upload failed:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = (mediaId: string) => {
    deleteMediaMutation.mutate({ mediaId, taskId });
  };

  const photos = mediaItems.filter((m) => m.type === "photo");
  const nonPhotos = mediaItems.filter((m) => m.type !== "photo");

  if (isLoading) {
    return (
      <div className="mt-5 rounded-2xl bg-tg-bg p-4">
        <p className="text-sm font-medium text-tg-text">Вложения</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="material-symbols-outlined animate-spin text-sm text-tg-hint">progress_activity</span>
          <span className="text-sm text-tg-hint">Загрузка...</span>
        </div>
      </div>
    );
  }

  if (mediaItems.length === 0) {
    return (
      <div className="mt-5 rounded-2xl bg-tg-bg p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-tg-text">Вложения</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1 text-sm text-tg-link"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Добавить
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={handleUpload}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl bg-tg-bg p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-tg-text">
          Вложения ({mediaItems.length})
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-1 text-sm text-tg-link"
        >
          {isUploading ? (
            <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base">add</span>
          )}
          {isUploading ? "Загрузка..." : "Добавить"}
        </button>
      </div>

      {photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {photos.map((item) => (
            <MediaItem key={item.id} item={item} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {nonPhotos.length > 0 && (
        <div className="mt-3 grid gap-2">
          {nonPhotos.map((item) => (
            <MediaItem key={item.id} item={item} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.txt"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}
