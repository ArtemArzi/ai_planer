# Draft: Focus/Shelves transition layout bug

## Requirements (confirmed)
- Diagnose exact CSS cause of vertical stacking when switching tabs in `frontend/src/App.tsx`.
- Evaluate `AnimatePresence` `mode="popLayout"` versus manual absolute positioning.
- Check whether scroll reset is needed on tab switch (`useUIStore` or `useEffect` in `App.tsx`).
- Implement a fix so the `Полки` header is always at the top when entering Shelves.
- Context constraints: Framer Motion v11, Telegram Mini App environment, current mode is `sync`.

## Technical Decisions
- Preferred transition strategy: manual layout isolation wrapper (`relative` container + absolute positioned tab panes) while keeping `AnimatePresence mode="sync"`.
- Alternative considered: `mode="popLayout"` can work, but requires strict parent positioning and is less predictable with gesture-driven transform parents.
- Scroll strategy: reset top scroll on entering Shelves via `useEffect` in `App.tsx` (window scroll is current container), ensure `Полки` header starts at top.

## Research Findings
- `frontend/src/App.tsx` currently renders both tab panes as normal-flow sibling `motion.div` elements inside `AnimatePresence mode="sync"`; during overlap both contribute height and stack vertically.
- Wrapper around `AnimatePresence` has no explicit `relative`/isolation class, so no layout pinning during enter+exit.
- `frontend/src/screens/FocusTab.tsx` root uses `pb-36 pt-4`; `frontend/src/screens/shelves/ShelvesMainView.tsx` root uses `pt-6` and header `Полки` at top of section.
- No existing tab-switch scroll restoration found in `App.tsx` or `useUIStore`; scroll likely stays from previous tab state.
- Motion docs: `mode="sync"` animates both enter/exit concurrently; `mode="popLayout"` pops exiting element out of flow using absolute positioning and recommends non-static positioned parent.

## Open Questions
- No blocking questions for initial plan generation.
- Default applied in plan: reset scroll when entering Shelves only (meets explicit requirement with minimal side effects).
- Fallback branch included: if `popLayout` behaves inconsistently in Telegram webview, use manual absolute positioning with explicit container-height management.

## Scope Boundaries
- INCLUDE: tab transition bug diagnosis, strategy comparison, scroll behavior review, concrete implementation plan.
- EXCLUDE: unrelated visual redesign or broader navigation refactor.
