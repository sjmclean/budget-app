export interface SqliteImportAccount {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly participation: string;
  readonly openingBalance: number;
  readonly closedAt: string | null;
}

export interface SqliteImportPayee {
  readonly id: string;
  readonly name: string;
}

export interface SqliteImportCategory {
  readonly id: string;
  readonly name: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly sortOrder: number;
}

export interface SqliteImportTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly payeeId: string | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly transferAccountId: string | null;
  readonly transferTransactionId: string | null;
  readonly splitLines: readonly SqliteImportSplitLine[];
  readonly type: string;
  readonly date: string;
  readonly memo: string | null;
  readonly checkNumber: string | null;
  readonly amount: number;
  readonly clearedStatus: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly tagIds?: readonly string[];
}

export interface SqliteImportSplitLine {
  readonly id: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly transferAccountId: string | null;
  readonly transferTransactionId: string | null;
  readonly memo: string | null;
  readonly amount: number;
}

export interface SqliteImportBudgetMonth {
  readonly month: string;
  readonly view: import("../budget/budgetViewTypes").BudgetMonthView;
}

export type SqliteImportScheduledTransaction =
  import("../accounts/scheduledTransactionService").ScheduledTransactionView;

export interface HostedSqliteImportSession {
  readonly generationId: string;
  persistReferenceData(input: {
    readonly accounts: readonly SqliteImportAccount[];
    readonly payees: readonly SqliteImportPayee[];
    readonly categories: readonly SqliteImportCategory[];
  }, options?: { readonly signal?: AbortSignal }): Promise<void>;
  persistTransactions(
    rows: readonly SqliteImportTransaction[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<void>;
  persistScheduledTransactions(
    rows: readonly SqliteImportScheduledTransaction[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<void>;
  persistBudgetMonths(
    rows: readonly SqliteImportBudgetMonth[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<void>;
  persistTransactionTags?(
    rows: readonly { readonly id: string; readonly payload: unknown }[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<void>;
  validate(options?: { readonly signal?: AbortSignal }): Promise<{
    readonly valid: true;
    readonly counts: {
      readonly accounts: number;
      readonly transactions: number;
      readonly scheduledTransactions: number;
    };
  }>;
  commit(options?: { readonly signal?: AbortSignal }): Promise<{
    readonly budgetId: string;
    readonly generationId: string;
    readonly state: "active";
  }>;
  cancel(): Promise<void>;
}

const MAX_IMPORT_BATCH_ROWS = 2_000;

export function createHostedSqliteImportClient(options: {
  readonly apiBaseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
} = {}) {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const apiBaseUrl = (options.apiBaseUrl ?? "").replace(/\/+$/, "");

  async function request<T>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await fetchImplementation(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({})) as {
      code?: string;
      message?: string;
      details?: unknown;
    };
    if (!response.ok) {
      throw Object.assign(
        new Error(body.message ?? `SQLite import request failed with HTTP ${response.status}.`),
        { code: body.code, status: response.status, details: body.details },
      );
    }
    return body as unknown as T;
  }

  return {
    async begin(input: {
      readonly budgetId: string;
      readonly budgetName: string;
      readonly currency: string;
      readonly signal?: AbortSignal;
    }): Promise<HostedSqliteImportSession> {
      const started = await request<{ generationId: string }>("/api/budget-engine/imports", {
        method: "POST",
        signal: input.signal,
        body: JSON.stringify({
          budgetId: input.budgetId,
          budgetName: input.budgetName,
          currency: input.currency,
        }),
      });
      const generationPath = `/api/budget-engine/imports/${encodeURIComponent(started.generationId)}`;
      return {
        generationId: started.generationId,
        async persistReferenceData(referenceData, requestOptions) {
          const collections = [
            ["accounts", referenceData.accounts],
            ["payees", referenceData.payees],
            ["categories", referenceData.categories],
          ] as const;
          for (const [collectionName, rows] of collections) {
            for (let offset = 0; offset < rows.length; offset += MAX_IMPORT_BATCH_ROWS) {
              requestOptions?.signal?.throwIfAborted();
              await request(`${generationPath}/reference-data`, {
                method: "POST",
                signal: requestOptions?.signal,
                body: JSON.stringify({
                  accounts:
                    collectionName === "accounts"
                      ? rows.slice(offset, offset + MAX_IMPORT_BATCH_ROWS)
                      : [],
                  payees:
                    collectionName === "payees"
                      ? rows.slice(offset, offset + MAX_IMPORT_BATCH_ROWS)
                      : [],
                  categories:
                    collectionName === "categories"
                      ? rows.slice(offset, offset + MAX_IMPORT_BATCH_ROWS)
                      : [],
                }),
              });
            }
          }
        },
        async persistTransactions(rows, requestOptions) {
          await request(`${generationPath}/transactions`, {
            method: "POST",
            signal: requestOptions?.signal,
            body: JSON.stringify({ rows }),
          });
        },
        async persistScheduledTransactions(rows, requestOptions) {
          for (let offset = 0; offset < rows.length; offset += MAX_IMPORT_BATCH_ROWS) {
            requestOptions?.signal?.throwIfAborted();
            await request(`${generationPath}/scheduled-transactions`, {
              method: "POST",
              signal: requestOptions?.signal,
              body: JSON.stringify({
                rows: rows.slice(offset, offset + MAX_IMPORT_BATCH_ROWS),
              }),
            });
          }
        },
        async persistBudgetMonths(rows, requestOptions) {
          for (let offset = 0; offset < rows.length; offset += MAX_IMPORT_BATCH_ROWS) {
            await request(`${generationPath}/budget-months`, {
              method: "POST",
              signal: requestOptions?.signal,
              body: JSON.stringify({
                rows: rows.slice(offset, offset + MAX_IMPORT_BATCH_ROWS),
              }),
            });
          }
        },
        validate(requestOptions) {
          return request(`${generationPath}/validate`, {
            method: "POST",
            signal: requestOptions?.signal,
          });
        },
        commit(requestOptions) {
          return request(`${generationPath}/commit`, {
            method: "POST",
            signal: requestOptions?.signal,
          });
        },
        async cancel() {
          await request(generationPath, { method: "DELETE" });
        },
      };
    },
  };
}
