# Mobile Performance Baseline (Phase 0)

This document defines the baseline telemetry protocol for the Telegram Mini App without changing product behavior.

## KPI definitions

- `mobile.cold_start.first_interactive_paint_ms`
  - Time from frontend perf bootstrap to first interactive app paint.
  - Unit: milliseconds.

- `mobile.tab_switch.focus_shelves_latency_ms`
  - Time from tab switch intent (`focus <-> shelves`) to rendered tab frame.
  - Metadata: `fromTab`, `toTab`, `source` (`tab-bar`, `swipe`, `programmatic`).
  - Unit: milliseconds.

- `mobile.shelves.first_open_ready_latency_ms`
  - First-open Shelves ready latency (warm path) from first switch intent to Shelves ready state.
  - Metadata: `tab=shelves`, `profile=warm`.
  - Unit: milliseconds.

- `mobile.long_task.over_50ms.duration_ms`
  - Individual long task duration samples while app is open (`duration > 50ms`).
  - Aggregate count is available through `window.LAZYFLOW_PERF.getLongTaskCount()`.
  - Unit: milliseconds.

## Console helper

Baseline telemetry is exposed globally:

- `window.LAZYFLOW_PERF.getSamples()` - read all samples
- `window.LAZYFLOW_PERF.getSamples("metric_name")` - filter by metric
- `window.LAZYFLOW_PERF.clearSamples()` - clear in-memory samples and long-task counter
- `window.LAZYFLOW_PERF.exportSamples()` - export snapshot payload
- `window.LAZYFLOW_PERF.getLongTaskCount()` - read long-task count (`>50ms`)

## Measurement protocol (mobile / Telegram WebView)

1. Use one stable device profile (same device model, OS, power mode, network type).
2. Open Mini App inside Telegram and attach remote debugger:
   - Android: Chrome DevTools (`chrome://inspect`).
   - iOS: Safari Web Inspector.
3. In console, run `window.LAZYFLOW_PERF.clearSamples()` before each trial.
4. Cold start trial:
   - Fully close Mini App view, reopen it, then read `mobile.cold_start.first_interactive_paint_ms`.
5. Tab switch trial:
   - Run 10 switches (`Focus -> Shelves -> Focus...`) via normal user interaction.
   - Export `mobile.tab_switch.focus_shelves_latency_ms` samples and calculate p50.
6. Shelves first-open warm trial:
   - Start from Focus, open Shelves once, then read `mobile.shelves.first_open_ready_latency_ms`.
7. Long-task trial:
   - Perform key interactions (tab switch, first Shelves open).
   - Check `window.LAZYFLOW_PERF.getLongTaskCount()` and long-task metric samples.

## Default budgets

- Tab switch latency: `<= 120ms` p50.
- Shelves first-open warm ready latency: `<= 250ms`.
- Long tasks: maximum `2` tasks over `50ms` per key interaction.

Cold start baseline is tracked and compared between phases; no fixed hard gate is set in Phase 0.
