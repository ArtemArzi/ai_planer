type PerfMetadataValue = string | number | boolean | null;
type PerfMetadata = Record<string, PerfMetadataValue>;

type TabName = "focus" | "shelves";

export type TabSwitchSource = "tab-bar" | "swipe" | "programmatic";

export const PERF_METRICS = {
  coldStartToFirstInteractivePaint: "mobile.cold_start.first_interactive_paint_ms",
  tabSwitchLatency: "mobile.tab_switch.focus_shelves_latency_ms",
  shelvesFirstOpenReadyLatency: "mobile.shelves.first_open_ready_latency_ms",
  longTaskDurationOver50ms: "mobile.long_task.over_50ms.duration_ms",
} as const;

export type PerfSample = {
  name: string;
  valueMs: number;
  tsMs: number;
  metadata?: PerfMetadata;
};

type LazyflowPerfExport = {
  exportedAtMs: number;
  samples: PerfSample[];
  longTaskCount: number;
};

type LazyflowPerfHelper = {
  getSamples: (name?: string) => PerfSample[];
  clearSamples: () => void;
  exportSamples: () => LazyflowPerfExport;
  getLongTaskCount: () => number;
};

declare global {
  interface Window {
    LAZYFLOW_PERF?: LazyflowPerfHelper;
  }
}

const samples: PerfSample[] = [];

let appStartAtMs: number | null = null;
let hasRecordedFirstInteractivePaint = false;

let pendingTabSwitch: {
  fromTab: TabName;
  toTab: TabName;
  source: TabSwitchSource;
  startedAtMs: number;
} | null = null;

let shelvesFirstOpenStartAtMs: number | null = null;
let hasRecordedShelvesFirstOpenReady = false;

let longTaskCount = 0;
let longTaskObserverStarted = false;

function nowMs(): number {
  return Date.now();
}

function cloneSample(sample: PerfSample): PerfSample {
  return {
    ...sample,
    metadata: sample.metadata ? { ...sample.metadata } : undefined,
  };
}

function cloneSamples(list: PerfSample[]): PerfSample[] {
  return list.map(cloneSample);
}

function ensureAppStartAtMs(): number {
  if (appStartAtMs === null) {
    appStartAtMs = nowMs();
  }

  return appStartAtMs;
}

function recordSample(name: string, valueMs: number, metadata?: PerfMetadata): void {
  if (!Number.isFinite(valueMs) || valueMs < 0) {
    return;
  }

  samples.push({
    name,
    valueMs,
    tsMs: nowMs(),
    metadata,
  });
}

function attachGlobalHelper(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.LAZYFLOW_PERF = {
    getSamples: (name) => {
      if (!name) {
        return cloneSamples(samples);
      }

      return cloneSamples(samples.filter((sample) => sample.name === name));
    },
    clearSamples: () => {
      samples.length = 0;
      longTaskCount = 0;
      pendingTabSwitch = null;
    },
    exportSamples: () => ({
      exportedAtMs: nowMs(),
      samples: cloneSamples(samples),
      longTaskCount,
    }),
    getLongTaskCount: () => longTaskCount,
  };
}

function startLongTaskObserver(): void {
  if (longTaskObserverStarted || typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration <= 50) {
          continue;
        }

        longTaskCount += 1;
        recordSample(PERF_METRICS.longTaskDurationOver50ms, entry.duration, {
          thresholdMs: 50,
          entryType: entry.entryType,
          entryName: entry.name,
        });
      }
    });

    observer.observe({ entryTypes: ["longtask"] });
    longTaskObserverStarted = true;
  } catch {
    longTaskObserverStarted = true;
  }
}

export function initializePerfInstrumentation(): void {
  ensureAppStartAtMs();
  attachGlobalHelper();
  startLongTaskObserver();
}

export function markColdStartFirstInteractivePaint(): void {
  const startedAtMs = ensureAppStartAtMs();
  if (hasRecordedFirstInteractivePaint) {
    return;
  }

  hasRecordedFirstInteractivePaint = true;
  recordSample(PERF_METRICS.coldStartToFirstInteractivePaint, nowMs() - startedAtMs, {
    phase: "phase_0",
  });
}

export function startTabSwitchMeasurement(fromTab: TabName, toTab: TabName, source: TabSwitchSource): void {
  if (fromTab === toTab) {
    return;
  }

  const startedAtMs = nowMs();
  pendingTabSwitch = {
    fromTab,
    toTab,
    source,
    startedAtMs,
  };

  if (toTab === "shelves" && shelvesFirstOpenStartAtMs === null && !hasRecordedShelvesFirstOpenReady) {
    shelvesFirstOpenStartAtMs = startedAtMs;
  }
}

export function markTabSwitchRendered(activeTab: TabName): void {
  if (!pendingTabSwitch || pendingTabSwitch.toTab !== activeTab) {
    return;
  }

  recordSample(PERF_METRICS.tabSwitchLatency, nowMs() - pendingTabSwitch.startedAtMs, {
    fromTab: pendingTabSwitch.fromTab,
    toTab: pendingTabSwitch.toTab,
    source: pendingTabSwitch.source,
  });

  pendingTabSwitch = null;
}

export function markShelvesFirstOpenReady(): void {
  if (hasRecordedShelvesFirstOpenReady || shelvesFirstOpenStartAtMs === null) {
    return;
  }

  recordSample(PERF_METRICS.shelvesFirstOpenReadyLatency, nowMs() - shelvesFirstOpenStartAtMs, {
    tab: "shelves",
    profile: "warm",
  });

  hasRecordedShelvesFirstOpenReady = true;
  shelvesFirstOpenStartAtMs = null;
}
