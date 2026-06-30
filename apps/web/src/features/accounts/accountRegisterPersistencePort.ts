import type {
  AccountRegisterView,
  NewRegisterTransactionInput,
  RegisterTransactionView,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";

export type {
  AccountRegisterView,
  NewRegisterTransactionInput,
  RegisterTransactionView,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";

/**
 * Browser-safe account register persistence boundary for the web UI.
 *
 * UI code should depend on this port via AppPersistenceGateway instead of
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

  addAttachment(input: {
    accountId: string;
    transactionId: string;
    attachment: {
      fileName: string;
      fileSize: number;
      mimeType: string;
      contentDataUrl?: string;
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
