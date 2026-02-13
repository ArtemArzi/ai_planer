# Issues
# 2026-02-06
- Blocker: multiple delegate_task attempts for Stage 3.1 frontend scaffold failed immediately with agent errors (bg_2a480383, bg_e10eac21, bg_78800e0f, bg_c94f616d, bg_2659a051, bg_fc5e3647, bg_bf19058a, bg_9d6fec77, bg_c7ac11f9). Need subagent reliability fix or permission to implement directly.
- Tooling issue: `lsp_diagnostics` for `frontend/src/components/InboxStack.tsx` returns stale old import error about `useBatchUpdateTasks` despite file contents updated and formatting applied. Build/dev start checks pass.
- Tooling issue: `lsp_diagnostics` also reported stale old `openSettings` reference for `frontend/src/screens/ShelvesTab.tsx` after removal; targeted `bunx tsc --noEmit` checks pass.
- Tooling issue: `lsp_diagnostics` reported stale missing export `useCreateTask` in `AddTaskSheet.tsx`, but targeted `bunx tsc --noEmit` for `AddTaskSheet/App/tasks` passes.
- Tooling issue: repeated stale `openSettings` diagnostic for `ShelvesTab.tsx`; file uses `useUIStore.setState(...)` and targeted `bunx tsc --noEmit` passes.
- Tooling issue: recurring stale TaskRow timer type diagnostic (`number` vs `Timeout`) from `lsp_diagnostics`; targeted `bunx tsc --noEmit` for TaskRow-related files passes.

# 2026-02-09
- Verification gap: `frontend/package.json` does not have a `build` script; `bun run build` fails with `Script not found "build"`.
- Mitigation used: frontend compile surface checked via LSP diagnostics + `bun run css` pipeline command.
- Remaining product validation gap: manual client-journey E2E screenshots (Task 8) not automated in this pass.
