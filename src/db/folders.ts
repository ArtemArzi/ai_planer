import { db, generateId } from './index';
import type { FolderDTO, FolderRow } from '../lib/types';
import { SYSTEM_FOLDER_DEFAULTS, isReservedSlug, isSystemSlug, isValidIcon, isValidColor, MAX_CUSTOM_FOLDERS } from '../lib/folderDefaults';
import type { SystemFolderSlug } from '../lib/types';

function rowToDTO(row: FolderRow): FolderDTO {
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    displayName: row.display_name,
    isSystem: row.is_system === 1,
    icon: row.icon,
    color: row.color,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export function ensureSystemFolders(userId: number): void {
  const existing = db.query<
    { slug: string; is_system: number; display_name: string; icon: string; color: string; position: number },
    [number]
  >(
    `SELECT slug, is_system, display_name, icon, color, position FROM folders WHERE user_id = ?`
  ).all(userId);

  const bySlug = new Map(existing.map((row) => [row.slug, row]));

  const tx = db.transaction(() => {
    for (const [slug, defaults] of Object.entries(SYSTEM_FOLDER_DEFAULTS)) {
      const row = bySlug.get(slug);
      const now = Date.now();

      if (!row) {
        const id = generateId();
        db.run(
          `INSERT INTO folders (id, user_id, slug, display_name, is_system, icon, color, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
          [id, userId, defaults.slug, defaults.displayName, defaults.icon, defaults.color, defaults.position, now, now]
        );
        continue;
      }

      const nextDisplayName = row.display_name?.trim() ? row.display_name : defaults.displayName;
      const needsUpdate =
        row.is_system !== 1 ||
        row.icon !== defaults.icon ||
        row.color !== defaults.color ||
        row.position !== defaults.position ||
        row.display_name !== nextDisplayName;

      if (!needsUpdate) {
        continue;
      }

      db.run(
        `UPDATE folders
         SET is_system = 1,
             display_name = ?,
             icon = ?,
             color = ?,
             position = ?,
             updated_at = ?
         WHERE user_id = ? AND slug = ?`,
        [nextDisplayName, defaults.icon, defaults.color, defaults.position, now, userId, slug]
      );
    }
  });

  tx();
}

export function listFolders(userId: number): FolderDTO[] {
  ensureSystemFolders(userId);

  const rows = db.query<FolderRow, [number]>(
    `SELECT * FROM folders WHERE user_id = ? ORDER BY position ASC, created_at ASC`
  ).all(userId);

  return rows.map(rowToDTO);
}

export function getFolder(userId: number, slug: string): FolderDTO | null {
  const row = db.query<FolderRow, [number, string]>(
    `SELECT * FROM folders WHERE user_id = ? AND slug = ?`
  ).get(userId, slug);

  return row ? rowToDTO(row) : null;
}

export function folderExists(userId: number, slug: string): boolean {
  ensureSystemFolders(userId);

  const row = db.query<{ slug: string }, [number, string]>(
    `SELECT slug FROM folders WHERE user_id = ? AND slug = ?`
  ).get(userId, slug);

  return !!row;
}

export interface CreateFolderInput {
  displayName: string;
  icon?: string;
  color?: string;
}

export type CreateFolderResult =
  | { ok: true; folder: FolderDTO }
  | { ok: false; error: string; code: string };

export function createFolder(userId: number, input: CreateFolderInput): CreateFolderResult {
  const slug = slugify(input.displayName);

  if (!slug) {
    return { ok: false, error: 'Display name produces empty slug', code: 'INVALID_NAME' };
  }

  if (isReservedSlug(slug)) {
    return { ok: false, error: `Slug "${slug}" is reserved`, code: 'RESERVED_SLUG' };
  }

  if (input.icon && !isValidIcon(input.icon)) {
    return { ok: false, error: 'Invalid icon', code: 'INVALID_ICON' };
  }

  if (input.color && !isValidColor(input.color)) {
    return { ok: false, error: 'Invalid color', code: 'INVALID_COLOR' };
  }

  ensureSystemFolders(userId);

  const count = db.query<{ count: number }, [number]>(
    `SELECT COUNT(*) as count FROM folders WHERE user_id = ? AND is_system = 0`
  ).get(userId);

  if (count && count.count >= MAX_CUSTOM_FOLDERS) {
    return { ok: false, error: `Maximum ${MAX_CUSTOM_FOLDERS} custom folders`, code: 'LIMIT_REACHED' };
  }

  let finalSlug = slug;
  let suffix = 1;
  while (true) {
    const exists = db.query<{ slug: string }, [number, string]>(
      `SELECT slug FROM folders WHERE user_id = ? AND slug = ?`
    ).get(userId, finalSlug);

    if (!exists) break;
    finalSlug = `${slug}-${suffix}`;
    suffix++;
    if (suffix > 100) {
      return { ok: false, error: 'Could not generate unique slug', code: 'SLUG_CONFLICT' };
    }
  }

  const maxPos = db.query<{ max_pos: number | null }, [number]>(
    `SELECT MAX(position) as max_pos FROM folders WHERE user_id = ?`
  ).get(userId);

  const position = (maxPos?.max_pos ?? -1) + 1;
  const id = generateId();
  const now = Date.now();
  const icon = input.icon || '📁';
  const color = input.color || '#3B82F6';

  db.run(
    `INSERT INTO folders (id, user_id, slug, display_name, is_system, icon, color, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    [id, userId, finalSlug, input.displayName.trim(), icon, color, position, now, now]
  );

  return { ok: true, folder: getFolder(userId, finalSlug)! };
}

export interface UpdateFolderInput {
  displayName?: string;
  icon?: string;
  color?: string;
}

export type UpdateFolderResult =
  | { ok: true; folder: FolderDTO }
  | { ok: false; error: string; code: string };

export function updateFolder(userId: number, slug: string, patch: UpdateFolderInput): UpdateFolderResult {
  const folder = getFolder(userId, slug);

  if (!folder) {
    return { ok: false, error: 'Folder not found', code: 'NOT_FOUND' };
  }

  if (folder.isSystem) {
    if (patch.icon || patch.color) {
      return { ok: false, error: 'Cannot change icon/color of system folders', code: 'SYSTEM_RESTRICTED' };
    }
  }

  if (patch.icon && !isValidIcon(patch.icon)) {
    return { ok: false, error: 'Invalid icon', code: 'INVALID_ICON' };
  }

  if (patch.color && !isValidColor(patch.color)) {
    return { ok: false, error: 'Invalid color', code: 'INVALID_COLOR' };
  }

  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (patch.displayName !== undefined) {
    const trimmed = patch.displayName.trim();
    if (!trimmed || trimmed.length > 50) {
      return { ok: false, error: 'Display name must be 1-50 characters', code: 'INVALID_NAME' };
    }
    fields.push('display_name = ?');
    values.push(trimmed);
  }

  if (patch.icon !== undefined && !folder.isSystem) {
    fields.push('icon = ?');
    values.push(patch.icon);
  }

  if (patch.color !== undefined && !folder.isSystem) {
    fields.push('color = ?');
    values.push(patch.color);
  }

  if (fields.length === 0) {
    return { ok: true, folder };
  }

  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(userId);
  values.push(slug);

  db.run(
    `UPDATE folders SET ${fields.join(', ')} WHERE user_id = ? AND slug = ?`,
    values
  );

  return { ok: true, folder: getFolder(userId, slug)! };
}

export type DeleteFolderResult =
  | { ok: true; movedTaskCount: number }
  | { ok: false; error: string; code: string };

export function deleteFolder(userId: number, slug: string): DeleteFolderResult {
  if (isSystemSlug(slug)) {
    return { ok: false, error: 'Cannot delete system folders', code: 'SYSTEM_RESTRICTED' };
  }

  const folder = getFolder(userId, slug);
  if (!folder) {
    return { ok: false, error: 'Folder not found', code: 'NOT_FOUND' };
  }

  if (folder.isSystem) {
    return { ok: false, error: 'Cannot delete system folders', code: 'SYSTEM_RESTRICTED' };
  }

  const tx = db.transaction(() => {
    const now = Date.now();

    const moveResult = db.run(
      `UPDATE tasks SET folder = 'personal', is_idea = 0, updated_at = ? WHERE user_id = ? AND folder = ?`,
      [now, userId, slug]
    );

    db.run(
      `DELETE FROM folders WHERE user_id = ? AND slug = ?`,
      [userId, slug]
    );

    return moveResult.changes;
  });

  const movedTaskCount = tx();
  return { ok: true, movedTaskCount };
}
