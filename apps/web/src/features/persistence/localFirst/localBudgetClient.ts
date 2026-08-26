import {
  assertCompleteManifest,
  type BudgetDomain,
  type BudgetDomainCounts,
  type LocalImportEntity,
  type LocalBudgetManifest,
  type LocalDatabasePromotionResult,
  type LocalBudgetMutation,
  type LocalBudgetSyncState,
  type LocalFirstMutationConflict,
  type LocalFirstStoredConflict,
  type LocalBudgetWorkerRequest,
  type LocalBudgetWorkerResponse,
} from "./contracts";
import type {
  LocalRegisterImportBatch,
  ImportHistorySnapshot,
  LocalPayeeRecord,
  LocalTransactionQuery,
  LocalTransactionAttachmentRecord,
  LocalTransactionRecord,
  TransactionHistorySnapshot,
} from "./registerSchema";
import type {
  AccountRegisterSummary,
  AccountTransactionPage,
} from "../../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import { createRuntimeUuid } from "../../ids/createRuntimeUuid";

interface PendingRequest {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
}

type LocalBudgetFilePointerStorage =
  Pick<Storage, "getItem" | "setItem"> &
  Partial<Pick<Storage, "removeItem">> & {
    readonly flush?: () => Promise<void>;
  };

const LOCAL_DATABASE_FILE_KEY_PREFIX =
  "budget-app.local-first.database-file.";

function databaseFilePointerKey(budgetId: string): string {
  return `${LOCAL_DATABASE_FILE_KEY_PREFIX}${budgetId}`;
}

function defaultFilePointerStorage(): LocalBudgetFilePointerStorage | null {
  try {
    if (!("localStorage" in globalThis)) return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

async function publishDatabaseFilePointer(
  storage: LocalBudgetFilePointerStorage,
  budgetId: string,
  physicalFilename: string,
): Promise<void> {
  storage.setItem(
    databaseFilePointerKey(budgetId),
    physicalFilename,
  );
  await storage.flush?.();
}

async function restoreDatabaseFilePointer(
  storage: LocalBudgetFilePointerStorage,
  budgetId: string,
  previousPhysicalFilename: string | null,
): Promise<void> {
  const key = databaseFilePointerKey(budgetId);

  if (previousPhysicalFilename === null) {
    if (!storage.removeItem) {
      throw new Error(
        "The previous local SQLite physical-file pointer cannot be restored because this storage does not support removal.",
      );
    }
    storage.removeItem(key);
  } else {
    storage.setItem(key, previousPhysicalFilename);
  }

  await storage.flush?.();
}

function databaseFilePointerMatches(
  storage: LocalBudgetFilePointerStorage,
  budgetId: string,
  expectedPhysicalFilename: string | null,
): boolean {
  try {
    return (
      storage.getItem(databaseFilePointerKey(budgetId)) ===
      expectedPhysicalFilename
    );
  } catch {
    return false;
  }
}

export class LocalBudgetDatabaseClient {
  readonly #worker: Worker;
  readonly #storage: LocalBudgetFilePointerStorage | null;
  readonly #pending = new Map<string, PendingRequest>();

  constructor(
    worker = new Worker(new URL("./localBudget.worker.ts", import.meta.url), {
      type: "module",
      name: "budget-app-local-sqlite",
    }),
    storage: LocalBudgetFilePointerStorage | null = defaultFilePointerStorage(),
  ) {
    this.#worker = worker;
    this.#storage = storage;
    worker.onmessage = (event: MessageEvent<LocalBudgetWorkerResponse>) => {
      const response = event.data;
      const pending = this.#pending.get(response.requestId);
      if (!pending) return;
      this.#pending.delete(response.requestId);
      if (response.ok) {
        pending.resolve(response.result);
      } else {
        pending.reject(Object.assign(new Error(response.error.message), {
          code: response.error.code,
        }));
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "The local SQLite worker failed.");
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
    };
  }

  async open(input: {
    readonly budgetId: string;
    readonly syncEpoch: string;
    readonly deviceId: string;
  }): Promise<LocalBudgetManifest> {
    const storage = this.#storage;
    const physicalFilename = storage
      ? storage.getItem(databaseFilePointerKey(input.budgetId)) ?? undefined
      : undefined;

    const manifest = await this.#request<LocalBudgetManifest>({
      requestId: createRuntimeUuid(),
      type: "open",
      ...input,
      physicalFilename,
    });
    assertCompleteManifest(manifest);
    if (!manifest.durable) {
      throw new Error("The local budget opened without durable browser storage.");
    }
    return manifest;
  }

  async getManifest(): Promise<LocalBudgetManifest> {
    const manifest = await this.#request<LocalBudgetManifest>({
      requestId: createRuntimeUuid(),
      type: "manifest",
    });
    assertCompleteManifest(manifest);
    return manifest;
  }

  prepareBaselineExport(): Promise<{ readonly totalBytes: number }> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "prepareBaselineExport",
    });
  }

  readBaselineExportChunk(offset: number, length: number): Promise<Uint8Array> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "readBaselineExportChunk",
      offset,
      length,
    });
  }

  finishBaselineExport(): Promise<void> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "finishBaselineExport",
    });
  }

  beginBaselineReplacement(input: {
    readonly budgetId: string;
    readonly syncEpoch: string;
    readonly deviceId: string;
    readonly totalBytes: number;
  }): Promise<void> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "beginBaselineReplacement",
      ...input,
    });
  }

  appendBaselineReplacement(
    offset: number,
    input: Uint8Array,
  ): Promise<{ readonly receivedBytes: number }> {
    const request: Extract<
      LocalBudgetWorkerRequest,
      { type: "appendBaselineReplacement" }
    > = {
      requestId: createRuntimeUuid(),
      type: "appendBaselineReplacement",
      offset,
      content: Uint8Array.from(input),
    };
    return this.#request(request, [request.content.buffer as ArrayBuffer]);
  }

  async commitBaselineReplacement(): Promise<LocalBudgetManifest> {
    const promotion = await this.#request<LocalDatabasePromotionResult>({
      requestId: createRuntimeUuid(),
      type: "commitBaselineReplacement",
    });
    const manifest = promotion.manifest;
    assertCompleteManifest(manifest);

    const storage = this.#storage;
    if (storage) {
      const previousPhysicalFilename = storage.getItem(
        databaseFilePointerKey(manifest.budgetId),
      );

      try {
        await publishDatabaseFilePointer(
          storage,
          manifest.budgetId,
          manifest.physicalFilename,
        );
      } catch (error) {
        let previousPointerRestored = false;
        try {
          await restoreDatabaseFilePointer(
            storage,
            manifest.budgetId,
            previousPhysicalFilename,
          );
          previousPointerRestored = true;
        } catch {
          // A synchronous publication failure may leave the previous pointer
          // completely untouched. If that can be observed directly, the old
          // generation remains authoritative and the candidate is disposable.
          //
          // Otherwise preserve the candidate: a leaked generation is
          // recoverable; deleting a possibly referenced generation is not.
          previousPointerRestored = databaseFilePointerMatches(
            storage,
            manifest.budgetId,
            previousPhysicalFilename,
          );
        }

        await this.#request({
          requestId: createRuntimeUuid(),
          type: "close",
        }).catch(() => undefined);

        if (previousPointerRestored) {
          await this.#request({
            requestId: createRuntimeUuid(),
            type: "retirePhysicalDatabaseFile",
            budgetId: manifest.budgetId,
            physicalFilename: manifest.physicalFilename,
          }).catch(() => undefined);
        }
        throw Object.assign(
          new Error(
            "The replacement database was completed, but its durable active-file pointer could not be published.",
          ),
          {
            code: "LOCAL_DATABASE_POINTER_WRITE_FAILED",
            cause: error,
          },
        );
      }

      if (promotion.supersededPhysicalFilename) {
        await this.#request({
          requestId: createRuntimeUuid(),
          type: "retirePhysicalDatabaseFile",
          budgetId: manifest.budgetId,
          physicalFilename: promotion.supersededPhysicalFilename,
        }).catch(() => undefined);
      }
    }

    return manifest;
  }

  abortBaselineReplacement(): Promise<void> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "abortBaselineReplacement",
    });
  }

  importRegisterBatch(batch: LocalRegisterImportBatch): Promise<void> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "importRegisterBatch",
      batch,
    });
  }

  beginStagedImport(input: {
    readonly budgetId: string;
    readonly syncEpoch: string;
    readonly deviceId: string;
  }): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "beginStagedImport",
      ...input,
    });
  }

  importEntityBatch(entities: readonly LocalImportEntity[]): Promise<void> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "importEntityBatch",
      entities,
    });
  }

  async commitStagedImport(
    expectedCounts: BudgetDomainCounts,
  ): Promise<LocalBudgetManifest> {
    const promotion = await this.#request<LocalDatabasePromotionResult>({
      requestId: createRuntimeUuid(),
      type: "commitStagedImport",
      expectedCounts,
    });
    const manifest = promotion.manifest;
    assertCompleteManifest(manifest);

    const storage = this.#storage;
    if (storage) {
      const previousPhysicalFilename = storage.getItem(
        databaseFilePointerKey(manifest.budgetId),
      );

      try {
        await publishDatabaseFilePointer(
          storage,
          manifest.budgetId,
          manifest.physicalFilename,
        );
      } catch (error) {
        let previousPointerRestored = false;
        try {
          await restoreDatabaseFilePointer(
            storage,
            manifest.budgetId,
            previousPhysicalFilename,
          );
          previousPointerRestored = true;
        } catch {
          // A synchronous publication failure may leave the previous pointer
          // completely untouched. If that can be observed directly, the old
          // generation remains authoritative and the candidate is disposable.
          //
          // Otherwise preserve the candidate: a leaked generation is
          // recoverable; deleting a possibly referenced generation is not.
          previousPointerRestored = databaseFilePointerMatches(
            storage,
            manifest.budgetId,
            previousPhysicalFilename,
          );
        }

        await this.#request({
          requestId: createRuntimeUuid(),
          type: "close",
        }).catch(() => undefined);

        if (previousPointerRestored) {
          await this.#request({
            requestId: createRuntimeUuid(),
            type: "retirePhysicalDatabaseFile",
            budgetId: manifest.budgetId,
            physicalFilename: manifest.physicalFilename,
          }).catch(() => undefined);
        }
        throw Object.assign(
          new Error(
            "The imported database was completed, but its durable active-file pointer could not be published.",
          ),
          {
            code: "LOCAL_DATABASE_POINTER_WRITE_FAILED",
            cause: error,
          },
        );
      }

      if (promotion.supersededPhysicalFilename) {
        await this.#request({
          requestId: createRuntimeUuid(),
          type: "retirePhysicalDatabaseFile",
          budgetId: manifest.budgetId,
          physicalFilename: promotion.supersededPhysicalFilename,
        }).catch(() => undefined);
      }
    }

    return manifest;
  }

  rollbackStagedImport(): Promise<void> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "rollbackStagedImport",
    });
  }

  getAccountSummary(input: {
    readonly budgetId: string;
    readonly accountId: string;
  }): Promise<AccountRegisterSummary> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "getAccountSummary",
      ...input,
    });
  }

  getFinancialOverview(
    budgetId: string,
    month: string,
  ): Promise<import("../accountRegisterQueryContracts").FinancialOverview> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "getFinancialOverview",
      budgetId,
      month,
    });
  }

  getMonthlySpending(
    budgetId: string,
    month: string,
  ): Promise<readonly import("../accountRegisterQueryContracts").SpendingCategoryRow[]> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "getMonthlySpending",
      budgetId,
      month,
    });
  }

  getMonthlyCategoryTransactions(
    budgetId: string,
    month: string,
    categoryId: string,
  ): Promise<readonly import("../../accounts/accountRegisterTypes").RegisterTransactionView[]> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "getMonthlyCategoryTransactions",
      budgetId,
      month,
      categoryId,
    });
  }

  getCategoryActivityDrilldown(
    budgetId: string,
    month: string,
    categoryId: string,
  ): Promise<import("../../budget/budgetViewTypes").BudgetActivityDrilldown> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "getCategoryActivityDrilldown",
      budgetId,
      month,
      categoryId,
    });
  }

  getBudgetProjectionDiagnostic(
    budgetId: string,
    month: string,
  ): Promise<import("./sqliteBudgetProjectionAdapter").LocalBudgetProjectionDiagnostic> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "getBudgetProjectionDiagnostic",
      budgetId,
      month,
    });
  }

  queryTransactions(query: LocalTransactionQuery): Promise<AccountTransactionPage> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "queryTransactions",
      query,
    });
  }

  getTransaction(
    budgetId: string,
    transactionId: string,
  ): Promise<LocalTransactionRecord | null> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "getTransaction",
      budgetId,
      transactionId,
    });
  }

  captureTransactionHistorySnapshots(
    budgetId: string,
    transactionIds: readonly string[],
  ): Promise<TransactionHistorySnapshot> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "captureTransactionHistorySnapshots",
      budgetId,
      transactionIds,
    });
  }

  restoreTransactionHistorySnapshot(
    snapshot: TransactionHistorySnapshot,
    mutations: readonly LocalBudgetMutation[],
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "restoreTransactionHistorySnapshot",
      snapshot,
      mutations,
    });
  }

  deleteTransactionHistorySnapshot(
    snapshot: TransactionHistorySnapshot,
    mutations: readonly LocalBudgetMutation[],
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "deleteTransactionHistorySnapshot",
      snapshot,
      mutations,
    });
  }

  replaceTransactionHistorySnapshot(
    expected: TransactionHistorySnapshot,
    replacement: TransactionHistorySnapshot,
    mutations: readonly LocalBudgetMutation[],
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "replaceTransactionHistorySnapshot",
      expected,
      replacement,
      mutations,
    });
  }

  captureImportHistorySnapshot(
    budgetId: string,
    transactionIds: readonly string[],
    payeeIds: readonly string[],
  ): Promise<ImportHistorySnapshot> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "captureImportHistorySnapshot",
      budgetId,
      transactionIds,
      payeeIds,
    });
  }

  replaceImportHistorySnapshot(
    expected: ImportHistorySnapshot,
    replacement: ImportHistorySnapshot,
    mutations: readonly LocalBudgetMutation[],
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "replaceImportHistorySnapshot",
      expected,
      replacement,
      mutations,
    });
  }

  replacePayeeDuplicateSuppressionsHistoryState(input: {
    readonly budgetId: string;
    readonly expected: readonly { readonly leftPayeeId: string; readonly rightPayeeId: string }[];
    readonly replacement: readonly { readonly leftPayeeId: string; readonly rightPayeeId: string }[];
  }): Promise<LocalBudgetManifest> {
    return this.#request({ requestId: createRuntimeUuid(), type: "replacePayeeDuplicateSuppressionsHistoryState", ...input });
  }

  replaceScheduledTransactionHistoryState(input: {
    readonly scheduleId: string;
    readonly expectedSchedule: import("../../accounts/scheduledTransactionTypes").ScheduledTransactionView | null;
    readonly replacementSchedule: import("../../accounts/scheduledTransactionTypes").ScheduledTransactionView | null;
    readonly expectedTransaction: TransactionHistorySnapshot | null;
    readonly replacementTransaction: TransactionHistorySnapshot | null;
    readonly mutations: readonly LocalBudgetMutation[];
  }): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "replaceScheduledTransactionHistoryState",
      ...input,
    });
  }

  replaceAccountHistoryState(input: {
    readonly accountId: string;
    readonly expected: import("./registerSchema").LocalAccountRecord | null;
    readonly replacement: import("./registerSchema").LocalAccountRecord | null;
    readonly mutation: LocalBudgetMutation;
  }): Promise<LocalBudgetManifest> {
    return this.#request({ requestId: createRuntimeUuid(), type: "replaceAccountHistoryState", ...input });
  }

  readAccountForHistory(accountId: string): Promise<import("./registerSchema").LocalAccountRecord | null> {
    return this.#request({ requestId: createRuntimeUuid(), type: "readAccountForHistory", accountId });
  }

  replaceBudgetMonthHistoryState(input: {
    readonly month: string;
    readonly expected: import("../../budget/budgetViewTypes").BudgetMonthView;
    readonly replacement: import("../../budget/budgetViewTypes").BudgetMonthView;
    readonly mutation: LocalBudgetMutation;
  }): Promise<LocalBudgetManifest> {
    return this.#request({ requestId: createRuntimeUuid(), type: "replaceBudgetMonthHistoryState", ...input });
  }

  getTransactionsByIds(
    budgetId: string,
    accountId: string,
    transactionIds: readonly string[],
  ): Promise<readonly LocalTransactionRecord[]> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "getTransactionsByIds",
      budgetId,
      accountId,
      transactionIds,
    });
  }

  getImportedTransactionSourceOccurrences(
    budgetId: string,
    accountId: string,
    fileType: "csv" | "qif" | "ofx" | "qfx",
  ): Promise<
    readonly {
      readonly identity: string;
      readonly occurrenceCount: number;
    }[]
  > {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "getImportedTransactionSourceOccurrences",
      budgetId,
      accountId,
      fileType,
    });
  }

  writeTransaction(
    transaction: LocalTransactionRecord,
    mutation: LocalBudgetMutation,
    resolveConflictId?: string,
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "writeTransaction",
      transaction,
      mutation,
      ...(resolveConflictId ? { resolveConflictId } : {}),
    });
  }

  writeTransactionBatch(
    writes: readonly {
      readonly transaction: LocalTransactionRecord;
      readonly mutation: LocalBudgetMutation;
      readonly resolveConflictId?: string;
    }[],
    options: {
      readonly requireAbsentTransactionIds?: readonly string[];
      readonly verifyWrittenTransactions?: boolean;
    } = {},
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "writeTransactionBatch",
      writes,
      ...(options.requireAbsentTransactionIds?.length
        ? {
            requireAbsentTransactionIds:
              options.requireAbsentTransactionIds,
          }
        : {}),
      ...(options.verifyWrittenTransactions
        ? { verifyWrittenTransactions: true }
        : {}),
    });
  }

  writeImportBatch(
    payeeWrites: readonly {
      readonly payee: LocalPayeeRecord;
      readonly mutation: LocalBudgetMutation;
    }[],
    writes: readonly {
      readonly transaction: LocalTransactionRecord;
      readonly mutation: LocalBudgetMutation;
      readonly resolveConflictId?: string;
    }[],
    options: {
      readonly requireAbsentTransactionIds?: readonly string[];
      readonly verifyWrittenTransactions?: boolean;
    } = {},
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "writeImportBatch",
      payeeWrites,
      writes,
      ...(options.requireAbsentTransactionIds?.length
        ? {
            requireAbsentTransactionIds:
              options.requireAbsentTransactionIds,
          }
        : {}),
      ...(options.verifyWrittenTransactions
        ? { verifyWrittenTransactions: true }
        : {}),
    });
  }

  writeImportBatchWithHistory(
    payeeWrites: readonly { readonly payee: LocalPayeeRecord; readonly mutation: LocalBudgetMutation }[],
    writes: readonly { readonly transaction: LocalTransactionRecord; readonly mutation: LocalBudgetMutation; readonly resolveConflictId?: string }[],
    options: {
      readonly requireAbsentTransactionIds?: readonly string[];
      readonly verifyWrittenTransactions?: boolean;
      readonly historyTransactionIds: readonly string[];
      readonly historyPayeeIds: readonly string[];
    },
  ): Promise<{ readonly before: ImportHistorySnapshot; readonly after: ImportHistorySnapshot }> {
    return this.#request({
      requestId: createRuntimeUuid(), type: "writeImportBatchWithHistory", payeeWrites, writes,
      requireAbsentTransactionIds: options.requireAbsentTransactionIds,
      verifyWrittenTransactions: options.verifyWrittenTransactions,
      historyTransactionIds: options.historyTransactionIds,
      historyPayeeIds: options.historyPayeeIds,
    });
  }

  deleteTransaction(
    transactionId: string,
    mutation: LocalBudgetMutation,
    resolveConflictId?: string,
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "deleteTransaction",
      transactionId,
      mutation,
      ...(resolveConflictId ? { resolveConflictId } : {}),
    });
  }

  deleteTransactionBatch(
    deletes: readonly {
      readonly transactionId: string;
      readonly mutation: LocalBudgetMutation;
      readonly resolveConflictId?: string;
    }[],
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "deleteTransactionBatch",
      deletes,
    });
  }

  writeTransactionAttachment(
    attachment: LocalTransactionAttachmentRecord,
    content: Uint8Array,
    mutation: LocalBudgetMutation,
    resolveConflictId?: string,
  ): Promise<LocalBudgetManifest> {
    const request: Extract<LocalBudgetWorkerRequest, { type: "writeTransactionAttachment" }> = {
      requestId: createRuntimeUuid(),
      type: "writeTransactionAttachment",
      attachment,
      content: Uint8Array.from(content),
      mutation,
      ...(resolveConflictId ? { resolveConflictId } : {}),
    };
    return this.#request(request, [request.content.buffer as ArrayBuffer]);
  }

  deleteTransactionAttachment(
    attachmentId: string,
    mutation: LocalBudgetMutation,
    resolveConflictId?: string,
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "deleteTransactionAttachment",
      attachmentId,
      mutation,
      ...(resolveConflictId ? { resolveConflictId } : {}),
    });
  }

  readTransactionAttachmentContent(
    budgetId: string,
    attachmentId: string,
  ): Promise<{
    readonly content: Uint8Array;
    readonly mimeType: string;
    readonly contentHash: string;
  } | null> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "readTransactionAttachmentContent",
      budgetId,
      attachmentId,
    });
  }

  mutate(
    mutation: LocalBudgetMutation,
    resolveConflictId?: string,
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "mutate",
      mutation,
      ...(resolveConflictId ? { resolveConflictId } : {}),
    });
  }

  mutateBatch(
    mutations: readonly LocalBudgetMutation[],
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "mutateBatch",
      mutations,
    });
  }

  readEntity<T>(domain: BudgetDomain, entityId: string): Promise<T | null> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "readEntity",
      domain,
      entityId,
    });
  }

  listEntities<T>(domain: BudgetDomain): Promise<readonly T[]> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "listEntities",
      domain,
    });
  }

  listAccountNavigation(budgetId: string): Promise<readonly {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly participation: string;
    readonly openingBalance: number;
    readonly currencyCode: string;
    readonly closedAt: string | null;
    readonly workingBalance: number;
    readonly transactionCount: number;
    readonly hasUncategorizedTransactions: boolean;
  }[]> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "listAccountNavigation",
      budgetId,
    });
  }

  listPayees(
    budgetId: string,
    archived: boolean,
  ): Promise<readonly import("./registerSchema").LocalPayeeRecord[]> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "listPayees",
      budgetId,
      archived,
    });
  }

  listPayeeDuplicateSuppressions(budgetId: string): Promise<readonly {
    readonly leftPayeeId: string; readonly rightPayeeId: string;
  }[]> {
    return this.#request({ requestId: createRuntimeUuid(), type: "listPayeeDuplicateSuppressions", budgetId });
  }

  keepPayeesSeparate(budgetId: string, pairs: readonly {
    readonly leftPayeeId: string; readonly rightPayeeId: string;
  }[]): Promise<void> {
    return this.#request({ requestId: createRuntimeUuid(), type: "keepPayeesSeparate", budgetId, pairs });
  }

  writePayee(
    payee: import("./registerSchema").LocalPayeeRecord,
    mutation: LocalBudgetMutation,
    resolveConflictId?: string,
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "writePayee",
      payee,
      mutation,
      ...(resolveConflictId ? { resolveConflictId } : {}),
    });
  }

  deleteUnusedPayee(
    budgetId: string,
    payeeId: string,
    mutation: LocalBudgetMutation,
  ): Promise<LocalBudgetManifest> {
    return this.#request({ requestId: createRuntimeUuid(), type: "deleteUnusedPayee", budgetId, payeeId, mutation });
  }

  writeAccount(
    account: import("./registerSchema").LocalAccountRecord,
    mutation: LocalBudgetMutation,
    resolveConflictId?: string,
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "writeAccount",
      account,
      mutation,
      ...(resolveConflictId ? { resolveConflictId } : {}),
    });
  }

  deleteAccount(
    budgetId: string,
    accountId: string,
    mutation: LocalBudgetMutation,
    resolveConflictId?: string,
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "deleteAccount",
      budgetId,
      accountId,
      mutation,
      ...(resolveConflictId ? { resolveConflictId } : {}),
    });
  }

  mergePayees(input: {
    readonly budgetId: string;
    readonly sourcePayeeId: string;
    readonly sourcePayeeIds?: readonly string[];
    readonly targetPayeeId: string;
    readonly targetPayeeName: string;
    readonly updateLinkedTransactions?: boolean;
    readonly updateScheduledTransactions?: boolean;
    readonly addMergedAliases?: boolean;
    readonly redirectRecognitionRules?: boolean;
    readonly mutation: LocalBudgetMutation;
    readonly resolveConflictId?: string;
  }): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "mergePayees",
      ...input,
    });
  }

  mergeCategories(input: {
    readonly budgetId: string;
    readonly sourceCategoryId: string;
    readonly targetCategoryId: string;
    readonly targetCategoryName: string;
    readonly mutation: LocalBudgetMutation;
    readonly resolveConflictId?: string;
  }): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "mergeCategories",
      ...input,
    });
  }

  readOutbox(afterSequence = 0, limit = 500): Promise<readonly {
    readonly sequence: number;
    readonly mutationId: string;
    readonly operationGroupId?: string | null;
    readonly operationGroupJson?: string | null;
    readonly deviceId: string;
    readonly deviceSequence: number;
    readonly baseCursor: number;
    readonly domain: BudgetDomain;
    readonly entityId: string;
    readonly operation: "upsert" | "delete";
    readonly payloadJson: string;
    readonly createdAt: string;
  }[]> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "readOutbox",
      afterSequence,
      limit,
    });
  }

  applyRemoteMutations(
    mutations: readonly {
      readonly cursor: number;
      readonly mutation: LocalBudgetMutation;
      readonly conflict?: LocalFirstMutationConflict;
    }[],
    throughCursor: number,
  ): Promise<LocalBudgetManifest> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "applyRemoteMutations",
      mutations,
      throughCursor,
    });
  }

  acknowledgeOutbox(throughSequence: number): Promise<void> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "acknowledgeOutbox",
      throughSequence,
    });
  }

  getSyncState(): Promise<LocalBudgetSyncState> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "getSyncState",
    });
  }

  setSyncState(
    baselineHash: string,
    pulledCursor: number,
  ): Promise<LocalBudgetSyncState> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "setSyncState",
      baselineHash,
      pulledCursor,
    });
  }

  listSyncConflicts(
    status: LocalFirstStoredConflict["status"] = "unresolved",
    limit = 100,
  ): Promise<readonly LocalFirstStoredConflict[]> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "listSyncConflicts",
      status,
      limit,
    });
  }

  resolveSyncConflict(
    conflictId: string,
    resolution: "keep-local" | "accept-remote",
  ): Promise<LocalFirstStoredConflict> {
    return this.#request({
      requestId: createRuntimeUuid(),
      type: "resolveSyncConflict",
      conflictId,
      resolution,
    });
  }

  async close(): Promise<void> {
    await this.#request({
      requestId: createRuntimeUuid(),
      type: "close",
    });
    this.#worker.terminate();
  }

  getCategoryGoal(budgetId: string, categoryId: string): Promise<import("../../../../../../packages/types/src/CategoryGoal").CategoryGoal | null> {
    return this.#request({ requestId: createRuntimeUuid(), type: "getCategoryGoal", budgetId, categoryId });
  }

  listCategoryGoals(budgetId: string): Promise<readonly import("../../../../../../packages/types/src/CategoryGoal").CategoryGoal[]> {
    return this.#request({ requestId: createRuntimeUuid(), type: "listCategoryGoals", budgetId });
  }

  writeCategoryGoal(mode: "create" | "update", goal: import("../../../../../../packages/types/src/CategoryGoal").CategoryGoal, mutation: LocalBudgetMutation): Promise<import("../../../../../../packages/types/src/CategoryGoal").CategoryGoal> {
    return this.#request({ requestId: createRuntimeUuid(), type: "writeCategoryGoal", mode, goal, mutation });
  }

  deleteCategoryGoal(budgetId: string, categoryId: string, mutation: LocalBudgetMutation): Promise<import("../../../../../../packages/types/src/CategoryGoal").CategoryGoal | null> {
    return this.#request({ requestId: createRuntimeUuid(), type: "deleteCategoryGoal", budgetId, categoryId, mutation });
  }

  replaceCategoryGoalHistoryState(input: {
    budgetId: string;
    categoryId: string;
    expected: import("../../../../../../packages/types/src/CategoryGoal").CategoryGoal | null;
    replacement: import("../../../../../../packages/types/src/CategoryGoal").CategoryGoal | null;
    mutation: LocalBudgetMutation;
  }): Promise<import("../../../../../../packages/types/src/CategoryGoal").CategoryGoal | null> {
    return this.#request({ requestId: createRuntimeUuid(), type: "replaceCategoryGoalHistoryState", ...input });
  }

  async deleteBudgetFile(): Promise<void> {
    const manifest = await this.getManifest();

    await this.#request({
      requestId: createRuntimeUuid(),
      type: "deleteBudgetFile",
    });

    const storage = this.#storage;
    if (storage) {
      const key = databaseFilePointerKey(manifest.budgetId);
      if (storage.removeItem) storage.removeItem(key);
      else storage.setItem(key, "");
    }
  }

  #request<T>(
    request: LocalBudgetWorkerRequest,
    transfer: Transferable[] = [],
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(request.requestId, {
        resolve: (result) => resolve(result as T),
        reject,
      });
      this.#worker.postMessage(request, transfer);
    });
  }
}
