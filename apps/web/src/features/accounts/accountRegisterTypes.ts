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

export interface AccountRegisterService {
  getAccountRegisterView(input: {
    accountId: string;
  }): Promise<AccountRegisterView>;
}
