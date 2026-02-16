import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  slugify,
  ensureSystemFolders,
  listFolders,
  getFolder,
  folderExists,
  createFolder,
  updateFolder,
  deleteFolder,
} from '../db/folders';
import { SYSTEM_FOLDER_SLUGS } from '../lib/types';
import { MAX_CUSTOM_FOLDERS, FOLDER_ICONS, FOLDER_COLORS, RESERVED_SLUGS } from '../lib/folderDefaults';
import { formatFolderContextForPrompt } from '../lib/ai/folderContext';
import { db } from '../db';
import type { FolderContext } from '../lib/ai/folderContext';

describe('slugify', () => {
  it('lowercases and trims', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('my folder name')).toBe('my-folder-name');
  });

  it('removes special characters', () => {
    expect(slugify('test@#$%^&*()')).toBe('test');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('a---b')).toBe('a-b');
  });

  it('strips leading/trailing hyphens', () => {
    expect(slugify('-hello-')).toBe('hello');
  });

  it('truncates to 50 chars', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(50);
  });

  it('handles unicode (Cyrillic)', () => {
    expect(slugify('Работа')).toBe('работа');
  });

  it('returns empty string for pure symbols', () => {
    expect(slugify('!@#$%')).toBe('');
  });
});

describe('folder CRUD', () => {
  const TEST_USER = 999888;
  const TEST_USER_2 = 999889;

  beforeEach(() => {
    db.run('DELETE FROM folders WHERE user_id IN (?, ?)', [TEST_USER, TEST_USER_2]);
    db.run('DELETE FROM tasks WHERE user_id IN (?, ?)', [TEST_USER, TEST_USER_2]);
    db.run('INSERT OR IGNORE INTO users (telegram_id, created_at, updated_at) VALUES (?, ?, ?)',
      [TEST_USER, Date.now(), Date.now()]);
    db.run('INSERT OR IGNORE INTO users (telegram_id, created_at, updated_at) VALUES (?, ?, ?)',
      [TEST_USER_2, Date.now(), Date.now()]);
    ensureSystemFolders(TEST_USER);
    ensureSystemFolders(TEST_USER_2);
  });

  describe('ensureSystemFolders', () => {
    it('creates all 5 system folders for new user', () => {
      ensureSystemFolders(TEST_USER);
      const folders = listFolders(TEST_USER);
      const systemFolders = folders.filter(f => f.isSystem);
      expect(systemFolders).toHaveLength(5);
      const slugs = systemFolders.map(f => f.slug).sort();
      expect(slugs).toEqual([...SYSTEM_FOLDER_SLUGS].sort());
    });

    it('is idempotent', () => {
      ensureSystemFolders(TEST_USER);
      ensureSystemFolders(TEST_USER);
      ensureSystemFolders(TEST_USER);
      const folders = listFolders(TEST_USER);
      expect(folders.filter(f => f.isSystem)).toHaveLength(5);
    });

    it('does not affect other users', () => {
      ensureSystemFolders(TEST_USER);
      ensureSystemFolders(TEST_USER_2);
      const folders1 = listFolders(TEST_USER);
      const folders2 = listFolders(TEST_USER_2);
      expect(folders1).toHaveLength(5);
      expect(folders2).toHaveLength(5);
      const ids1 = new Set(folders1.map(f => f.id));
      const ids2 = new Set(folders2.map(f => f.id));
      for (const id of ids1) {
        expect(ids2.has(id)).toBe(false);
      }
    });

    it('normalizes legacy system folders icon/color/system flag', () => {
        const now = Date.now();

      db.run(
        `UPDATE folders
         SET is_system = 0,
             icon = 'work',
             color = '#000000',
             position = 99,
             updated_at = ?
         WHERE user_id = ? AND slug = 'work'`,
        [now, TEST_USER]
      );

      ensureSystemFolders(TEST_USER);
      const work = getFolder(TEST_USER, 'work');

      expect(work).not.toBeNull();
      expect(work!.isSystem).toBe(true);
      expect(work!.icon).toBe('💼');
      expect(work!.color).toBe('#3B82F6');
      expect(work!.position).toBe(0);
    });
  });

  describe('listFolders', () => {
    it('returns folders ordered by position', () => {
      const folders = listFolders(TEST_USER);
      for (let i = 1; i < folders.length; i++) {
        expect(folders[i].position).toBeGreaterThanOrEqual(folders[i - 1].position);
      }
    });

    it('includes system folder defaults', () => {
      const folders = listFolders(TEST_USER);
      const work = folders.find(f => f.slug === 'work');
      expect(work).toBeDefined();
      expect(work!.isSystem).toBe(true);
      expect(work!.displayName).toBe('Работа');
    });
  });

  describe('folderExists', () => {
    it('returns true for system folders', () => {
      expect(folderExists(TEST_USER, 'work')).toBe(true);
      expect(folderExists(TEST_USER, 'personal')).toBe(true);
      expect(folderExists(TEST_USER, 'ideas')).toBe(true);
    });

    it('returns false for non-existent folders', () => {
      expect(folderExists(TEST_USER, 'nonexistent')).toBe(false);
    });
  });

  describe('createFolder', () => {
    it('creates a custom folder', () => {
      const result = createFolder(TEST_USER, {
        displayName: 'Study',
        icon: '📚',
        color: '#3B82F6',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.folder.slug).toBe('study');
        expect(result.folder.displayName).toBe('Study');
        expect(result.folder.isSystem).toBe(false);
        expect(result.folder.icon).toBe('📚');
        expect(result.folder.color).toBe('#3B82F6');
      }
    });

    it('assigns position after system folders', () => {
      const result = createFolder(TEST_USER, { displayName: 'Custom' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.folder.position).toBeGreaterThanOrEqual(5);
      }
    });

    it('rejects reserved slugs', () => {
      const result = createFolder(TEST_USER, { displayName: 'work' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('RESERVED_SLUG');
      }
    });

    it('rejects empty name after slugify', () => {
      const result = createFolder(TEST_USER, { displayName: '!@#$%' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_NAME');
      }
    });

    it('dedupes slug with suffix', () => {
      createFolder(TEST_USER, { displayName: 'Fitness' });
      const result = createFolder(TEST_USER, { displayName: 'Fitness' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.folder.slug).toBe('fitness-1');
      }
    });

    it('rejects invalid icon', () => {
      const result = createFolder(TEST_USER, { displayName: 'Test', icon: '🤡' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_ICON');
      }
    });

    it('rejects invalid color', () => {
      const result = createFolder(TEST_USER, { displayName: 'Test', color: '#000000' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_COLOR');
      }
    });

    it('defaults icon and color', () => {
      const result = createFolder(TEST_USER, { displayName: 'Bare' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.folder.icon).toBe('📁');
        expect(result.folder.color).toBe('#3B82F6');
      }
    });

    it('enforces MAX_CUSTOM_FOLDERS limit', () => {
      for (let i = 0; i < MAX_CUSTOM_FOLDERS; i++) {
        const r = createFolder(TEST_USER, { displayName: `Folder ${i}` });
        expect(r.ok).toBe(true);
      }
      const result = createFolder(TEST_USER, { displayName: 'One Too Many' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('LIMIT_REACHED');
      }
    });
  });

  describe('updateFolder', () => {
    it('updates displayName of system folder', () => {
      const result = updateFolder(TEST_USER, 'work', { displayName: 'Офис' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.folder.displayName).toBe('Офис');
        expect(result.folder.slug).toBe('work');
      }
    });

    it('rejects icon/color change for system folder', () => {
      const result = updateFolder(TEST_USER, 'work', { icon: '📚' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('SYSTEM_RESTRICTED');
      }
    });

    it('updates all fields for custom folder', () => {
      createFolder(TEST_USER, { displayName: 'Gym' });
      const result = updateFolder(TEST_USER, 'gym', {
        displayName: 'Fitness',
        icon: '💪',
        color: '#EF4444',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.folder.displayName).toBe('Fitness');
        expect(result.folder.icon).toBe('💪');
        expect(result.folder.color).toBe('#EF4444');
        expect(result.folder.slug).toBe('gym');
      }
    });

    it('returns NOT_FOUND for missing folder', () => {
      const result = updateFolder(TEST_USER, 'nonexistent', { displayName: 'X' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NOT_FOUND');
      }
    });

    it('rejects empty displayName', () => {
      createFolder(TEST_USER, { displayName: 'Test' });
      const result = updateFolder(TEST_USER, 'test', { displayName: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_NAME');
      }
    });

    it('rejects displayName over 50 chars', () => {
      createFolder(TEST_USER, { displayName: 'Test' });
      const result = updateFolder(TEST_USER, 'test', { displayName: 'a'.repeat(51) });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INVALID_NAME');
      }
    });
  });

  describe('deleteFolder', () => {
    it('deletes custom folder and re-homes tasks', () => {
      createFolder(TEST_USER, { displayName: 'Temp' });
        const now = Date.now();
      db.run(`INSERT INTO tasks (id, user_id, content, folder, status, created_at, updated_at, last_interaction_at, source)
        VALUES ('t1', ?, 'task in temp', 'temp', 'active', ?, ?, ?, 'bot')`,
        [TEST_USER, now, now, now]);
      db.run(`INSERT INTO tasks (id, user_id, content, folder, is_idea, status, created_at, updated_at, last_interaction_at, source)
        VALUES ('t2', ?, 'idea in temp', 'temp', 1, 'active', ?, ?, ?, 'bot')`,
        [TEST_USER, now, now, now]);

      const result = deleteFolder(TEST_USER, 'temp');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.movedTaskCount).toBe(2);
      }

      const task1 = db.query('SELECT folder, is_idea FROM tasks WHERE id = ?').get('t1');
      expect(task1.folder).toBe('personal');
      expect(task1.is_idea).toBe(0);

      const task2 = db.query('SELECT folder, is_idea FROM tasks WHERE id = ?').get('t2');
      expect(task2.folder).toBe('personal');
      expect(task2.is_idea).toBe(0);

      expect(folderExists(TEST_USER, 'temp')).toBe(false);
    });

    it('rejects deleting system folder', () => {
      ensureSystemFolders(TEST_USER);
      const result = deleteFolder(TEST_USER, 'work');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('SYSTEM_RESTRICTED');
      }
    });

    it('returns NOT_FOUND for missing folder', () => {
      const result = deleteFolder(TEST_USER, 'nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('getFolder', () => {
    it('returns folder DTO with camelCase fields', () => {
      ensureSystemFolders(TEST_USER);
      const folder = getFolder(TEST_USER, 'work');
      expect(folder).not.toBeNull();
      expect(folder!.userId).toBe(TEST_USER);
      expect(folder!.displayName).toBe('Работа');
      expect(folder!.isSystem).toBe(true);
      expect(folder!.createdAt).toBeGreaterThan(0);
      expect(folder!.updatedAt).toBeGreaterThan(0);
    });

    it('returns null for nonexistent folder', () => {
      expect(getFolder(TEST_USER, 'nonexistent')).toBeNull();
    });
  });
});

describe('formatFolderContextForPrompt', () => {
  it('formats folders with samples', () => {
    const ctx: FolderContext = {
      folders: [
        { slug: 'work', displayName: 'Работа', isSystem: true, samples: ['Fix bug', 'Deploy'] },
        { slug: 'gym', displayName: 'Gym', isSystem: false, samples: [] },
      ],
    };
    const result = formatFolderContextForPrompt(ctx);
    expect(result).toContain('slug: "work"');
    expect(result).toContain('name: "Работа"');
    expect(result).toContain('(system)');
    expect(result).toContain('Fix bug');
    expect(result).toContain('Deploy');
    expect(result).toContain('slug: "gym"');
    expect(result).toContain('name: "Gym"');
  });

  it('handles empty folders list', () => {
    const ctx: FolderContext = { folders: [] };
    const result = formatFolderContextForPrompt(ctx);
    expect(result).toContain('Available folders:');
  });
});
