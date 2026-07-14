import { SELECTED_BUDGET_STORAGE_KEY } from "../../features/budget/budgetDataScope";
import { getPersistenceModeSummary } from "../../features/persistence/persistenceMode";

export type AppErrorSource = "startup" | "react-boundary" | "route";

export interface AppErrorDiagnostics {
  timestamp: string;
  source: AppErrorSource;
  route: string;
  selectedBudgetId: string | null;
  persistenceMode: string;
  browser: string;
  errorName: string;
  errorMessage: string;
  stack: string | null;
  componentStack?: string | null;
}

function readSelectedBudgetId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(SELECTED_BUDGET_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function readPersistenceMode(): string {
  try {
    return getPersistenceModeSummary().mode;
  } catch {
    return "unavailable";
  }
}

function normalizeError(error: unknown): {
  name: string;
  message: string;
  stack: string | null;
} {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "An unknown application error occurred.",
      stack: error.stack ?? null,
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: error,
      stack: null,
    };
  }

  try {
    return {
      name: "UnknownError",
      message: JSON.stringify(error),
      stack: null,
    };
  } catch {
    return {
      name: "UnknownError",
      message: String(error),
      stack: null,
    };
  }
}

export function buildAppErrorDiagnostics(
  error: unknown,
  source: AppErrorSource,
  componentStack?: string | null,
): AppErrorDiagnostics {
  const normalizedError = normalizeError(error);

  return {
    timestamp: new Date().toISOString(),
    source,
    route:
      typeof window === "undefined"
        ? "unavailable"
        : `${window.location.pathname}${window.location.search}${window.location.hash}`,
    selectedBudgetId: readSelectedBudgetId(),
    persistenceMode: readPersistenceMode(),
    browser:
      typeof navigator === "undefined" ? "unavailable" : navigator.userAgent,
    errorName: normalizedError.name,
    errorMessage: normalizedError.message,
    stack: normalizedError.stack,
    componentStack: componentStack ?? null,
  };
}

export function formatAppErrorDiagnostics(
  diagnostics: AppErrorDiagnostics,
): string {
  return [
    "Budget App diagnostic report",
    `Timestamp: ${diagnostics.timestamp}`,
    `Source: ${diagnostics.source}`,
    `Route: ${diagnostics.route}`,
    `Selected budget: ${diagnostics.selectedBudgetId ?? "none"}`,
    `Persistence mode: ${diagnostics.persistenceMode}`,
    `Browser: ${diagnostics.browser}`,
    `Error: ${diagnostics.errorName}: ${diagnostics.errorMessage}`,
    "",
    "Stack:",
    diagnostics.stack ?? "Unavailable",
    "",
    "React component stack:",
    diagnostics.componentStack ?? "Unavailable",
  ].join("\n");
}

export function downloadAppErrorDiagnostics(
  diagnostics: AppErrorDiagnostics,
): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return;
  }

  const blob = new Blob([formatAppErrorDiagnostics(diagnostics)], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `budget-app-diagnostics-${diagnostics.timestamp.replace(/[:.]/g, "-")}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}
