import { db } from '../../db/index';
import { listFolders } from '../../db/folders';
import type { FolderDTO, TaskRow } from '../types';

const MAX_SAMPLES_PER_FOLDER = 3;
const MAX_SAMPLE_CHARS = 120;

export interface FolderContext {
  folders: Array<{
    slug: string;
    displayName: string;
    isSystem: boolean;
    samples: string[];
  }>;
}

export function buildFolderContext(userId: number): FolderContext {
  const folders = listFolders(userId);

  const recentTasks = db.query<
    Pick<TaskRow, 'folder' | 'content'>,
    [number]
  >(`
    SELECT folder, content FROM (
      SELECT folder, content, ROW_NUMBER() OVER (
        PARTITION BY folder ORDER BY created_at DESC
      ) as rn
      FROM tasks
      WHERE user_id = ? AND status NOT IN ('deleted', 'archived')
    ) WHERE rn <= ${MAX_SAMPLES_PER_FOLDER}
  `).all(userId);

  const samplesByFolder = new Map<string, string[]>();
  for (const row of recentTasks) {
    const samples = samplesByFolder.get(row.folder) || [];
    samples.push(row.content.slice(0, MAX_SAMPLE_CHARS));
    samplesByFolder.set(row.folder, samples);
  }

  return {
    folders: folders.map((f) => ({
      slug: f.slug,
      displayName: f.displayName,
      isSystem: f.isSystem,
      samples: samplesByFolder.get(f.slug) || [],
    })),
  };
}

export function formatFolderContextForPrompt(ctx: FolderContext): string {
  const lines: string[] = ['Available folders:'];

  for (const folder of ctx.folders) {
    const label = folder.isSystem ? `${folder.slug} (system)` : folder.slug;
    lines.push(`- ${label}: "${folder.displayName}"`);

    if (folder.samples.length > 0) {
      const examples = folder.samples.map((s) => `  * ${s}`).join('\n');
      lines.push(examples);
    }
  }

  return lines.join('\n');
}
