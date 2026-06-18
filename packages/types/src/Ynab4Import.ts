export type Ynab4ImportSeverity = "info" | "warning" | "error";

export interface Ynab4ImportIssue {
  severity: Ynab4ImportSeverity;
  code: string;
  message: string;
  source?: string;
  rowNumber?: number;
}

export interface Ynab4ImportSummary {
  accounts: number;
  categoryGroups: number;
  categories: number;
  payees: number;
  transactions: number;
  splitTransactions: number;
  transfers: number;
  scheduledTransactions: number;
  budgetMonths: number;
  issues: Ynab4ImportIssue[];
  notes: string[];
}

export interface Ynab4ImportPreview {
  summary: Ynab4ImportSummary;
  accounts: Ynab4AccountPreview[];
  categoryGroups: Ynab4CategoryGroupPreview[];
  categories: Ynab4CategoryPreview[];
  payees: Ynab4PayeePreview[];
  transactions: Ynab4TransactionPreview[];
  budgetMonths: Ynab4BudgetMonthPreview[];
}

export interface Ynab4AccountPreview {
  name: string;
  type: string | null;
  onBudget: boolean | null;
  balance: number | null;
  closed: boolean;
}

export interface Ynab4CategoryGroupPreview {
  name: string;
}

export interface Ynab4CategoryPreview {
  groupName: string | null;
  name: string;
  fullName: string;
}

export interface Ynab4PayeePreview {
  name: string;
}

export interface Ynab4TransactionPreview {
  rowNumber: number;
  accountName: string | null;
  date: string;
  payee: string;
  category: string | null;
  memo: string | null;
  amount: number;
  cleared: "cleared" | "reconciled" | "uncleared";
  flag: string | null;
  isTransfer: boolean;
  transferAccountName: string | null;
  isSplit: boolean;
}

export interface Ynab4BudgetMonthPreview {
  month: string;
  category: string;
  budgeted: number;
  outflows: number;
  balance: number;
}
