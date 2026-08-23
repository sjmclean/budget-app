import type {
  AccountRegisterQueryPort,
  AccountRegisterSummary,
  AccountTransactionPage,
  AccountTransactionQuery,
} from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import type {
  CreateAccountInput,
  DeleteAccountResult,
  SidebarAccount,
  UpdateAccountInput,
} from "../accounts/accountService";
import type {
  MergePayeesInput,
  PayeeView,
  UpdatePayeeInput,
} from "../accounts/payeeService";
import type {
  BudgetActivityDrilldown,
  BudgetCategoryOption,
  BudgetMonthView,
  CategoryMergePreview,
} from "../budget/budgetViewTypes";
import type {
  RegisterAttachmentView,
  RegisterTransactionView,
} from "../accounts/accountRegisterTypes";
import type { TransactionTagDefinition } from "../tags/transactionTagTypes";
import type {
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "../accounts/scheduledTransactionTypes";
import type { TransactionHistorySnapshot } from "./localFirst/registerSchema";

export interface BudgetEngineStatus {
  readonly budgetId: string;
  readonly generationId: string | null;
  readonly state: "legacy" | "staging" | "active" | "retired";
  readonly activatedAt: number | null;
  readonly capabilities: {
    readonly accountRegisters: boolean;
    readonly budgetMonths: boolean;
    readonly analytics: boolean;
    readonly scheduledTransactions?: boolean;
  };
}

export interface AccountRegisterQueryClient extends AccountRegisterQueryPort {
  /** Releases this tab's OPFS worker before an exclusive import/restore operation. */
  releaseLocalDatabase?(): Promise<void>;

  getBudgetStatus(budgetId: string): Promise<BudgetEngineStatus>;

  getImportedTransactionSourceOccurrences(input: {
    readonly budgetId: string;
    readonly accountId: string;
    readonly fileType: "csv" | "qif" | "ofx" | "qfx";
  }): Promise<readonly ImportedTransactionSourceOccurrence[]>;

  getAccountRegisterBootstrap(
    input: AccountTransactionQuery,
  ): Promise<AccountRegisterBootstrap>;

  prefetchAccountRegister(input: AccountTransactionQuery): void;

  listAccounts(
    budgetId: string,
  ): Promise<readonly SidebarAccount[]>;

  listAccountNavigation(
    budgetId: string,
  ): Promise<readonly AccountNavigation[]>;

  setAccountClosed(input: {
    readonly budgetId: string;
    readonly accountId: string;
    readonly closed: boolean;
  }): Promise<void>;

  getBudgetMonthView(input: {
    readonly budgetId: string;
    readonly month: string;
  }): Promise<BudgetMonthView>;

  prefetchBudgetMonthView(input: {
    readonly budgetId: string;
    readonly month: string;
  }): void;

  setCategoryAssignedValues(input: {
    readonly budgetId: string;
    readonly month: string;
    readonly assignments: readonly {
      readonly categoryId: string;
      readonly assigned: number;
    }[];
  }): Promise<BudgetMonthView>;

  getBudgetCategoryOptions(input: {
    readonly budgetId: string;
    readonly month: string;
  }): Promise<readonly BudgetCategoryOption[]>;

  getFinancialOverview(
    budgetId: string,
    month: string,
  ): Promise<FinancialOverview>;

  getMonthlySpending(
    budgetId: string,
    month: string,
  ): Promise<readonly SpendingCategoryRow[]>;

  getMonthlyCategoryTransactions(
    budgetId: string,
    month: string,
    categoryId: string,
  ): Promise<readonly RegisterTransactionView[]>;

  getCategoryActivityDrilldown(input: {
    readonly budgetId: string;
    readonly month: string;
    readonly categoryId: string;
  }): Promise<BudgetActivityDrilldown>;

  addTransaction(
    input: TransactionWriteInput & { readonly id: string },
  ): Promise<void>;

  commitTransactionBatch(input: {
    readonly budgetId: string;
    readonly accountId: string;
    readonly additions: readonly (
      TransactionWriteInput & { readonly id: string }
    )[];
    readonly updates: readonly (
      TransactionWriteInput & { readonly id: string }
    )[];
    readonly provenanceAssignments: readonly RegisterTransactionImportProvenanceAssignment[];
  }): Promise<void>;

  commitImportBatch(input: {
    readonly budgetId: string;
    readonly accountId: string;
    readonly additions: readonly (
      TransactionWriteInput & { readonly id: string }
    )[];
    readonly updates: readonly (
      TransactionWriteInput & { readonly id: string }
    )[];
    readonly provenanceAssignments: readonly RegisterTransactionImportProvenanceAssignment[];
    readonly payeeCreations: readonly RegisterTransactionImportPayeeCreation[];
  }): Promise<void>;

  moveTransactions(input: {
    readonly budgetId: string;
    readonly sourceAccountId: string;
    readonly targetAccountId: string;
    readonly transactionIds: readonly string[];
  }): Promise<void>;

  updateTransaction(
    transactionId: string,
    input: TransactionWriteInput,
  ): Promise<void>;

  toggleTransactionCleared(
    transactionId: string,
    input: TransactionTarget,
  ): Promise<void>;

  setTransactionsCleared(input: {
    readonly budgetId: string;
    readonly transactionIds: readonly string[];
    readonly cleared: boolean;
  }): Promise<void>;

  deleteTransaction(
    transactionId: string,
    input: TransactionTarget,
  ): Promise<void>;

  captureTransactionHistorySnapshots(input: {
    readonly budgetId: string;
    readonly transactionIds: readonly string[];
  }): Promise<TransactionHistorySnapshot>;

  restoreTransactionHistorySnapshot(
    snapshot: TransactionHistorySnapshot,
  ): Promise<void>;

  deleteTransactionHistorySnapshot(
    snapshot: TransactionHistorySnapshot,
  ): Promise<void>;

  replaceTransactionHistorySnapshot(input: {
    readonly expected: TransactionHistorySnapshot;
    readonly replacement: TransactionHistorySnapshot;
  }): Promise<void>;

  addTransactionAttachment(input: TransactionTarget & {
    readonly transactionId: string;
    readonly attachment: Omit<
      RegisterAttachmentView,
      "contentDataUrl" | "contentRef" | "storageType"
    >;
    readonly content: Uint8Array;
  }): Promise<void>;

  removeTransactionAttachment(input: TransactionTarget & {
    readonly transactionId: string;
    readonly attachmentId: string;
  }): Promise<void>;

  readTransactionAttachment(input: {
    readonly budgetId: string;
    readonly attachmentId: string;
  }): Promise<Blob | null>;

  getBudgetExportUrl(
    budgetId: string,
    kind: "backup" | "export",
  ): string;

  exportBudget?(
    budgetId: string,
    kind: "backup" | "export",
  ): Promise<Blob>;

  restoreBudget(
    budgetId: string,
    file: Blob,
  ): Promise<BudgetRestoreResult>;

  resetBudget(
    budgetId: string,
    month: string,
  ): Promise<void>;

  deleteBudget(
    budgetId: string,
  ): Promise<void>;

  createAccount(
    budgetId: string,
    input: CreateAccountInput,
  ): Promise<readonly SidebarAccount[]>;

  updateAccount(
    budgetId: string,
    input: UpdateAccountInput,
  ): Promise<readonly SidebarAccount[]>;

  deleteAccount(
    budgetId: string,
    accountId: string,
  ): Promise<DeleteAccountResult>;

  listPayees(
    budgetId: string,
    archived?: boolean,
  ): Promise<readonly PayeeView[]>;

  listPayeeDuplicateSuppressions?(
    budgetId: string,
  ): Promise<
    readonly {
      readonly leftPayeeId: string;
      readonly rightPayeeId: string;
    }[]
  >;

  keepPayeesSeparate?(
    budgetId: string,
    pairs: readonly {
      readonly leftPayeeId: string;
      readonly rightPayeeId: string;
    }[],
  ): Promise<void>;

  createPayee(
    budgetId: string,
    name: string,
  ): Promise<readonly PayeeView[]>;

  updatePayee(
    budgetId: string,
    input:
      & Pick<UpdatePayeeInput, "id">
      & Partial<Omit<UpdatePayeeInput, "id">>,
  ): Promise<readonly PayeeView[]>;

  setPayeeArchived(
    budgetId: string,
    payeeId: string,
    archived: boolean,
  ): Promise<readonly PayeeView[]>;

  deleteUnusedPayee?(
    budgetId: string,
    payeeId: string,
  ): Promise<readonly PayeeView[]>;

  mergePayees(
    budgetId: string,
    input: MergePayeesInput,
  ): Promise<readonly PayeeView[]>;

  listTransactionTags(
    budgetId: string,
  ): Promise<readonly TransactionTagDefinition[]>;

  replaceTransactionTags(
    budgetId: string,
    tags: readonly TransactionTagDefinition[],
  ): Promise<readonly TransactionTagDefinition[]>;

  listScheduledTransactions(
    budgetId: string,
    accountId: string,
  ): Promise<readonly ScheduledTransactionView[]>;

  createScheduledTransaction(
    budgetId: string,
    input: UpsertScheduledTransactionInput,
  ): Promise<readonly ScheduledTransactionView[]>;

  updateScheduledTransaction(
    budgetId: string,
    scheduleId: string,
    input: UpsertScheduledTransactionInput,
  ): Promise<readonly ScheduledTransactionView[]>;

  deleteScheduledTransaction(
    budgetId: string,
    accountId: string,
    scheduleId: string,
  ): Promise<readonly ScheduledTransactionView[]>;

  advanceScheduledTransaction(
    budgetId: string,
    accountId: string,
    scheduleId: string,
  ): Promise<readonly ScheduledTransactionView[]>;

  renameScheduledPayeeReferences(
    budgetId: string,
    input: {
      readonly payeeId: string;
      readonly previousName: string;
      readonly nextName: string;
    },
  ): Promise<void>;

  reassignScheduledPayeeReferences(
    budgetId: string,
    input: {
      readonly sourcePayeeId: string;
      readonly sourceName: string;
      readonly targetPayeeId: string;
      readonly targetName: string;
    },
  ): Promise<void>;

  mutateCategory(
    budgetId: string,
    input: CategoryMutation,
  ): Promise<BudgetMonthView>;

  getCategoryMergePreview(input: {
    readonly budgetId: string;
    readonly month: string;
    readonly sourceCategoryId: string;
    readonly targetCategoryId: string;
  }): Promise<CategoryMergePreview>;
}

export interface CategoryMutation {
  readonly operation: string;
  readonly month: string;
  readonly [key: string]: unknown;
}

export interface BudgetRestoreResult {
  readonly restored: boolean;
  readonly counts: {
    readonly accounts: number;
    readonly payees: number;
    readonly categories: number;
    readonly transactions: number;
    readonly budgetMonths: number;
    readonly transactionTags: number;
    readonly transactionTagAssignments: number;
    readonly scheduledTransactions: number;
  };
}

export interface FinancialOverview {
  readonly month: string;
  readonly monthLabel: string;
  readonly netWorth: number;
  readonly netWorthChangeThisMonth: number;
  readonly netWorthChangePeriod: number;
  readonly netWorthTrend: readonly {
    readonly month: string;
    readonly label: string;
    readonly value: number;
  }[];
  readonly monthlySnapshot: {
    readonly income: number;
    readonly expenses: number;
    readonly savings: number;
    readonly readyToAssign: number;
  };
  readonly attention: {
    readonly overspentCategories: number;
    readonly uncategorisedTransactions: number;
    readonly uncategorisedAccountId?: string;
  };
}

export interface SpendingCategoryRow {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly groupName: string;
  readonly total: number;
  readonly transactionCount: number;
  readonly transactions: readonly RegisterTransactionView[];
}

export interface AccountNavigation {
  readonly account: SidebarAccount;
  readonly currencyCode: string;
  readonly workingBalance: number;
  readonly hasUncategorizedTransactions: boolean;
  readonly transactionCount: number;
}

export interface AccountRegisterBootstrap {
  readonly summary: AccountRegisterSummary;
  readonly page: AccountTransactionPage;
}

export interface TransactionTarget {
  readonly budgetId: string;
  readonly accountId: string;
}

export interface RegisterTransactionImportPayeeCreation {
  readonly id: string;
  readonly name: string;
}

export interface RegisterTransactionImportProvenanceAssignment {
  readonly transactionId: string;
  readonly fileType: "csv" | "qif" | "ofx" | "qfx";
  readonly identity: string;
  readonly occurrence: number;
  readonly importedAt: string;
}

export interface ImportedTransactionSourceOccurrence {
  readonly identity: string;
  readonly occurrenceCount: number;
}

export interface TransactionWriteInput extends TransactionTarget {
  readonly date: string;
  readonly amount: number;
  readonly payeeId?: string;
  readonly rawPayee?: string;
  readonly categoryId?: string;
  readonly categoryName?: string;
  readonly memo?: string;
  readonly checkNumber?: string;
  readonly payeeName?: string;
  readonly transferAccountId?: string;
  readonly splitLines?: readonly TransactionSplitWriteInput[];
  readonly tagIds?: readonly string[];
  readonly generatedFromSchedule?: boolean;
  readonly scheduledTransactionId?: string;
  readonly scheduledOccurrenceDate?: string;
}

export interface TransactionSplitWriteInput {
  readonly id: string;
  readonly categoryId?: string;
  readonly categoryName?: string;
  readonly transferAccountId?: string;
  readonly transferTransactionId?: string;
  readonly memo?: string;
  readonly amount: number;
}
