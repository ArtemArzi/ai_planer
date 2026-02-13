# Frontend Components — AGENTS.md

## OVERVIEW
React UI components for the LAZY FLOW Telegram Mini App.

## CONVENTIONS
- **Styling**: Tailwind CSS with `tg-` prefixed classes (mapped in `tailwind.config.ts`).
- **Interactions**:
  - **Sheets**: All complex forms/details use `Vaul` bottom sheets.
  - **Feel**: Framer Motion spring-based transitions for "native" feel.
- **State**: Global UI state managed via Zustand `useUIStore`.

## ANTI-PATTERNS
- **Hardcoded Colors**: NEVER use hex codes; ALWAYS use Telegram theme variables.
- **Direct DOM**: NEVER use `dangerouslySetInnerHTML`.
- **Prop Drilling**: Prefer Zustand for shared UI state.

## WHERE TO LOOK
- `src/components/sheets/`: Bottom sheet implementations.
- `tailwind.config.ts`: Telegram theme color mapping.
- `src/stores/uiStore.ts`: UI state management.
