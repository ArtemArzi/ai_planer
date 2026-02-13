# Telegram Mini App Native Motion Plan

## TL;DR

> **Quick Summary**: Unify Shelves sub-view navigation under one directional `AnimatePresence` container, integrate Telegram BackButton as a true navigation signal for sub-views, and introduce app-wide tactile interaction primitives that stay GPU-friendly (`transform`/`opacity` only).
>
> **Deliverables**:
> - Global tactile interaction pattern (CSS + React usage pattern) applied across interactive UI
> - Smooth slide transitions for all Shelves sub-views (`main`, `folder`, `archive`, `manage`)
> - Contextual Telegram BackButton lifecycle synchronized with transition state
> - Performance hardening pass with measurable 60 FPS targets and profiler evidence
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Sub-view state model -> AnimatePresence integration -> BackButton lifecycle -> perf audit

---

## Context

### Original Request
Make the Telegram Mini App feel smooth and native by adding slide transitions, contextual Telegram BackButton behavior, global spring tactility, and performance optimization for 60 FPS mobile webviews.

### Interview Summary
**Key Decisions**:
- Global tactility applies to **all interactive elements across the app**, not Shelves-only.
- Telegram BackButton should be active in **sub-view context** (folders/archive/manage) and tightly synced to transitions.
- Animation policy is **GPU-accelerated only** (`transform` and `opacity`), avoiding layout-shift-heavy animations.
- Quality expectation is high with minimal manual overhead for the user.

**Research Findings**:
- `frontend/src/screens/ShelvesTab.tsx` currently switches sub-views via early-return branches, preventing coordinated enter/exit choreography.
- `frontend/src/screens/shelves/ShelvesFolderView.tsx`, `frontend/src/screens/shelves/ShelvesArchiveView.tsx`, and `frontend/src/components/FolderManageView.tsx` already animate internally but with local wrappers and non-shared timing.
- `frontend/src/hooks/useBackButton.ts` exists but is not wired to screen navigation.
- `frontend/src/lib/perf.ts` already provides in-app metrics (`window.LAZYFLOW_PERF`) including long tasks and tab-switch latency.
- Frontend test infrastructure is not currently present in `frontend/package.json`.

### Metis Review
**Identified Gaps (addressed in this plan)**:
- Missing global interaction pattern for tactile consistency.
- Potential transition conflicts due to nested/local `AnimatePresence` wrappers.
- BackButton lifecycle risk (stale listeners during transitions).
- No formal frontend verification harness despite high-quality requirement.

---

## Work Objectives

### Core Objective
Deliver native-feeling, smooth, and performant navigation/interaction behavior in the Telegram Mini App, with deterministic transition orchestration and measurable frame-time stability on mobile webviews.

### Concrete Deliverables
- Shared motion primitives module (sub-view variants + tactile press variants + transitions).
- Refactored `ShelvesTab` sub-view state and one `AnimatePresence` owner for all Shelves sub-views.
- Contextual BackButton integration with mount/show/hide/click cleanup bound to sub-view state.
- App-wide tactile feedback rollout for button-like controls.
- Performance report artifacts from Browser Profiler + in-app perf samples.

### Definition of Done
- [ ] All Shelves sub-view transitions animate with slide enter/exit and no abrupt swaps.
- [ ] Telegram BackButton visibility and behavior match sub-view state, with no orphan listeners.
- [ ] Interactive elements use shared tactile micro-interaction pattern.
- [ ] Profiling shows stable mobile performance target (no repeated long-task bursts, smooth frame timeline under normal interactions).

### Must Have
- Shared directional variants and spring transitions for native feel.
- Transform/opacity-only animation policy for transition/tactile behavior.
- Browser profiler verification workflow included in execution.

### Must NOT Have (Guardrails)
- No animation of `width/height/top/left/margin` for route/sub-view transitions.
- No duplicated BackButton listeners from repeated mounts.
- No one-off, component-specific tactile timing constants that drift from global standard.
- No migration away from current Zustand navigation model.

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (frontend)
- **User wants tests**: YES (TDD-oriented for motion/back-button behavior)
- **Framework**: `vitest` + `@testing-library/react` (+ `jsdom`) in `frontend/`

### TDD Strategy
Each behavior task follows RED-GREEN-REFACTOR:
1. **RED**: Write failing tests for state transitions/back-button visibility logic.
2. **GREEN**: Implement minimum logic for pass.
3. **REFACTOR**: Remove duplication and stabilize shared primitives.

### Performance Validation Strategy
- Use Chrome DevTools **Performance panel** on Telegram mobile webview-equivalent target (throttled mobile profile when device not available).
- Use React DevTools **Profiler** to confirm reduced unnecessary re-renders in high-touch components.
- Export `window.LAZYFLOW_PERF.exportSamples()` snapshots before/after and compare long-task frequency.

---

## Recommended Motion Presets

### Sub-View Slide Variants (Native Feel)
```ts
const subViewVariants = {
  enter: (direction: 1 | -1) => ({
    x: direction > 0 ? 28 : -28,
    opacity: 0.88,
    scale: 0.996,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: 1 | -1) => ({
    x: direction > 0 ? -18 : 18,
    opacity: 0.94,
    scale: 0.998,
  }),
};

const subViewTransition = {
  x: { type: "spring", stiffness: 430, damping: 38, mass: 0.7 },
  opacity: { duration: 0.16, ease: "easeOut" },
  scale: { duration: 0.18, ease: "easeOut" },
};
```

### Global Tactile Press Variants
```ts
const tactileTap = {
  whileTap: { scale: 0.97, opacity: 0.9 },
  transition: { type: "spring", stiffness: 700, damping: 36, mass: 0.45 },
};
```

### Performance Notes for Presets
- Add `style={{ willChange: "transform, opacity" }}` only on animated containers/buttons that are frequently interacted with.
- Keep active motion distances small (16-32px) to preserve perceived speed and reduce overdraw.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation):
├── Task 1: Add frontend test infrastructure and motion test harness
└── Task 2: Create shared motion/tactile primitives module

Wave 2 (Core Navigation + Integration):
├── Task 3: Refactor ShelvesTab sub-view state + direction model
├── Task 4: Integrate single AnimatePresence slide orchestration in ShelvesTab
└── Task 5: Wire Telegram BackButton lifecycle to sub-view transitions

Wave 3 (Global Rollout + Performance):
├── Task 6: Apply tactile pattern globally across interactive components
├── Task 7: Performance optimization pass (memoization + GPU acceleration)
└── Task 8: Browser profiler audit + perf evidence export

Critical Path: 2 -> 3 -> 4 -> 5 -> 8
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|----------------------|
| 1 | None | 3, 4, 5 test validation | 2 |
| 2 | None | 4, 6 | 1 |
| 3 | 1 | 4, 5 | None |
| 4 | 2, 3 | 5, 8 | None |
| 5 | 1, 3, 4 | 8 | None |
| 6 | 2 | 8 | 7 |
| 7 | 4 | 8 | 6 |
| 8 | 4, 5, 6, 7 | None | None |

---

## TODOs

- [ ] 1. Set up frontend testing for motion/back-button logic

  **What to do**:
  - Add frontend test toolchain in `frontend/` (`vitest`, RTL, jsdom, user-event).
  - Add `test` and `test:watch` scripts to `frontend/package.json`.
  - Create baseline test setup file and one passing smoke test for `ShelvesTab` render.

  **Must NOT do**:
  - Do not introduce E2E framework in this task.

  **References**:
  - `frontend/package.json` - add scripts and dependencies for frontend test execution.
  - `frontend/src/screens/ShelvesTab.tsx` - initial unit/integration test target.

  **Acceptance Criteria**:
  - [ ] `cd frontend && bunx vitest run` -> exits with 0 and at least one test passes.


- [ ] 2. Create shared native-motion primitives

  **What to do**:
  - Add a shared motion config module for: sub-view slide variants, spring transition constants, tactile tap variants.
  - Add reusable tactile helper pattern (hook/component utility) for button-like interactions.
  - Add global CSS helper classes for GPU-safe animation surfaces (`transform-gpu`, optional `will-change`).

  **Must NOT do**:
  - Do not encode hardcoded per-component timings outside the shared primitives.

  **References**:
  - `frontend/src/App.tsx:26` - existing directional variant pattern.
  - `frontend/src/screens/shelves/ShelvesFolderView.tsx:11` - current local transition constants to consolidate.
  - `frontend/src/screens/shelves/ShelvesArchiveView.tsx:5` - same transition duplication.
  - `frontend/src/components/FolderManageView.tsx:20` - same transition duplication.
  - `frontend/src/index.css` - global class placement for tactile/performance helpers.

  **Acceptance Criteria**:
  - [ ] One shared motion module consumed by Shelves-related views.
  - [ ] Test proves the shared variants produce directional enter/exit states.


- [ ] 3. Refactor Shelves sub-view navigation state for transition orchestration

  **What to do**:
  - Replace early-return branching in `ShelvesTab` with a single rendered container model.
  - Add directional context (`forward`/`back`) and stable key generation for sub-views.
  - Ensure swipe-back and explicit back actions route through one `goBackSubView()` path.

  **Must NOT do**:
  - Do not alter global tab switching model in `uiStore`.

  **References**:
  - `frontend/src/screens/ShelvesTab.tsx:17` - current `SubView` type model.
  - `frontend/src/screens/ShelvesTab.tsx:239` - current early-return branch causing abrupt swaps.

  **Acceptance Criteria**:
  - [ ] Test: switching `main -> folder -> archive/manage -> main` updates directional state correctly.
  - [ ] Test: swipe-back and back button handler call same navigation reducer.


- [ ] 4. Integrate single AnimatePresence slide transitions in ShelvesTab

  **What to do**:
  - Wrap Shelves content with one `AnimatePresence` owner in `ShelvesTab`.
  - Render `ShelvesMainView`, `ShelvesFolderView`, `ShelvesArchiveView`, `FolderManageView` via keyed `motion.section` wrappers using shared variants.
  - Remove or neutralize nested `AnimatePresence` wrappers in sub-view components to avoid conflicting orchestration.

  **Must NOT do**:
  - Do not use layout-affecting property animations.

  **References**:
  - `frontend/src/screens/ShelvesTab.tsx` - parent orchestration point.
  - `frontend/src/screens/shelves/ShelvesFolderView.tsx:72` - nested `AnimatePresence` candidate.
  - `frontend/src/screens/shelves/ShelvesArchiveView.tsx:38` - nested `AnimatePresence` candidate.
  - `frontend/src/components/FolderManageView.tsx:167` - local motion wrapper.

  **Acceptance Criteria**:
  - [ ] Visual check: every Shelves sub-view transition is slide-based and symmetric forward/back.
  - [ ] Tests verify only one active sub-view node after `mode="wait"` transition completion.


- [ ] 5. Implement contextual Telegram BackButton lifecycle management

  **What to do**:
  - Wire `useBackButton` in `ShelvesTab` so BackButton is enabled only when `subView !== null`.
  - Bind BackButton click to shared back navigation handler.
  - Ensure listener cleanup on unmount/transition changes.
  - Add guard for rapid taps during ongoing transition (prevent double-pop state).

  **Must NOT do**:
  - Do not leave BackButton visible in root Shelves main view.
  - Do not mount duplicate click handlers.

  **References**:
  - `frontend/src/hooks/useBackButton.ts` - existing SDK lifecycle helper.
  - `frontend/src/screens/ShelvesTab.tsx` - source of sub-view state.
  - `frontend/src/providers/TelegramProvider.tsx` - existing Telegram SDK lifecycle context.
  - Telegram docs: `https://docs.telegram-mini-apps.com/platform/back-button` - explicit developer-managed back behavior.

  **Acceptance Criteria**:
  - [ ] Test: BackButton `enabled=true` only in sub-view states.
  - [ ] Test: BackButton click triggers one navigation step and hides at root view.


- [ ] 6. Roll out global tactile feedback patterns across all interactive elements

  **What to do**:
  - Inventory clickable elements and migrate button-like controls to shared tactile pattern (`whileTap` / `active` spring behavior).
  - Apply to high-frequency components first: tab bar, FAB, task rows/cards, sheets action buttons, shelves cards, archive actions.
  - Standardize haptic pairing where appropriate (`selection` for toggles, `impact` for major actions).

  **Must NOT do**:
  - Do not introduce excessive scale ranges (< 0.94) that feel jarring.

  **References**:
  - `frontend/src/components/TabBar.tsx`
  - `frontend/src/components/FloatingActionButton.tsx`
  - `frontend/src/components/TaskRow.tsx`
  - `frontend/src/screens/shelves/ShelvesMainView.tsx`
  - `frontend/src/screens/shelves/ShelvesArchiveView.tsx`
  - `frontend/src/screens/shelves/ShelvesFolderView.tsx`
  - `frontend/src/components/sheets/TaskDetailSheet.tsx`
  - `frontend/src/components/sheets/CalendarSheet.tsx`
  - `frontend/src/components/sheets/SettingsSheet.tsx`

  **Acceptance Criteria**:
  - [ ] No direct one-off tactile classes remain in migrated components where shared pattern is applicable.
  - [ ] Manual spot-check: interactions feel consistent (same press curve/timing).


- [ ] 7. Performance hardening pass (memoization + GPU acceleration)

  **What to do**:
  - Memoize derived data and handlers in heavy views to reduce avoidable re-renders during transitions.
  - Add/verify GPU-safe styles on animated containers (`transform-gpu`, `backface-visibility`, selective `will-change`).
  - Avoid expensive operations during active transition frames (defer non-critical work with idle callbacks where needed).

  **Must NOT do**:
  - Do not overuse `will-change` globally (memory pressure risk).

  **References**:
  - `frontend/src/screens/ShelvesTab.tsx` - high state churn and derived data.
  - `frontend/src/screens/shelves/ShelvesMainView.tsx` - high-density interactive rendering.
  - `frontend/src/lib/perf.ts` - internal long-task visibility.
  - `frontend/src/App.tsx:19` - existing idle preload pattern.

  **Acceptance Criteria**:
  - [ ] React Profiler indicates reduced avoidable rerenders for Shelves transitions.
  - [ ] No new long task spikes attributable to transition interactions.


- [ ] 8. Browser Profiler audit and evidence capture

  **What to do**:
  - Run scripted profiling scenarios and capture traces:
    1) `main -> folder -> back`
    2) `main -> archive -> restore item -> back`
    3) `main -> manage -> back`
    4) repetitive tap interactions on global controls
  - Record Chrome DevTools Performance traces and React Profiler snapshots.
  - Export `window.LAZYFLOW_PERF.exportSamples()` before/after rollout.
  - Produce concise performance report in `.sisyphus/` with metrics and regressions (if any).

  **Must NOT do**:
  - Do not close task without evidence artifacts.

  **References**:
  - `frontend/src/lib/perf.ts` - sample export and long task count.
  - `frontend/src/screens/ShelvesTab.tsx` - target flow.

  **Acceptance Criteria**:
  - [ ] DevTools trace shows transition frames predominantly under 16.7ms budget on target scenario.
  - [ ] `window.LAZYFLOW_PERF.getLongTaskCount()` does not regress vs baseline under same scenario.
  - [ ] Evidence/report file created with reproducible commands and screenshots.

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1-2 | `feat(frontend): add native motion primitives and test harness` | frontend motion/test setup files | `cd frontend && bunx vitest run` |
| 3-5 | `feat(shelves): unify sub-view transitions with telegram back button` | Shelves and back-button integration files | `cd frontend && bunx vitest run` |
| 6-8 | `perf(frontend): standardize tactile interactions and profile motion` | global interactive components + report | tests + profiler evidence checklist |

---

## Success Criteria

### Verification Commands
```bash
cd frontend && bunx vitest run
cd frontend && bun run dev
# In browser console during profiling scenario
window.LAZYFLOW_PERF.exportSamples()
window.LAZYFLOW_PERF.getLongTaskCount()
```

### Final Checklist
- [ ] All Shelves sub-views animate via unified directional slide transitions.
- [ ] Telegram BackButton is contextual, synced, and leak-free.
- [ ] Global tactile behavior is consistent across app interactions.
- [ ] Profiling evidence confirms smoothness and no significant perf regressions.
