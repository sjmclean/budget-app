import type {
  HostedBudgetRestoreResult,
} from "../hostedAccountRegisterQueryClient";

export interface BudgetLifecycleControlPlaneClient {
  getBudgetExportUrl(budgetId: string, kind: "backup" | "export"): string;
  restoreBudget(
    budgetId: string,
    file: Blob,
  ): Promise<HostedBudgetRestoreResult>;
  resetBudget(budgetId: string, month: string): Promise<void>;
  deleteBudget(budgetId: string): Promise<void>;
}

export interface BudgetLifecycleControlPlaneClientOptions {
  readonly apiBaseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
}

/**
 * Server catalogue/backup lifecycle only.
 *
 * Budget reads and writes must never be added here: active budget data belongs
 * to the browser's local SQLite worker and is synchronised through the relay.
 */
export function createBudgetLifecycleControlPlaneClient(
  options: BudgetLifecycleControlPlaneClientOptions = {},
): BudgetLifecycleControlPlaneClient {
  const apiBaseUrl = options.apiBaseUrl ?? "";
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;

  async function writeJson(
    path: string,
    method: "POST" | "DELETE",
    body?: unknown,
  ): Promise<unknown> {
    const response = await fetchImplementation(`${apiBaseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => ({})) as {
      code?: string;
      message?: string;
    };
    if (!response.ok) {
      throw Object.assign(
        new Error(result.message ?? `Budget lifecycle request failed with HTTP ${response.status}.`),
        { code: result.code, status: response.status },
      );
    }
    return result;
  }

  return {
    getBudgetExportUrl(budgetId, kind) {
      return `${apiBaseUrl}/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
        `/export?kind=${encodeURIComponent(kind)}`;
    },
    async restoreBudget(budgetId, file) {
      const response = await fetchImplementation(
        `${apiBaseUrl}/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/restore`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-ndjson",
          },
          body: file,
        },
      );
      const result = await response.json().catch(() => ({})) as {
        code?: string;
        message?: string;
      };
      if (!response.ok) {
        throw Object.assign(
          new Error(result.message ?? `Budget restore failed with HTTP ${response.status}.`),
          { code: result.code, status: response.status },
        );
      }
      return result as HostedBudgetRestoreResult;
    },
    async resetBudget(budgetId, month) {
      await writeJson(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/reset`,
        "POST",
        { month },
      );
    },
    async deleteBudget(budgetId) {
      await writeJson(
        `/api/local-first/budget?budgetId=${encodeURIComponent(budgetId)}`,
        "DELETE",
      );
    },
  };
}
