import { env } from '../../env';
import { CONTEXTUAL_SPLIT_PROMPT } from './splitPromptPolicy';
import { validateSplitJSON, type ValidationResult } from './splitValidator';
import { type SplitResult, createSingleItemResult } from './splitterTypes';

export interface SplitClientResult {
  result: SplitResult;
  provider: 'openai' | 'gemini' | 'none';
}

async function callOpenAI(text: string, timeout: number): Promise<ValidationResult> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: CONTEXTUAL_SPLIT_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in response');
    }

    return validateSplitJSON(content);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function callGemini(text: string, timeout: number): Promise<ValidationResult> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${CONTEXTUAL_SPLIT_PROMPT}\n\nTask: ${text}` }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Gemini error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No content in response');
    }

    return validateSplitJSON(content);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function splitWithAI(text: string): Promise<SplitClientResult> {
  const timeout = env.AI_CONTEXT_SPLIT_TIMEOUT_MS || 3000;

  if (!env.OPENAI_API_KEY && !env.GEMINI_API_KEY) {
    return {
      result: createSingleItemResult(text),
      provider: 'none',
    };
  }

  let lastError: Error | null = null;

  if (env.OPENAI_API_KEY) {
    try {
      const validation = await callOpenAI(text, timeout);
      if (validation.valid && validation.result) {
        return { result: validation.result, provider: 'openai' };
      }
      console.log('[AI Splitter] OpenAI returned invalid result, trying Gemini');
    } catch (err) {
      lastError = err as Error;
      console.log('[AI Splitter] OpenAI failed:', lastError.message);
    }
  }

  if (env.GEMINI_API_KEY) {
    try {
      const validation = await callGemini(text, timeout);
      if (validation.valid && validation.result) {
        return { result: validation.result, provider: 'gemini' };
      }
      console.log('[AI Splitter] Gemini returned invalid result');
    } catch (err) {
      lastError = err as Error;
      console.log('[AI Splitter] Gemini failed:', lastError.message);
    }
  }

  console.log('[AI Splitter] All providers failed, falling back to single item');
  return {
    result: createSingleItemResult(text),
    provider: 'none',
  };
}
