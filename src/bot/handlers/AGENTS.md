# Bot Handlers — AGENTS.md

## OVERVIEW
grammY bot message and event handlers. Located in `src/bot/handlers/`.

## CRITICAL RULES
- **Security**: ALWAYS escape user-generated content in Telegram MarkdownV2 to prevent parsing errors.
- **AI Race**: Check `updatedAt > originalCreatedAt` before AND after AI classification to prevent overwriting user edits.

## PATTERNS
- **Capture**: Precedence: Tags > Length > Media > URL > AI. Logic in `src/lib/capture.ts`.
- **Media**: Background processing via media queue to handle Telegram's file download limits.
- **Feedback**: Immediate haptic/visual feedback via bot messages for successful capture.

## WHERE TO LOOK
- `message.ts`: Main entry for text/command capture.
- `media.ts`: Photo/file handling and queueing.
- `keyboard.ts`: Inline keyboard and menu definitions.
