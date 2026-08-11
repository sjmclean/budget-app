/**
 * Bounded, transport-neutral read boundary for large account registers.
 *
 * The web application may implement this port through a Web Worker, HTTP, or a
 * desktop host bridge. It deliberately exposes neither SQLite nor YNAB4 types.
 */
export interface AccountTransactionCursor {
  readonly date: string;
  readonly id: string;
}

export interface AccountTransactionQuery {
  readonly budgetId: string;
  readonly accountId: string;
  readonly limit: number;
  readonly before?: AccountTransactionCursor;
  readonly offset?: number;
  readonly search?: {
    readonly query: string;
    readonly scope: "all" | "payee" | "category" | "memo" | "amount";
  };
  readonly categoryFilter?: "all" | "uncategorised";
  readonly sort?: {
    readonly column: "date" | "payee" | "category" | "memo" | "outflow" | "inflow";
    readonly direction: "ascending" | "descending";
  };
}

export interface AccountTransactionRow {
  readonly id: string;
  readonly date: string;
  readonly amount: number;
  readonly memo: string | null;
  readonly checkNumber: string | null;
  readonly clearedStatus: string;
  readonly payeeId: string | null;
  readonly payeeName: string | null;
  /** Immutable bank/import description retained separately from canonical payee. */
  readonly rawPayeeName?: string | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly transferAccountId: string | null;
  readonly transferTransactionId: string | null;
  readonly generatedFromSchedule?: boolean;
  readonly scheduledTransactionId?: string | null;
  readonly scheduledOccurrenceDate?: string | null;
  readonly tagIds?: readonly string[];
  readonly splitLines: readonly AccountTransactionSplitRow[];
  readonly attachmentCount?: number;
  readonly attachments?: readonly AccountTransactionAttachmentRow[];
}

export interface AccountTransactionAttachmentRow {
  readonly id: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly mimeType: string;
  readonly attachedAt: string;
  readonly contentHash: string;
  readonly contentRef: string;
  readonly storageType: "local-sqlite";
}

export interface AccountTransactionSplitRow {
  readonly id: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly transferAccountId: string | null;
  readonly transferTransactionId: string | null;
  readonly memo: string | null;
  readonly amount: number;
}

export interface AccountTransactionPage {
  readonly rows: readonly AccountTransactionRow[];
  readonly nextCursor: AccountTransactionCursor | null;
  readonly hasMore: boolean;
  readonly totalCount?: number;
}

export interface AccountRegisterSummary {
  readonly budgetId: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly accountType: string;
  readonly participation: string;
  readonly currencyCode: string;
  readonly openingBalance: number;
  readonly clearedBalance: number;
  readonly unclearedBalance: number;
  readonly workingBalance: number;
  readonly transactionCount: number;
}

export interface AccountRegisterQueryPort {
  getAccountSummary(input: {
    readonly budgetId: string;
    readonly accountId: string;
  }): Promise<AccountRegisterSummary>;

  queryTransactions(input: AccountTransactionQuery): Promise<AccountTransactionPage>;

  /** Authoritative point lookup used for persistence verification. */
  getTransactionsByIds?(input: {
    readonly budgetId: string;
    readonly accountId: string;
    readonly ids: readonly string[];
  }): Promise<readonly AccountTransactionRow[]>;
}

export const ACCOUNT_TRANSACTION_DEFAULT_LIMIT = 150;
export const ACCOUNT_TRANSACTION_MAX_LIMIT = 250;
