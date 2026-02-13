import type { FolderSlug, AIClassificationResult } from '../types';
import type { FolderContext } from './folderContext';
import { formatFolderContextForPrompt } from './folderContext';

const DEFAULT_FOLDERS = ['work', 'personal', 'ideas'] as const;

function clampConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(1, parsed));
}

function normalizeFolderSlug(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid folder in AI response');
  }

  const normalized = value.trim().toLocaleLowerCase('ru-RU');
  if (!normalized) {
    throw new Error('Empty folder in AI response');
  }

  return normalized;
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Invalid JSON response from model');
  }
  return text.slice(start, end + 1);
}

export function normalizeClassificationResult(
  raw: unknown,
  allowedSlugs: string[] = [...DEFAULT_FOLDERS],
): AIClassificationResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response is not an object');
  }

  const record = raw as Record<string, unknown>;
  const folder = normalizeFolderSlug(record.folder);
  if (!allowedSlugs.includes(folder)) {
    throw new Error(`AI returned folder outside allowlist: ${folder}`);
  }

  return {
    folder: folder as FolderSlug,
    confidence: clampConfidence(record.confidence),
  };
}

export interface AIClassifier {
  classify(text: string, folderContext?: FolderContext): Promise<AIClassificationResult>;
}

export function buildSystemPrompt(folderContext?: FolderContext): string {
  if (!folderContext || folderContext.folders.length === 0) {
    return `You are a task router.
Classify the task into exactly one folder.

Allowed folders:
- work: professional tasks, projects, business communication
- personal: daily life, home, errands, health, personal admin
- ideas: brainstorms, concepts, future possibilities, creative thoughts

Rules:
1) Return ONLY JSON (no prose, no markdown).
2) Use this exact schema: {"folder":"work|personal|ideas","confidence":0.0-1.0}
3) If uncertain, prefer "personal".
4) confidence must be a number from 0 to 1.`;
  }

  const slugs = folderContext.folders.map((f) => f.slug);
  const folderList = formatFolderContextForPrompt(folderContext);

  return `You are a task router for a personal productivity app.
Classify the task into exactly one folder from the allowed list.

${folderList}

Allowed folder slugs: ${slugs.join(', ')}

Decision rules:
1) Prefer exact mention of folder display name/slug in task text.
2) Otherwise match by semantics and examples.
3) For creative concepts/someday thoughts, prefer ideas-like folder.
4) If uncertain, use "personal" when available; otherwise choose the closest folder.

Output rules:
- Return ONLY JSON (no prose, no markdown).
- Use schema: {"folder":"<one allowed slug>","confidence":0.0-1.0}
- confidence must be numeric in [0,1].`;
}

export class OpenAIClassifier implements AIClassifier {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async classify(text: string, folderContext?: FolderContext): Promise<AIClassificationResult> {
    const allowedSlugs = folderContext?.folders.map((f) => f.slug) ?? [...DEFAULT_FOLDERS];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(folderContext)
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: 80,
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    return normalizeClassificationResult(result, allowedSlugs);
  }
}

export class GeminiClassifier implements AIClassifier {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async classify(text: string, folderContext?: FolderContext): Promise<AIClassificationResult> {
    const systemPrompt = buildSystemPrompt(folderContext);
    const allowedSlugs = folderContext?.folders.map((f) => f.slug) ?? [...DEFAULT_FOLDERS];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\nTask: ${text}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 100
          }
        }),
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;

    const jsonText = extractJsonObject(content);
    const result = JSON.parse(jsonText);
    return normalizeClassificationResult(result, allowedSlugs);
  }
}
