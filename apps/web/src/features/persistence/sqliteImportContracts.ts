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
  readonly archived?: boolean;
  readonly defaultCategoryId?: string;
  readonly defaultCategoryName?: string;
  readonly importRules?: readonly {
    readonly id: string;
    readonly matchType: "equals" | "contains" | "startsWith" | "endsWith";
    readonly text: string;
    readonly defaultCategoryId?: string;
    readonly defaultCategoryName?: string;
    readonly priority?: number;
    readonly enabled?: boolean;
  }[];
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
  readonly rawPayeeName: string | null;
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
  import("../accounts/scheduledTransactionTypes").ScheduledTransactionView;

export interface SqliteImportSession {
  readonly generationId: string;

  persistReferenceData(
    input: {
      readonly accounts: readonly SqliteImportAccount[];
      readonly payees: readonly SqliteImportPayee[];
      readonly categories: readonly SqliteImportCategory[];
    },
    options?: { readonly signal?: AbortSignal },
  ): Promise<void>;

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
    rows: readonly {
      readonly id: string;
      readonly payload: unknown;
    }[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<void>;

  validate(
    options?: { readonly signal?: AbortSignal },
  ): Promise<{
    readonly valid: true;
    readonly counts: {
      readonly accounts: number;
      readonly transactions: number;
      readonly scheduledTransactions: number;
    };
    /** Source-description fidelity, independent of financial/count fidelity. */
    readonly importedPayeeProvenance?: {
      readonly sourceTransactionsWithImportedPayee: number;
      readonly preservedRawPayees: number;
      readonly mismatches: readonly string[];
    };
  }>;

  commit(
    options?: { readonly signal?: AbortSignal },
  ): Promise<{
    readonly budgetId: string;
    readonly generationId: string;
    readonly state: "active";
  }>;

  cancel(): Promise<void>;
}
