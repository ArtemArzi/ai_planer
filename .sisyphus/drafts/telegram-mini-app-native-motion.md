# Draft: Telegram Mini App Native Motion

## Requirements (confirmed)
- Goal: Make Telegram Mini App (React) feel smooth and native.
- Scope target: `frontend/src/screens/ShelvesTab.tsx` sub-view transitions.
- Must implement slide-in/slide-out transitions for all Shelves sub-views with `AnimatePresence`.
- Must sync sub-view transitions with Telegram BackButton SDK behavior.
- Must add spring-based tactile feedback (`scale`/`opacity`) for interactive elements.
- Must optimize rendering performance (memoization + hardware acceleration).
- Must ensure 60 FPS behavior on mobile webviews.
- Requested output: step-by-step implementation breakdown, Framer Motion variants recommendation, performance audit steps.
- Global tactility applies to all interactive elements across entire frontend app, not Shelves-only.
- Telegram BackButton should be contextual: visible/active whenever user is in Shelves sub-views (folder/archive/manage) and synchronized with transitions.
- Animation policy: GPU-friendly only (`transform` + `opacity`), avoid heavy layout-shift animations.
- Quality bar: high implementation quality and performance with minimal manual overhead for user.

## Technical Decisions
- Existing Shelves sub-views already have local motion wrappers (`ShelvesFolderView`, `ShelvesArchiveView`, `FolderManageView`) but parent `ShelvesTab` uses early returns that prevent coordinated enter/exit orchestration.
- Existing app-level tab transitions in `frontend/src/App.tsx` already use directional `AnimatePresence` and can serve as baseline pattern.
- Existing Telegram BackButton hook exists (`frontend/src/hooks/useBackButton.ts`) but is currently unused.

## Research Findings
- Codebase:
  - `frontend/src/screens/ShelvesTab.tsx` currently switches sub-views via conditional returns; this causes abrupt/rigid transitions between views.
  - `frontend/src/screens/shelves/ShelvesFolderView.tsx` and `frontend/src/screens/shelves/ShelvesArchiveView.tsx` already define `pageTransition` with tween timing, not spring.
  - `frontend/src/components/FolderManageView.tsx` has matching tween transition and swipe-back behavior.
  - `frontend/src/lib/perf.ts` already captures tab-switch and long-task metrics via `window.LAZYFLOW_PERF` helper.
  - Frontend test infrastructure appears absent (`frontend/package.json` has no test script and no frontend test files/config).
- External docs:
  - Framer Motion supports directional route transitions using `AnimatePresence` + keyed `motion.*` nodes + `custom` direction.
  - Telegram Mini Apps BackButton requires explicit mount/show/hide and explicit click handling; no default history integration.

## Open Questions
- No functional blockers after clarifications. Remaining choice is implementation-level defaults in plan.

## Scope Boundaries
- INCLUDE: Shelves sub-view transition architecture, BackButton sync for Shelves navigation, tactile interaction standards, performance profiling workflow.
- EXCLUDE (tentative): redesigning visual system/theme, replacing Zustand routing model, changing non-Shelves navigation unless required for shared primitives.
