export type TransactionFlag =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | null;

export interface RegisterTransactionView {
  id: string;
  date: string;
  flag: TransactionFlag;
  attachmentCount: number;
  payee: string;
  category: string;
  memo?: string;
  inflow: number;
  outflow: number;
  runningBalance: number;
  cleared: boolean;
  reconciled: boolean;
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
  payee: string;
  category: string;
  memo?: string;
  inflow: number;
  outflow: number;
}

export interface UpdateRegisterTransactionInput {
  id: string;
  date: string;
  payee: string;
  category: string;
  memo?: string;
  inflow: number;
  outflow: number;
}

export interface AccountRegisterService {
  getAccountRegisterView(input: {
    accountId: string;
  }): Promise<AccountRegisterView>;

  addTransaction(input: {
    accountId: string;
    transaction: NewRegisterTransactionInput;
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

  addAttachmentPlaceholder(input: {
    accountId: string;
    transactionId: string;
  }): Promise<AccountRegisterView>;
}
