import { getFolderMeta, toAlphaColor, useFolders } from "../api/folders";
import type { FolderSlug } from "../api/tasks";
import { FolderIcon } from "./FolderIcon";

type FolderBadgeProps = {
  folder: FolderSlug;
  size?: "sm" | "md";
};

export function FolderBadge({ folder, size = "md" }: FolderBadgeProps) {
  const { data: folders = [] } = useFolders();
  const meta = getFolderMeta(folder, folders);
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  const iconSize = size === "sm" ? "text-sm" : "text-base";
  const backgroundColor = toAlphaColor(meta.color, 0.16);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 ${textSize}`}
      style={{ backgroundColor, color: meta.color }}
    >
      <FolderIcon icon={meta.icon} className={`leading-none ${iconSize}`} />
      <span className="truncate">{meta.displayName}</span>
    </span>
  );
}
