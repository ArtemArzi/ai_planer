import { env } from '../../env';
import { splitMultiCapture } from '../capture';
import type { FolderPrefixAliases } from '../capture';
import { splitWithAI, type SplitClientResult } from './splitter';

export interface OrchestrateSplitResult {
  items: string[];
  source: 'ai' | 'parser';
  provider?: 'openai' | 'gemini' | 'none';
  aiResult?: SplitClientResult;
}

export async function orchestrateSplit(
  text: string,
  folderAliases?: FolderPrefixAliases,
): Promise<OrchestrateSplitResult> {
  const mode = env.AI_CONTEXT_SPLIT_MODE || 'off';
  
  if (mode === 'off' || !env.AI_CONTEXT_SPLIT_ENABLED) {
    const parserItems = splitMultiCapture(text, folderAliases);
    return {
      items: parserItems,
      source: 'parser',
      provider: 'none',
    };
  }

  const aiResult = await splitWithAI(text);
  
  if (mode === 'shadow') {
    const parserItems = splitMultiCapture(text, folderAliases);
    console.log('[AI Splitter] Shadow mode - AI:', aiResult.result.items.length, 'items, Parser:', parserItems.length, 'items');
    return {
      items: parserItems,
      source: 'parser',
      provider: aiResult.provider,
      aiResult,
    };
  }

  if (aiResult.result.items.length === 0) {
    console.log('[AI Splitter] No valid AI items, falling back to parser');
    const parserItems = splitMultiCapture(text, folderAliases);
    return {
      items: parserItems,
      source: 'parser',
      provider: aiResult.provider,
    };
  }

  return {
    items: aiResult.result.items.map(item => item.content),
    source: aiResult.result.source,
    provider: aiResult.provider,
    aiResult,
  };
}
