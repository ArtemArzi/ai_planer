# Telegram Mini App Mobile Performance Optimization Plan

## Context
The Mini App feels slow on mobile in three places: cold start, Focus <-> Shelves tab switching, and general interaction latency. Current architecture confirms one large Bun bundle, no code splitting, broad rerender surfaces in hot UI paths, no list virtualization for high-cardinality views, and avoidable backend latency on frequently called endpoints.

Priority strategy is impact-first: remove expensive rerenders and heavy list work first, then improve startup payload and cache hydration, then apply high-leverage backend query/auth wins that directly reduce perceived delay.

Phase ordering:
- Phase 0: Baseline metrics and guardrails
- Phase 1: High-impact frontend rendering and interaction fixes
- Phase 2: Startup/bundle and data-hydration improvements
- Phase 3: Backend latency wins that improve UI responsiveness
- Phase 4: Final hardening and regression gate

## Task Dependency Graph

| Task | Depends On | Reason |
|------|------------|--------|
| Task 1 | None | Establishes baseline metrics, budgets, and profiling protocol used by all later tasks |
| Task 2 | Task 1 | Shelves decomposition should be measured against baseline and budgets |
| Task 3 | Task 1 | Memoization/callback stabilization must be validated against baseline rerender counts |
| Task 4 | Task 2, Task 3 | Virtualization is safest after view boundaries and render stability are in place |
| Task 5 | Task 2, Task 3 | Animation tuning depends on stable component boundaries and handler identities |
| Task 6 | Task 1 | Bundle/startup optimization needs baseline startup numbers for before/after validation |
| Task 7 | Task 1, Task 6 | Query hydration tuning is coupled to startup path and chunk loading behavior |
| Task 8 | Task 1 | Backend wins can run in parallel but should target baseline interaction latency bottlenecks |
| Task 9 | Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8 | Final verification requires all optimization tracks integrated |

## Parallel Execution Graph

Wave 1 (Start immediately):
- Task 1: Baseline profiling and perf budgets

Wave 2 (After Wave 1):
- Task 2: ShelvesTab decomposition and rerender surface reduction
- Task 3: Hot component memoization and stable callback wiring
- Task 6: Bun bundle splitting and startup payload reduction
- Task 8: Backend latency quick wins for frequently-hit endpoints

Wave 3 (After Wave 2):
- Task 4: Virtualization and progressive list rendering
- Task 5: Motion and visual effect cost tuning
- Task 7: React Query hydration/persistence tuning

Wave 4 (After Wave 3):
- Task 9: End-to-end perf verification and regression gates

Critical Path: Task 1 -> Task 2 -> Task 4 -> Task 9
Estimated Parallel Speedup: ~35-45% versus sequential execution.

## Tasks

### Task 1: Establish Mobile Performance Baseline and Budgets (Phase 0)
**Description**:
- **Problem**: Optimization order is clear, but no quantified baseline exists for cold start, tab switch latency, and interaction jank.
- **Affected Files**: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `.sisyphus/plans/telegram-miniapp-mobile-performance-optimization.md` (verification checklist updates during execution).
- **High-level Fix**: Define measurable KPIs and a repeatable profiling protocol in Telegram WebView + remote debugging (cold start time, tab switch input-to-paint, list scroll FPS, long-task count).
- **Expected Impact**: Medium direct UX impact, Very High delivery impact (prevents wasted work and regressions).
- **Complexity**: Low.

**Delegation Recommendation**:
- Category: `ultrabrain` - Metric design and perf budget framing require careful systems reasoning.
- Skills: [`dev-browser`, `data-scientist`] - `dev-browser` for repeatable UI traces; `data-scientist` for metric normalization/comparison.

**Skills Evaluation**:
- INCLUDED `dev-browser`: Needed for browser interaction replay and timing capture.
- INCLUDED `data-scientist`: Needed to structure metrics and compare before/after snapshots.
- OMITTED `agent-browser`: Overlaps with `dev-browser`; persistent flow is preferred.
- OMITTED `frontend-ui-ux`: No visual redesign task here.
- OMITTED `git-master`: No git-heavy operation is central to this task.
- OMITTED `typescript-programmer`: No core code authoring focus in this setup step.
- OMITTED `python-programmer`: No Python domain overlap.
- OMITTED `svelte-programmer`: Stack is React, not Svelte.
- OMITTED `golang-tui-programmer`: No Go/TUI scope.
- OMITTED `python-debugger`: No Python debugging scope.
- OMITTED `prompt-engineer`: No prompt-system optimization needed.

**Depends On**: None

**Acceptance Criteria**:
- Baseline captures include cold start, first interactive tap latency, Focus<->Shelves switch latency, and Shelves scroll smoothness.
- Same device/profile method documented for all future comparisons.
- Perf budget thresholds are written (default targets: tab switch <=120ms p50, Shelves first-open <=250ms warm, max 2 long tasks >50ms per key interaction).

### Task 2: Decompose ShelvesTab to Reduce Rerender Blast Radius (Phase 1, Highest Frontend Impact)
**Description**:
- **Problem**: `ShelvesTab` is monolithic (`frontend/src/screens/ShelvesTab.tsx`) and any local state churn causes broad rerenders.
- **Affected Files**: `frontend/src/screens/ShelvesTab.tsx`, new focused view components under `frontend/src/screens/` or `frontend/src/components/`, `frontend/src/stores/uiStore.ts` (selector-safe usage patterns).
- **High-level Fix**: Split Main Grid, Folder View, Archive View, Manage View, Stories strip/preview into isolated memo-friendly components; reduce shared state footprint and avoid top-level invalidations.
- **Expected Impact**: Very High perceived improvement in tab switch and intra-Shelves interactions.
- **Complexity**: High.

**Delegation Recommendation**:
- Category: `visual-engineering` - UI behavior and interaction flow must stay native-feeling while restructuring.
- Skills: [`typescript-programmer`, `frontend-ui-ux`] - Type-safe decomposition plus preserving tactile UX quality.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: Required for safe component extraction and props/state contracts.
- INCLUDED `frontend-ui-ux`: Required to preserve transition feel and gesture continuity.
- OMITTED `agent-browser`: Not primary for implementation; verification can use `dev-browser` later.
- OMITTED `dev-browser`: Useful for QA but not core for coding this task.
- OMITTED `git-master`: Commit strategy is separate.
- OMITTED `python-programmer`: No Python overlap.
- OMITTED `svelte-programmer`: No Svelte overlap.
- OMITTED `golang-tui-programmer`: No Go TUI overlap.
- OMITTED `python-debugger`: No Python debugging.
- OMITTED `data-scientist`: No metrics modeling core to this refactor.
- OMITTED `prompt-engineer`: No prompt workflow involved.

**Depends On**: Task 1

**Acceptance Criteria**:
- `ShelvesTab` no longer owns all sub-view UI logic in one file.
- Switching sub-views does not rerender unaffected sub-view trees.
- Measured tab-switch and sub-view open latency improves versus baseline.

### Task 3: Stabilize Hot Render Paths (Memoization, Callbacks, Store Selectors) (Phase 1)
**Description**:
- **Problem**: Core list items (`TaskRow`, `NoteCard`, `IdeaCard`) are not memoized; inline handlers and broad Zustand subscriptions cause avoidable rerenders.
- **Affected Files**: `frontend/src/components/TaskRow.tsx`, `frontend/src/components/NoteCard.tsx`, `frontend/src/components/IdeaCard.tsx`, `frontend/src/components/InboxStack.tsx`, `frontend/src/components/TodayList.tsx`, `frontend/src/components/UpcomingList.tsx`, `frontend/src/App.tsx`, `frontend/src/stores/uiStore.ts`.
- **High-level Fix**: Add `React.memo` for stable item components, move inline callbacks to stable references where beneficial, and enforce selector-based Zustand subscriptions in hot components.
- **Expected Impact**: Very High reduction in interaction jank and commit time during list-heavy screens.
- **Complexity**: Medium-High.

**Delegation Recommendation**:
- Category: `ultrabrain` - Requires careful rerender-cause analysis and safe memo boundary design.
- Skills: [`typescript-programmer`, `dev-browser`] - Type-safe callback/props changes plus runtime interaction profiling.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: Needed for safe memoized prop contracts and hook typing.
- INCLUDED `dev-browser`: Needed to validate rerender and interaction gains on device flows.
- OMITTED `agent-browser`: Redundant once `dev-browser` is used.
- OMITTED `frontend-ui-ux`: Visual design is not primary; this is render-path engineering.
- OMITTED `git-master`: Not central to task execution logic.
- OMITTED `python-programmer`: No Python overlap.
- OMITTED `svelte-programmer`: No Svelte overlap.
- OMITTED `golang-tui-programmer`: No TUI overlap.
- OMITTED `python-debugger`: No Python runtime.
- OMITTED `data-scientist`: Metric deep-dive handled in baseline/final verification tasks.
- OMITTED `prompt-engineer`: No prompt work.

**Depends On**: Task 1

**Acceptance Criteria**:
- Hot list item components do not rerender when unrelated parent state updates.
- No broad `useUIStore()` destructuring remains in hot render paths.
- Interaction latency in Focus/Shelves improves versus baseline.

### Task 4: Introduce Virtualization and Progressive Rendering for Large Lists (Phase 1)
**Description**:
- **Problem**: Shelves folder/archive/list views render all rows at once (up to 150), causing heavy mount/update cost on mobile.
- **Affected Files**: `frontend/src/screens/ShelvesTab.tsx`, `frontend/src/components/TaskRow.tsx`, potential new list abstraction component in `frontend/src/components/`, `frontend/src/api/tasks.ts` (if pagination/incremental loading is introduced).
- **High-level Fix**: Use windowed rendering for large lists, keep full rendering for short lists, and pair with progressive fetch/pagination where needed.
- **Expected Impact**: Very High improvement in Shelves open time, scroll smoothness, and low-end device responsiveness.
- **Complexity**: High.

**Delegation Recommendation**:
- Category: `ultrabrain` - Virtualization with drag/reorder/gesture constraints needs careful trade-off handling.
- Skills: [`typescript-programmer`, `frontend-ui-ux`] - Robust implementation while preserving native interaction feel.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: Needed for robust virtual list abstractions and typed row models.
- INCLUDED `frontend-ui-ux`: Needed to preserve swipe/drag affordances with virtualized rendering.
- OMITTED `agent-browser`: Not required during coding stage.
- OMITTED `dev-browser`: Primarily for post-implementation verification.
- OMITTED `git-master`: Not essential to task logic.
- OMITTED `python-programmer`: No Python overlap.
- OMITTED `svelte-programmer`: No Svelte overlap.
- OMITTED `golang-tui-programmer`: No Go TUI overlap.
- OMITTED `python-debugger`: No Python code path.
- OMITTED `data-scientist`: Not core to implementation itself.
- OMITTED `prompt-engineer`: No prompt tuning involved.

**Depends On**: Task 2, Task 3

**Acceptance Criteria**:
- Large Shelves lists render only visible window plus buffer.
- Scroll FPS and long-task count are materially improved on baseline device.
- Reorder and tap interactions remain functionally equivalent.

### Task 5: Tune Motion and Visual Effects for Low-End Mobile GPUs (Phase 1)
**Description**:
- **Problem**: Costly animation/layout options (`layout` on many rows, `AnimatePresence mode="wait"`, blur-heavy overlays) amplify sluggishness under load.
- **Affected Files**: `frontend/src/App.tsx`, `frontend/src/components/TaskRow.tsx`, `frontend/src/screens/ShelvesTab.tsx`, `frontend/src/index.css`.
- **High-level Fix**: Limit expensive layout animations in large lists, tune tab transition strategy to avoid serialized waits, and replace/soften expensive blur where possible.
- **Expected Impact**: High improvement in perceived smoothness and responsiveness under interaction.
- **Complexity**: Medium.

**Delegation Recommendation**:
- Category: `visual-engineering` - This is a performance-sensitive interaction/motion tuning task.
- Skills: [`frontend-ui-ux`, `dev-browser`] - Motion quality preservation plus real-device interaction checks.

**Skills Evaluation**:
- INCLUDED `frontend-ui-ux`: Needed to keep premium/native feel while reducing animation cost.
- INCLUDED `dev-browser`: Needed for frame-timing validation in realistic mobile flows.
- OMITTED `agent-browser`: Overlaps with `dev-browser` capabilities.
- OMITTED `typescript-programmer`: Helpful but not primary for this mostly motion/CSS tuning.
- OMITTED `git-master`: No git-heavy need.
- OMITTED `python-programmer`: No Python overlap.
- OMITTED `svelte-programmer`: No Svelte overlap.
- OMITTED `golang-tui-programmer`: No Go TUI overlap.
- OMITTED `python-debugger`: No Python runtime.
- OMITTED `data-scientist`: Not metric-heavy modeling task.
- OMITTED `prompt-engineer`: No LLM prompt domain.

**Depends On**: Task 2, Task 3

**Acceptance Criteria**:
- Tab switch no longer feels serialized/sticky under normal interaction.
- Heavy-list interactions show fewer dropped frames than baseline.
- Visual style remains consistent with current Telegram-native feel.

### Task 6: Reduce Cold Start Cost with Bun Code Splitting and Deferred Loading (Phase 2)
**Description**:
- **Problem**: Frontend ships as one bundle, forcing users to pay startup cost for code not needed for first paint.
- **Affected Files**: `scripts/build-frontend-prod.sh`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/index.html`, optional split points in `frontend/src/screens/` and heavy components.
- **High-level Fix**: Enable Bun chunk splitting (`--splitting` and chunk naming), introduce dynamic imports/lazy boundaries for non-critical screens/subviews, and defer non-essential assets.
- **Expected Impact**: Very High reduction in perceived initial load time.
- **Complexity**: Medium-High.

**Delegation Recommendation**:
- Category: `ultrabrain` - Build-pipeline and runtime-loading strategy needs careful sequencing and fallback behavior.
- Skills: [`typescript-programmer`, `dev-browser`] - Implementation correctness plus startup-path verification.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: Needed for safe lazy boundaries and fallback handling.
- INCLUDED `dev-browser`: Needed to verify startup and chunk-loading behavior on device.
- OMITTED `agent-browser`: Redundant with `dev-browser`.
- OMITTED `frontend-ui-ux`: Visual design not primary.
- OMITTED `git-master`: Not a git-centric task.
- OMITTED `python-programmer`: No Python overlap.
- OMITTED `svelte-programmer`: No Svelte overlap.
- OMITTED `golang-tui-programmer`: No Go TUI overlap.
- OMITTED `python-debugger`: No Python execution.
- OMITTED `data-scientist`: Secondary role; baseline/final tasks cover analysis.
- OMITTED `prompt-engineer`: No prompt optimization scope.

**Depends On**: Task 1

**Acceptance Criteria**:
- Production build outputs multiple JS chunks with stable naming.
- Initial route critical path loads smaller JS payload than baseline.
- Cold start median time improves on test device(s).

### Task 7: Optimize React Query Hydration and Fetch Shape for Perceived Speed (Phase 2)
**Description**:
- **Problem**: Global prefetch and broad cache persistence can front-load startup and inflate hydration work.
- **Affected Files**: `frontend/src/api/queryClient.ts`, `frontend/src/api/tasks.ts`, `frontend/src/App.tsx`, `frontend/src/screens/FocusTab.tsx`, `frontend/src/screens/ShelvesTab.tsx`.
- **High-level Fix**: Remove unconditional all-tasks prefetch on app mount, prioritize view-scoped fetches, tune persisted query scope/age, and avoid loading 150-item payloads before user intent.
- **Expected Impact**: High startup and tab-switch responsiveness improvements, especially on slower devices/storage.
- **Complexity**: Medium.

**Delegation Recommendation**:
- Category: `ultrabrain` - Requires balancing freshness, offline behavior, and interaction speed.
- Skills: [`typescript-programmer`, `data-scientist`] - Query behavior implementation plus cache-performance trade-off analysis.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: Needed for query key/fetch contract changes safely.
- INCLUDED `data-scientist`: Needed for cache-size and latency trade-off evaluation.
- OMITTED `agent-browser`: Optional for QA, not core implementation.
- OMITTED `dev-browser`: Useful later in validation, not core coding requirement.
- OMITTED `frontend-ui-ux`: Not a visual design task.
- OMITTED `git-master`: No git specialization required.
- OMITTED `python-programmer`: No Python overlap.
- OMITTED `svelte-programmer`: No Svelte overlap.
- OMITTED `golang-tui-programmer`: No TUI overlap.
- OMITTED `python-debugger`: No Python execution context.
- OMITTED `prompt-engineer`: No prompt-related objective.

**Depends On**: Task 1, Task 6

**Acceptance Criteria**:
- App no longer fetches non-critical datasets during initial paint path.
- Hydration/persistence payload is reduced to only valuable query data.
- Focus and Shelves first-open latency improves versus baseline.

### Task 8: Apply Backend Latency Wins that Directly Affect UI Perception (Phase 3)
**Description**:
- **Problem**: Frequent endpoints pay avoidable costs (`authMiddleware` side effects, sequential stats counts, broad SELECT payloads, suboptimal search path, missing indexes).
- **Affected Files**: `src/api/middleware/auth.ts`, `src/api/routes/tasks.ts`, `src/db/tasks.ts`, `src/db/schema.sql`, plus related user/folder DB helpers if auth path is adjusted.
- **High-level Fix**: Remove/deferral of expensive auth side effects per request, convert stats to grouped query, shift search filtering into SQL, project only fields needed for list views, add missing indexes, and reduce batch-update query multiplicity.
- **Expected Impact**: High reduction in per-interaction API latency and faster optimistic-confirmation cycles.
- **Complexity**: Medium-High.

**Delegation Recommendation**:
- Category: `ultrabrain` - Query/auth path changes have correctness and performance trade-offs.
- Skills: [`typescript-programmer`, `data-scientist`] - API/db implementation plus query-performance reasoning.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: Required for safe API/DB code updates.
- INCLUDED `data-scientist`: Useful for query/index impact analysis and verifying latency distribution.
- OMITTED `agent-browser`: Backend-focused task.
- OMITTED `dev-browser`: Not central to server-side optimization.
- OMITTED `frontend-ui-ux`: No UI design domain.
- OMITTED `git-master`: Not the primary specialization.
- OMITTED `python-programmer`: No Python overlap.
- OMITTED `svelte-programmer`: No Svelte overlap.
- OMITTED `golang-tui-programmer`: No Go/TUI overlap.
- OMITTED `python-debugger`: No Python debugging context.
- OMITTED `prompt-engineer`: No prompt optimization domain.

**Depends On**: Task 1

**Acceptance Criteria**:
- Median and p95 latency for `/tasks`, `/tasks/stats`, and `/tasks/search` improve versus baseline.
- No auth behavior regressions (still validates Telegram initData and preserves ownership/security guarantees).
- DB query plans confirm index usage for high-frequency filters.

### Task 9: Final Integration, Regression Sweep, and Rollout Guardrails (Phase 4)
**Description**:
- **Problem**: Individual wins can conflict; without final integration pass, perceived speed can regress in mixed flows.
- **Affected Files**: Cross-cutting across all touched frontend/backend performance files, plus plan updates in `.sisyphus/plans/telegram-miniapp-mobile-performance-optimization.md`.
- **High-level Fix**: Run full performance regression matrix on target devices, compare against Phase 0 baseline, and define rollout + fallback triggers.
- **Expected Impact**: High confidence and durable performance gains in production-like usage.
- **Complexity**: Medium.

**Delegation Recommendation**:
- Category: `unspecified-high` - Broad integration validation with both frontend and backend concerns.
- Skills: [`dev-browser`, `data-scientist`, `git-master`] - Device flow verification, metric analysis, and clean atomic integration commits.

**Skills Evaluation**:
- INCLUDED `dev-browser`: Needed for repeatable end-to-end user-flow timing.
- INCLUDED `data-scientist`: Needed for before/after statistical comparison and confidence checks.
- INCLUDED `git-master`: Needed for clean rollback-safe commit segmentation at integration stage.
- OMITTED `agent-browser`: Redundant with `dev-browser`.
- OMITTED `frontend-ui-ux`: No new UI design objective.
- OMITTED `typescript-programmer`: Core code work occurs in earlier tasks.
- OMITTED `python-programmer`: No Python overlap.
- OMITTED `svelte-programmer`: No Svelte overlap.
- OMITTED `golang-tui-programmer`: No Go TUI overlap.
- OMITTED `python-debugger`: No Python debugging.
- OMITTED `prompt-engineer`: No prompt design objective.

**Depends On**: Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8

**Acceptance Criteria**:
- All primary user-reported pain points show measurable improvement on target mobile devices.
- No regression in gestures, swipe affordances, drawer behavior, or optimistic task updates.
- Rollout checklist includes explicit rollback conditions and monitoring signals.

## Commit Strategy
- Commit after each completed task (or tightly coupled mini-group) to keep rollback small and auditable.
- Suggested atomic sequence:
  - `perf(frontend): establish baseline metrics and budgets`
  - `perf(frontend): split shelves subviews to reduce rerenders`
  - `perf(frontend): memoize hot list items and stabilize handlers`
  - `perf(frontend): add virtualization for large shelves lists`
  - `perf(frontend): tune animation and blur costs on mobile`
  - `perf(build): enable bun chunk splitting and deferred loading`
  - `perf(data): optimize query hydration and startup fetch shape`
  - `perf(api-db): reduce request and query latency on hot endpoints`
  - `perf(integration): finalize regression gates and rollout guardrails`

## Success Criteria
- Cold start: measurable reduction in time-to-interactive on representative mobile devices.
- Tab switching: Focus <-> Shelves switch latency consistently below baseline target budget.
- Interaction smoothness: reduced dropped frames/long tasks during list scroll and task interactions.
- Network/API: reduced median and p95 response times for hot endpoints (`/tasks`, `/tasks/stats`, `/tasks/search`).
- Functional parity: no regressions in task CRUD, swipe gestures, drawer flows, optimistic updates, or Telegram auth/session behavior.
