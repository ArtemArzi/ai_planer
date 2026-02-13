import { OpenAIClassifier, GeminiClassifier } from './classifier';
import type { AIClassifier } from './classifier';
import { buildFolderContext } from './folderContext';
import { getTask, updateTask } from '../../db/tasks';
import { folderExists } from '../../db/folders';
import { getUser } from '../../db/users';
import { env } from '../../env';

const MIN_AI_CONFIDENCE_TO_APPLY = 0.4;

let openaiClassifier: AIClassifier | null = null;
let geminiClassifier: AIClassifier | null = null;

if (env.OPENAI_API_KEY) {
  openaiClassifier = new OpenAIClassifier(env.OPENAI_API_KEY);
}

if (env.GEMINI_API_KEY) {
  geminiClassifier = new GeminiClassifier(env.GEMINI_API_KEY);
}

export async function classifyTaskAsync(
  taskId: string,
  originalCreatedAt: number
): Promise<void> {
  if (!openaiClassifier && !geminiClassifier) {
    console.log('[AI] No API keys configured, skipping classification');
    return;
  }

  const task = getTask(taskId);
  if (!task) {
    console.log(`[AI] Task ${taskId} not found`);
    return;
  }

  if (task.updatedAt > originalCreatedAt) {
    console.log(`[AI] Skipping classification for ${taskId}: user already modified`);
    return;
  }

  const user = getUser(task.userId);
  if (!user || !user.aiClassificationEnabled) {
    console.log(`[AI] AI classification disabled for user ${task.userId}`);
    return;
  }

  try {
    const folderContext = buildFolderContext(task.userId);
    let result;

    if (openaiClassifier) {
      try {
        result = await openaiClassifier.classify(task.content, folderContext);
        console.log(`[AI] OpenAI classified ${taskId} as ${result.folder} (confidence: ${result.confidence})`);
      } catch (openaiError) {
        console.error('[AI] OpenAI error:', openaiError);

        if (geminiClassifier) {
          result = await geminiClassifier.classify(task.content, folderContext);
          console.log(`[AI] Gemini classified ${taskId} as ${result.folder} (confidence: ${result.confidence})`);
        } else {
          throw openaiError;
        }
      }
    } else if (geminiClassifier) {
      result = await geminiClassifier.classify(task.content, folderContext);
      console.log(`[AI] Gemini classified ${taskId} as ${result.folder} (confidence: ${result.confidence})`);
    }

    if (!result) {
      console.error('[AI] No classification result');
      return;
    }

    if (!Number.isFinite(result.confidence) || result.confidence < MIN_AI_CONFIDENCE_TO_APPLY) {
      console.log(
        `[AI] Skipping folder update for ${taskId}: confidence ${result.confidence} below threshold ${MIN_AI_CONFIDENCE_TO_APPLY}`,
      );
      return;
    }

    if (!folderExists(task.userId, result.folder)) {
      console.log(`[AI] Classified folder "${result.folder}" doesn't exist, falling back to personal`);
      result.folder = 'personal';
    }

    const freshTask = getTask(taskId);
    if (!freshTask || freshTask.updatedAt > originalCreatedAt) {
      console.log(`[AI] Aborting: task ${taskId} was modified during classification`);
      return;
    }

    const resultCount = updateTaskWithCas(taskId, {
      folder: result.folder,
      lastInteractionAt: Date.now()
    }, originalCreatedAt);

    if (resultCount) {
      console.log(`[AI] Task ${taskId} updated to folder: ${result.folder}`);
    } else {
      console.log(`[AI] Aborting: task ${taskId} was modified (CAS fail)`);
    }

  } catch (error) {
    console.error('[AI] Classification failed completely:', error);
  }
}
