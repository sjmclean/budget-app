export type RegisterPerformanceTimingName =
  | "visible pagination"
  | "transaction index"
  | "payee summary build";

export type RegisterPerformanceTimings = Partial<Record<RegisterPerformanceTimingName, number>>;

export interface RegisterPerformanceSnapshotInput {
  enabled: boolean;
  renderStartedAt: number | null;
  totalTransactions: number;
  visibleTransactions: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  payeeManagerOpen: boolean;
  payeeSummaryCount: number;
  selectedTransaction: boolean;
  editingTransaction: boolean;
  timings: RegisterPerformanceTimings;
}

export interface RegisterPerformanceSnapshot {
  totalTransactions: number;
  visibleTransactions: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  payeeManagerOpen: boolean;
  payeeSummaryCount: number;
  selectedTransaction: boolean;
  editingTransaction: boolean;
  renderElapsedMs: number | null;
  timings: RegisterPerformanceTimings;
  totalMeasuredMs: number;
  warningLevel: "ok" | "watch" | "slow";
}

export function getPerformanceNow(enabled = true): number | null {
  if (!enabled || typeof performance === "undefined" || typeof performance.now !== "function") {
    return null;
  }

  return performance.now();
}

export function measureRegisterPerformance<T>(
  enabled: boolean,
  timings: RegisterPerformanceTimings,
  name: RegisterPerformanceTimingName,
  callback: () => T,
): T {
  const startedAt = getPerformanceNow(enabled);

  try {
    return callback();
  } finally {
    if (startedAt !== null) {
      const finishedAt = getPerformanceNow(enabled);
      if (finishedAt !== null) {
        timings[name] = finishedAt - startedAt;
      }
    }
  }
}

export function buildRegisterPerformanceSnapshot(
  input: RegisterPerformanceSnapshotInput,
): RegisterPerformanceSnapshot | null {
  if (!input.enabled) {
    return null;
  }

  const finishedAt = getPerformanceNow(true);
  const renderElapsedMs =
    input.renderStartedAt !== null && finishedAt !== null ? finishedAt - input.renderStartedAt : null;
  const timingValues = Object.values(input.timings).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  const totalMeasuredMs = timingValues.reduce((total, value) => total + value, 0);
  const slowestMeasuredMs = Math.max(renderElapsedMs ?? 0, totalMeasuredMs, ...timingValues, 0);

  return {
    totalTransactions: input.totalTransactions,
    visibleTransactions: input.visibleTransactions,
    currentPage: input.currentPage,
    totalPages: input.totalPages,
    pageSize: input.pageSize,
    payeeManagerOpen: input.payeeManagerOpen,
    payeeSummaryCount: input.payeeSummaryCount,
    selectedTransaction: input.selectedTransaction,
    editingTransaction: input.editingTransaction,
    renderElapsedMs,
    timings: { ...input.timings },
    totalMeasuredMs,
    warningLevel: slowestMeasuredMs >= 100 ? "slow" : slowestMeasuredMs >= 32 ? "watch" : "ok",
  };
}

export function formatPerformanceMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  if (value < 10) {
    return `${value.toFixed(2)} ms`;
  }

  if (value < 100) {
    return `${value.toFixed(1)} ms`;
  }

  return `${Math.round(value)} ms`;
}
