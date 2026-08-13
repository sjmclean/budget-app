export const LOCAL_BUDGET_SCHEMA_VERSION = 1;
export const LOCAL_FIRST_PROTOCOL_VERSION = 1;

export const REQUIRED_BUDGET_DOMAINS = [
  "accounts",
  "transactions",
  "payees",
  "categories",
  "budgetMonths",
  "scheduledTransactions",
  "transactionTags",
] as const;

export type BudgetDomain = (typeof REQUIRED_BUDGET_DOMAINS)[number];

export interface BudgetDomainCounts {
  readonly accounts: number;
  readonly transactions: number;
  readonly payees: number;
  readonly categories: number;
  readonly budgetMonths: number;
  readonly scheduledTransactions: number;
  readonly transactionTags: number;
}

export interface LocalBudgetManifest {
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly schemaVersion: number;
  readonly localRevision: number;
  readonly durable: boolean;
  readonly counts: BudgetDomainCounts;
}

export interface LocalBudgetSyncState {
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly baselineHash: string | null;
  readonly pulledCursor: number;
}

export interface LocalBudgetMutation {
  readonly mutationId: string;
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly deviceId: string;
  readonly deviceSequence: number;
  readonly baseCursor: number;
  readonly domain: BudgetDomain;
  readonly entityId: string;
  readonly operation: "upsert" | "delete";
  readonly payload: unknown;
  readonly createdAt: string;
}

export interface LocalFirstMutationConflict {
  readonly conflictId: string;
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly entityKey: string;
  readonly detectedAt: string;
  readonly losingMutation: LocalBudgetMutation;
  readonly winningMutation: LocalBudgetMutation;
  readonly winningCursor: number;
}

export interface LocalFirstStoredConflict extends LocalFirstMutationConflict {
  readonly status: "unresolved" | "resolved-local" | "resolved-remote";
  readonly resolvedAt: string | null;
}

import type {
  LocalRegisterImportBatch,
  LocalTransactionAttachmentRecord,
  LocalTransactionQuery,
  LocalTransactionRecord,
} from "./registerSchema";

export interface LocalImportEntity {
  readonly domain: BudgetDomain;
  readonly entityId: string;
  readonly payload: unknown;
}

export type LocalBudgetWorkerRequest =
  | {
      readonly requestId: string;
      readonly type: "open";
      readonly budgetId: string;
      readonly syncEpoch: string;
      readonly deviceId: string;
    }
  | {
      readonly requestId: string;
      readonly type: "manifest";
    }
  | {
      readonly requestId: string;
      readonly type: "prepareBaselineExport";
    }
  | {
      readonly requestId: string;
      readonly type: "readBaselineExportChunk";
      readonly offset: number;
      readonly length: number;
    }
  | {
      readonly requestId: string;
      readonly type: "finishBaselineExport";
    }
  | {
      readonly requestId: string;
      readonly type: "beginBaselineReplacement";
      readonly budgetId: string;
      readonly syncEpoch: string;
      readonly deviceId: string;
      readonly totalBytes: number;
    }
  | {
      readonly requestId: string;
      readonly type: "appendBaselineReplacement";
      readonly offset: number;
      readonly content: Uint8Array;
    }
  | {
      readonly requestId: string;
      readonly type: "commitBaselineReplacement";
    }
  | {
      readonly requestId: string;
      readonly type: "abortBaselineReplacement";
    }
  | {
      readonly requestId: string;
      readonly type: "importRegisterBatch";
      readonly batch: LocalRegisterImportBatch;
    }
  | {
      readonly requestId: string;
      readonly type: "beginStagedImport";
      readonly budgetId: string;
      readonly syncEpoch: string;
      readonly deviceId: string;
    }
  | {
      readonly requestId: string;
      readonly type: "importEntityBatch";
      readonly entities: readonly LocalImportEntity[];
    }
  | {
      readonly requestId: string;
      readonly type: "commitStagedImport";
      readonly expectedCounts: BudgetDomainCounts;
    }
  | {
      readonly requestId: string;
      readonly type: "rollbackStagedImport";
    }
  | {
      readonly requestId: string;
      readonly type: "queryTransactions";
      readonly query: LocalTransactionQuery;
    }
  | {
      readonly requestId: string;
      readonly type: "getTransaction";
      readonly budgetId: string;
      readonly transactionId: string;
    }
  | {
      readonly requestId: string;
      readonly type: "getTransactionsByIds";
      readonly budgetId: string;
      readonly accountId: string;
      readonly transactionIds: readonly string[];
    }
  | {
      readonly requestId: string;
      readonly type: "getAccountSummary";
      readonly budgetId: string;
      readonly accountId: string;
    }
  | {
      readonly requestId: string;
      readonly type: "getFinancialOverview";
      readonly budgetId: string;
      readonly month: string;
    }
  | {
      readonly requestId: string;
      readonly type: "getMonthlySpending";
      readonly budgetId: string;
      readonly month: string;
    }
  | {
      readonly requestId: string;
      readonly type: "getMonthlyCategoryTransactions";
      readonly budgetId: string;
      readonly month: string;
      readonly categoryId: string;
    }
  | {
      readonly requestId: string;
      readonly type: "getCategoryActivityDrilldown";
      readonly budgetId: string;
      readonly month: string;
      readonly categoryId: string;
    }
  | {
      readonly requestId: string;
      readonly type: "getBudgetProjectionDiagnostic";
      readonly budgetId: string;
      readonly month: string;
    }
  | {
      readonly requestId: string;
      readonly type: "writeTransaction";
      readonly transaction: LocalTransactionRecord;
      readonly mutation: LocalBudgetMutation;
    }
  | {
      readonly requestId: string;
      readonly type: "writeTransactionBatch";
      readonly writes: readonly {
        readonly transaction: LocalTransactionRecord;
        readonly mutation: LocalBudgetMutation;
      }[];
    }
  | {
      readonly requestId: string;
      readonly type: "deleteTransaction";
      readonly transactionId: string;
      readonly mutation: LocalBudgetMutation;
    }
  | {
      readonly requestId: string;
      readonly type: "deleteTransactionBatch";
      readonly deletes: readonly {
        readonly transactionId: string;
        readonly mutation: LocalBudgetMutation;
      }[];
    }
  | {
      readonly requestId: string;
      readonly type: "writeTransactionAttachment";
      readonly attachment: LocalTransactionAttachmentRecord;
      readonly content: Uint8Array;
      readonly mutation: LocalBudgetMutation;
    }
  | {
      readonly requestId: string;
      readonly type: "deleteTransactionAttachment";
      readonly attachmentId: string;
      readonly mutation: LocalBudgetMutation;
    }
  | {
      readonly requestId: string;
      readonly type: "readTransactionAttachmentContent";
      readonly budgetId: string;
      readonly attachmentId: string;
    }
  | {
      readonly requestId: string;
      readonly type: "mutate";
      readonly mutation: LocalBudgetMutation;
    }
  | {
      readonly requestId: string;
      readonly type: "mutateBatch";
      readonly mutations: readonly LocalBudgetMutation[];
    }
  | {
      readonly requestId: string;
      readonly type: "readEntity";
      readonly domain: BudgetDomain;
      readonly entityId: string;
    }
  | {
      readonly requestId: string;
      readonly type: "listEntities";
      readonly domain: BudgetDomain;
    }
  | {
      readonly requestId: string;
      readonly type: "listAccountNavigation";
      readonly budgetId: string;
    }
  | {
      readonly requestId: string;
      readonly type: "listPayees";
      readonly budgetId: string;
      readonly archived: boolean;
    }
  | {
      readonly requestId: string;
      readonly type: "listPayeeDuplicateSuppressions";
      readonly budgetId: string;
    }
  | {
      readonly requestId: string;
      readonly type: "keepPayeesSeparate";
      readonly budgetId: string;
      readonly pairs: readonly { readonly leftPayeeId: string; readonly rightPayeeId: string }[];
    }
  | {
      readonly requestId: string;
      readonly type: "writePayee";
      readonly payee: import("./registerSchema").LocalPayeeRecord;
      readonly mutation: LocalBudgetMutation;
    }
  | {
      readonly requestId: string;
      readonly type: "deleteUnusedPayee";
      readonly budgetId: string;
      readonly payeeId: string;
      readonly mutation: LocalBudgetMutation;
    }
  | {
      readonly requestId: string;
      readonly type: "writeAccount";
      readonly account: import("./registerSchema").LocalAccountRecord;
      readonly mutation: LocalBudgetMutation;
    }
  | {
      readonly requestId: string;
      readonly type: "deleteAccount";
      readonly budgetId: string;
      readonly accountId: string;
      readonly mutation: LocalBudgetMutation;
    }
  | {
      readonly requestId: string;
      readonly type: "mergePayees";
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
    }
  | {
      readonly requestId: string;
      readonly type: "mergeCategories";
      readonly budgetId: string;
      readonly sourceCategoryId: string;
      readonly targetCategoryId: string;
      readonly targetCategoryName: string;
      readonly mutation: LocalBudgetMutation;
    }
  | {
      readonly requestId: string;
      readonly type: "readOutbox";
      readonly afterSequence: number;
      readonly limit: number;
    }
  | {
      readonly requestId: string;
      readonly type: "acknowledgeOutbox";
      readonly throughSequence: number;
    }
  | {
      readonly requestId: string;
      readonly type: "applyRemoteMutations";
      readonly mutations: readonly {
        readonly cursor: number;
        readonly mutation: LocalBudgetMutation;
        readonly conflict?: LocalFirstMutationConflict;
      }[];
      readonly throughCursor: number;
    }
  | {
      readonly requestId: string;
      readonly type: "getSyncState";
    }
  | {
      readonly requestId: string;
      readonly type: "setSyncState";
      readonly baselineHash: string;
      readonly pulledCursor: number;
    }
  | {
      readonly requestId: string;
      readonly type: "listSyncConflicts";
      readonly status?: LocalFirstStoredConflict["status"];
      readonly limit: number;
    }
  | {
      readonly requestId: string;
      readonly type: "resolveSyncConflict";
      readonly conflictId: string;
      readonly resolution: "keep-local" | "accept-remote";
    }
  | {
      readonly requestId: string;
      readonly type: "close";
    }
  | {
      readonly requestId: string;
      readonly type: "deleteBudgetFile";
    };

export type LocalBudgetWorkerResponse =
  | {
      readonly requestId: string;
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly requestId: string;
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

export function emptyDomainCounts(): BudgetDomainCounts {
  return {
    accounts: 0,
    transactions: 0,
    payees: 0,
    categories: 0,
    budgetMonths: 0,
    scheduledTransactions: 0,
    transactionTags: 0,
  };
}

export function assertCompleteManifest(manifest: LocalBudgetManifest): void {
  if (!manifest.budgetId || !manifest.syncEpoch) {
    throw new Error("A local budget manifest requires a budget ID and sync epoch.");
  }
  if (manifest.schemaVersion !== LOCAL_BUDGET_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported local budget schema ${manifest.schemaVersion}; expected ${LOCAL_BUDGET_SCHEMA_VERSION}.`,
    );
  }
  for (const domain of REQUIRED_BUDGET_DOMAINS) {
    const count = manifest.counts[domain];
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Manifest count for ${domain} must be a non-negative integer.`);
    }
  }
}
