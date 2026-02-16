export const CONSERVATIVE_ROUTING_RULES = `
- If the task is ambiguous, too brief, or lacks clear context, prefer "personal".
- Do not guess specialized categories without high certainty.
- It is better to be safe and use "personal" than to misclassify a task.
`.trim();

export const MULTILINGUAL_GUIDANCE = `
- Handle inputs in both Russian (RU) and English (EN).
- Support mixed-language inputs (e.g., "Купить milk").
- The output folder slug must remain in English as defined in the allowed list.
`.trim();

export const JSON_OUTPUT_CONSTRAINTS = `
- Output MUST be valid JSON only.
- No markdown code blocks, no preamble, no "Here is your JSON".
- Strict adherence to the provided schema is mandatory.
`.trim();

export const GENERAL_AI_POLICY = `
### Core Rules:
${CONSERVATIVE_ROUTING_RULES}

### Language Policy:
${MULTILINGUAL_GUIDANCE}

### Output Formatting:
${JSON_OUTPUT_CONSTRAINTS}
`.trim();
