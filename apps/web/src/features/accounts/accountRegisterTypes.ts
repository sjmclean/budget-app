export interface RegisterSplitLineView {
  id: string;
  category: string;
  categoryId?: string;
  memo?: string;
  inflow: number;
  outflow: number;
  transferId?: string;
  transferAccountId?: string;
  transferTransactionId?: string;
}

export interface RegisterAttachmentView {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  attachedAt: string;
  /**
   * Browser prototype storage payload.
   *
   * The current web runtime stores attachment content inline with the
   * register view so attachments survive reloads/backups while the
   * desktop/package-backed attachment file store is wired into the UI.
   */
  contentDataUrl?: string;
  contentRef?: string;
  contentHash?: string;
  storageType?: "inline-data-url" | "browser-indexeddb" | "external-file";
}

export interface RegisterTransactionView {
  id: string;
  date: string;
  tagIds?: string[];
  attachmentCount: number;
  attachments?: RegisterAttachmentView[];
  payee: string;
  payeeId?: string;
  category: string;
  categoryId?: string;
  memo?: string;
  checkNumber?: string;
  inflow: number;
  outflow: number;
  runningBalance: number;
  cleared: boolean;
  reconciled: boolean;
  transferId?: string;
  transferAccountId?: string;
  transferTransactionId?: string;
  splitLines?: RegisterSplitLineView[];
  generatedFromSchedule?: boolean;
  scheduledTransactionId?: string;
  scheduledOccurrenceDate?: string;
}

export interface AccountRegisterView {
  accountId: string;
  accountName: string;
  accountType: "On budget" | "Credit card" | "Tracking";
  currencyCode: string;
  clearedBalance: number;
  unclearedBalance: number;
  workingBalance: number;
  transactions: RegisterTransactionView[];
}

export interface NewRegisterTransactionInput {
  date: string;
  tagIds?: string[];
  payee: string;
  payeeId?: string;
  category: string;
  categoryId?: string;
  memo?: string;
  checkNumber?: string;
  inflow: number;
  outflow: number;
  splitLines?: RegisterSplitLineView[];
  generatedFromSchedule?: boolean;
  scheduledTransactionId?: string;
  scheduledOccurrenceDate?: string;
}

export interface UpdateRegisterTransactionInput {
  id: string;
  date: string;
  tagIds?: string[];
  payee: string;
  payeeId?: string;
  category: string;
  categoryId?: string;
  memo?: string;
  checkNumber?: string;
  inflow: number;
  outflow: number;
  splitLines?: RegisterSplitLineView[];
}

export interface AccountRegisterService {
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

  commitTransactionBatch?(input: {
    accountId: string;
    additions: NewRegisterTransactionInput[];
    updates: UpdateRegisterTransactionInput[];
  }): Promise<{
    register: AccountRegisterView;
    changeSet: {
      accountId: string;
      addedTransactionIds: readonly string[];
      beforeUpdatedTransactions: readonly RegisterTransactionView[];
      afterUpdatedTransactions: readonly RegisterTransactionView[];
    };
    rollbackMode: "storage-snapshot" | "adapter-transaction" | "unsupported";
  }>;

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
