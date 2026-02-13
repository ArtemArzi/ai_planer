# Focus-Shelves Transition Layout Fix (AnimatePresence)

## Context

### User Request Summary
Fix a frontend layout bug in `frontend/src/App.tsx` where tab panes (`Focus` and `Shelves`) stack vertically during `AnimatePresence` transition, evaluate `mode="popLayout"` versus manual absolute positioning, verify scroll reset behavior, and ensure `Полки` header appears at the top when entering Shelves.

### Interview Findings
- Current implementation uses `AnimatePresence mode="sync"` with two keyed sibling `motion.div` tab panes.
- During transitions, both panes are present in normal document flow.
- The app runs in Telegram Mini App environment with Framer Motion v11.

### Research Results
- `frontend/src/App.tsx:128` uses `mode="sync"`; this keeps entering and exiting nodes active concurrently.
- `frontend/src/App.tsx:130` and `frontend/src/App.tsx:142` tab wrappers are not layout-isolated (no absolute/overlay strategy), so they stack as block elements.
- `frontend/src/screens/FocusTab.tsx:7` and `frontend/src/screens/shelves/ShelvesMainView.tsx:109` both produce tall vertical layouts, amplifying stacking gap.
- No tab-switch scroll restoration exists in `frontend/src/App.tsx` or `frontend/src/stores/uiStore.ts`.
- Motion docs indicate `mode="popLayout"` pops exiting content out of layout flow, but parent positioning must be explicit (`position: relative`) for stable results.

### Metis-Style Gap Review (applied)
- Gap: ambiguous scroll target container. Resolved by defaulting to `window` (no nested y-scroll container in current layout).
- Gap: transition strategy ambiguity. Resolved with primary recommendation (`popLayout` + relative parent) and fallback option (manual absolute with measured container height).
- Guardrail: do not change tab business logic (`setActiveTab`, swipe threshold, perf instrumentation).

### Test Infrastructure Decision
- Infrastructure exists: **NO (frontend package has no test script and no test files)**
- User wants tests: **Not requested**
- QA mode for this work: **Manual verification with browser evidence**

## Task Dependency Graph

| Task | Depends On | Reason |
|------|------------|--------|
| Task 1: Reproduce + root-cause proof | None | Baseline evidence is required before changing animation/layout strategy |
| Task 2: Transition strategy selection (`popLayout` vs manual absolute) | Task 1 | Must confirm exact failure mode before selecting safest fix |
| Task 3: Implement tab layout isolation in `App.tsx` | Task 2 | Implementation depends on selected strategy and constraints |
| Task 4: Implement Shelves entry scroll reset | Task 2 | Scroll behavior policy depends on transition decision and UX intent |
| Task 5: Manual QA in Mini App flow + regression checks | Task 3, Task 4 | Verification requires both layout and scroll fixes to be present |
| Task 6: Atomic commit + handoff notes | Task 5 | Commit only after verification evidence confirms fix |

## Parallel Execution Graph

Wave 1 (Start immediately):
- Task 1: Reproduce + root-cause proof

Wave 2 (After Wave 1 completes):
- Task 2: Transition strategy selection (`popLayout` vs manual absolute)

Wave 3 (After Wave 2 completes, parallelizable):
- Task 3: Implement tab layout isolation in `App.tsx`
- Task 4: Implement Shelves entry scroll reset

Wave 4 (After Wave 3 completes):
- Task 5: Manual QA in Mini App flow + regression checks

Wave 5 (After Wave 4 completes):
- Task 6: Atomic commit + handoff notes

Critical Path: Task 1 -> Task 2 -> Task 3 -> Task 5 -> Task 6

Estimated Parallel Speedup: ~15% (Task 3/4 can run in parallel once strategy is fixed)

## Tasks

### Task 1: Reproduce and Prove Root Cause in `App.tsx`
**Description**: Confirm the exact CSS/layout reason for vertical stacking during tab transition and document where both nodes remain in normal flow.

**Delegation Recommendation**:
- Category: `quick` - Small, high-confidence diagnosis task centered on one file and one runtime behavior.
- Skills: [`dev-browser`, `typescript-programmer`] - Browser inspection for live transition behavior; TS/React understanding for JSX layout flow.

**Skills Evaluation**:
- INCLUDED `dev-browser`: Needed for runtime DOM/transition inspection.
- INCLUDED `typescript-programmer`: Needed to map behavior to React/Framer code.
- OMITTED `agent-browser`: `dev-browser` already covers browser workflow with persistent state.
- OMITTED `frontend-ui-ux`: No redesign work, only bug diagnosis.
- OMITTED `git-master`: No git operation in this task.
- OMITTED `python-programmer`: Domain mismatch (TS frontend).
- OMITTED `svelte-programmer`: Framework mismatch.
- OMITTED `golang-tui-programmer`: Domain mismatch.
- OMITTED `python-debugger`: Language mismatch.
- OMITTED `data-scientist`: No analytics/data processing.
- OMITTED `prompt-engineer`: No prompt tuning work.

**Depends On**: None

**Acceptance Criteria**:
- [ ] Identify and document that both keyed tab panes in `frontend/src/App.tsx:130` and `frontend/src/App.tsx:142` are block-flow siblings during `mode="sync"` overlap.
- [ ] Confirm resulting effect: entering Shelves renders below exiting Focus height during transition.
- [ ] Capture one before-fix screenshot showing `Полки` displaced by transition stacking.

### Task 2: Decide and Document Transition Strategy
**Description**: Evaluate `mode="popLayout"` vs manual absolute positioning and select a single approach with explicit rationale and fallback.

**Delegation Recommendation**:
- Category: `ultrabrain` - Requires nuanced trade-off analysis (Framer internals, transform/offset behavior, Mini App constraints).
- Skills: [`typescript-programmer`, `frontend-ui-ux`] - TS integration details plus motion/interaction UX quality constraints.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: Needed to reason about concrete App.tsx integration.
- INCLUDED `frontend-ui-ux`: Needed to preserve native-feel transition quality.
- OMITTED `agent-browser`: Runtime check already covered by Task 1/Task 5.
- OMITTED `dev-browser`: Not required for purely analytical decision step.
- OMITTED `git-master`: No git operation.
- OMITTED `python-programmer`: Domain mismatch.
- OMITTED `svelte-programmer`: Framework mismatch.
- OMITTED `golang-tui-programmer`: Domain mismatch.
- OMITTED `python-debugger`: Language mismatch.
- OMITTED `data-scientist`: No data workflow.
- OMITTED `prompt-engineer`: No prompt workflow.

**Depends On**: Task 1

**Acceptance Criteria**:
- [ ] Decision memo includes both options:
  - `mode="popLayout"`: exiting pane removed from flow; requires positioned parent.
  - Manual absolute: full control but requires explicit height management and increases implementation risk.
- [ ] Chosen default: **`mode="popLayout"` + positioned transition parent**.
- [ ] Fallback documented: manual absolute overlay only if `popLayout` produces offset/transform anomalies in Mini App webview.

### Task 3: Implement Layout Isolation Fix in `frontend/src/App.tsx`
**Description**: Apply selected transition strategy so enter/exit panes do not stack in normal flow.

**Delegation Recommendation**:
- Category: `unspecified-low` - Moderate single-file code change with animation behavior impact.
- Skills: [`typescript-programmer`, `frontend-ui-ux`] - Implementation in TSX plus preserving motion feel and spacing.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: Needed for safe React/Framer edits.
- INCLUDED `frontend-ui-ux`: Needed to preserve transition quality and prevent visual regressions.
- OMITTED `agent-browser`: Implementation task, not browser automation.
- OMITTED `dev-browser`: Verification handled in Task 5.
- OMITTED `git-master`: No git operation in this step.
- OMITTED `python-programmer`: Domain mismatch.
- OMITTED `svelte-programmer`: Framework mismatch.
- OMITTED `golang-tui-programmer`: Domain mismatch.
- OMITTED `python-debugger`: Language mismatch.
- OMITTED `data-scientist`: No data processing.
- OMITTED `prompt-engineer`: No LLM prompt work.

**Depends On**: Task 2

**Acceptance Criteria**:
- [ ] `frontend/src/App.tsx` transition container is explicitly positioned (`relative`) for stable `popLayout` behavior.
- [ ] `AnimatePresence` mode is updated from `sync` to selected strategy (`popLayout` by default).
- [ ] During transition, entering pane no longer appears below a residual vertical gap from exiting pane.
- [ ] Swipe gestures and tab switching still function (`switchTab`, drag constraints, thresholds unchanged).

### Task 4: Implement Scroll Reset for Shelves Entry
**Description**: Ensure `Полки` header starts at the top of viewport on every entry to Shelves.

**Delegation Recommendation**:
- Category: `unspecified-low` - Small behavior change with UX implications in one component.
- Skills: [`typescript-programmer`, `dev-browser`] - TS effect implementation plus runtime validation of scroll behavior.

**Skills Evaluation**:
- INCLUDED `typescript-programmer`: Needed for robust `useEffect` integration in `App.tsx`.
- INCLUDED `dev-browser`: Needed to validate real scroll restoration behavior.
- OMITTED `agent-browser`: `dev-browser` covers runtime browser checks.
- OMITTED `frontend-ui-ux`: No visual redesign, behavior-level change only.
- OMITTED `git-master`: No git operation.
- OMITTED `python-programmer`: Domain mismatch.
- OMITTED `svelte-programmer`: Framework mismatch.
- OMITTED `golang-tui-programmer`: Domain mismatch.
- OMITTED `python-debugger`: Language mismatch.
- OMITTED `data-scientist`: No data workload.
- OMITTED `prompt-engineer`: No prompt workflow.

**Depends On**: Task 2

**Acceptance Criteria**:
- [ ] Add tab-change scroll restoration in `frontend/src/App.tsx` (or explicitly justified `useUIStore` alternative).
- [ ] On switch to Shelves, viewport scroll resets to top (`window.scrollTo({ top: 0, left: 0, behavior: "auto" })` or equivalent).
- [ ] `frontend/src/screens/shelves/ShelvesMainView.tsx:111` header (`Полки`) is visible at top after transition completes.
- [ ] No forced scroll reset while staying within same tab.

### Task 5: Manual Verification and Regression Pass
**Description**: Validate layout and scroll behavior under realistic interaction patterns in Telegram Mini App conditions.

**Delegation Recommendation**:
- Category: `visual-engineering` - Motion/UI verification in interaction-heavy flow.
- Skills: [`dev-browser`, `frontend-ui-ux`] - Browser automation plus visual behavior scrutiny.

**Skills Evaluation**:
- INCLUDED `dev-browser`: Needed for deterministic interaction and evidence capture.
- INCLUDED `frontend-ui-ux`: Needed to evaluate transition smoothness and visual correctness.
- OMITTED `agent-browser`: `dev-browser` already selected.
- OMITTED `git-master`: No git operation.
- OMITTED `typescript-programmer`: No code editing required in this task.
- OMITTED `python-programmer`: Domain mismatch.
- OMITTED `svelte-programmer`: Framework mismatch.
- OMITTED `golang-tui-programmer`: Domain mismatch.
- OMITTED `python-debugger`: Language mismatch.
- OMITTED `data-scientist`: No data workflow.
- OMITTED `prompt-engineer`: No prompt workflow.

**Depends On**: Task 3, Task 4

**Acceptance Criteria**:
- [ ] Start frontend: `bun run frontend/dev.ts`.
- [ ] Execute 10 rapid tab toggles (tap + swipe mix) and verify no vertical stacking gap.
- [ ] Verify entering Shelves from deep Focus scroll always lands with `Полки` header at top.
- [ ] Verify Focus tab still renders without extra gap after returning from Shelves.
- [ ] Capture after-fix screenshots for: Focus->Shelves mid-transition, Shelves settled top state.

### Task 6: Commit and Handoff
**Description**: Create one atomic commit after verification and provide concise handoff notes.

**Delegation Recommendation**:
- Category: `quick` - Small, bounded repository operation.
- Skills: [`git-master`] - Commit hygiene and message quality.

**Skills Evaluation**:
- INCLUDED `git-master`: Needed for atomic staging/commit flow.
- OMITTED `agent-browser`: Not a browser task.
- OMITTED `frontend-ui-ux`: No design/implementation work here.
- OMITTED `dev-browser`: Verification completed in Task 5.
- OMITTED `typescript-programmer`: No code work in this step.
- OMITTED `python-programmer`: Domain mismatch.
- OMITTED `svelte-programmer`: Framework mismatch.
- OMITTED `golang-tui-programmer`: Domain mismatch.
- OMITTED `python-debugger`: Language mismatch.
- OMITTED `data-scientist`: No data work.
- OMITTED `prompt-engineer`: No prompt optimization.

**Depends On**: Task 5

**Acceptance Criteria**:
- [ ] Commit includes only files relevant to this fix.
- [ ] Commit message example: `fix(frontend): prevent Focus/Shelves stacking during tab transition`.
- [ ] Handoff note includes verification evidence paths and any known caveats.

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| Task 6 | `fix(frontend): prevent Focus/Shelves stacking during tab transition` | `frontend/src/App.tsx` (and only related files if needed) | Manual QA checklist from Task 5 completed with evidence |

## Success Criteria

### Final Verification Steps
```bash
bun run frontend/dev.ts
```
Expected:
- Focus/Shelves transition does not create vertical stacking gap.
- Shelves entry always places `Полки` header at top.
- Swipe + tab button switching remain functional and smooth.

### Final Checklist
- [ ] Exact CSS cause documented and confirmed.
- [ ] `popLayout` vs manual absolute evaluated with rationale.
- [ ] Scroll reset behavior implemented and verified.
- [ ] No regression in tab switching interactions.
- [ ] Atomic commit prepared with clear message.
