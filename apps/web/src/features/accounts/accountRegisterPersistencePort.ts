import type {
  AccountRegisterView,
  NewRegisterTransactionInput,
  RegisterTransactionView,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";

export class RegisterTransactionBatchCommitError extends Error {
  constructor(
    message: string,
    readonly rollbackAttempted: boolean,
    readonly rollbackSucceeded: boolean,
    readonly causeValue: unknown,
  ) {
    super(message);
    this.name = "RegisterTransactionBatchCommitError";
  }
}

export interface RegisterTransactionBatchChangeSet {
  readonly accountId: string;
  readonly addedTransactionIds: readonly string[];
  readonly beforeUpdatedTransactions: readonly RegisterTransactionView[];
  readonly afterUpdatedTransactions: readonly RegisterTransactionView[];
}

export interface RegisterTransactionBatchCommitResult {
  readonly register: AccountRegisterView;
  readonly changeSet: RegisterTransactionBatchChangeSet;
  readonly rollbackMode: "storage-snapshot" | "adapter-transaction" | "unsupported";
}

export type {
  AccountRegisterView,
  NewRegisterTransactionInput,
  RegisterTransactionView,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";

/**
 * Browser-safe account register persistence boundary for the web UI.
 *
 * UI code should depend on this port via BudgetPersistenceProvider instead of
 * importing the concrete browser localStorage register service directly. This
 * keeps current behaviour in place while a future SQLite/Tauri adapter
 * implements the same contract.
 */
export interface AccountRegisterPersistencePort {
  getAccountRegisterView(input: {
    accountId: string;
  }): Promise<AccountRegisterView>;

  addTransaction(input: {
    accountId: string;
    transaction: NewRegisterTransactionInput;
  }): Promise<AccountRegisterView>;

  addTransactions(input: {
    accountId: string;
    transactions: NewRegisterTransactionInput[];
  }): Promise<AccountRegisterView>;

  /**
   * Applies an importer/register change set as one logical operation.
   * Implementations should either commit every register mutation or restore the
   * pre-operation state before rejecting. The returned change set is the future
   * command-history/Undo boundary; it is not yet exposed as user-facing Undo.
   */
  commitTransactionBatch?(input: {
    accountId: string;
    additions: NewRegisterTransactionInput[];
    updates: UpdateRegisterTransactionInput[];
  }): Promise<RegisterTransactionBatchCommitResult>;

  updateTransaction(input: {
    accountId: string;
    transaction: UpdateRegisterTransactionInput;
  }): Promise<AccountRegisterView>;

  toggleCleared(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView>;

  deleteTransaction(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView>;

  moveTransactions(input: {
    sourceAccountId: string;
    targetAccountId: string;
    transactionIds: string[];
  }): Promise<AccountRegisterView>;

  addAttachment(input: {
    accountId: string;
    transactionId: string;
    attachment: {
      fileName: string;
      fileSize: number;
      id?: string;
      mimeType: string;
      contentDataUrl?: string;
      contentRef?: string;
      contentHash?: string;
      storageType?: "inline-data-url" | "browser-indexeddb" | "external-file";
    };
  }): Promise<AccountRegisterView>;

  removeAttachment(input: {
    accountId: string;
    transactionId: string;
    attachmentId: string;
  }): Promise<AccountRegisterView>;

  renamePayeeReferences(input: {
    accountId: string;
    payeeId: string;
    previousName: string;
    nextName: string;
  }): Promise<AccountRegisterView>;

  reassignPayeeReferences(input: {
    accountId: string;
    sourcePayeeId: string;
    sourceName: string;
    targetPayeeId: string;
    targetName: string;
  }): Promise<AccountRegisterView>;
}
