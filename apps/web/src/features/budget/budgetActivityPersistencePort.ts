import type { SidebarAccountType } from "../accounts/accountService";

export interface BudgetActivitySplitLine {
  id: string;
  category: string;
  categoryId?: string;
  memo?: string;
  inflow: number;
  outflow: number;
}

export interface BudgetActivityRegisterTransaction {
  id: string;
  accountId: string;
  accountType?: SidebarAccountType | null;
  date: string;
  category: string;
  categoryId?: string;
  inflow: number;
  outflow: number;
  transferAccountId?: string;
  splitLines?: BudgetActivitySplitLine[];
}

export interface BudgetActivityCategoryReference {
  id: string;
  name: string;
}

export interface BudgetActivityCategoryReferenceCounts {
  registerTransactionCount: number;
  registerSplitLineCount: number;
  scheduledTransactionCount: number;
}

export interface BudgetActivityPersistencePort {
  listRegisterTransactionsForBudgetActivity(): Promise<BudgetActivityRegisterTransaction[]>;

  countCategoryReferences(
    category: BudgetActivityCategoryReference,
  ): Promise<BudgetActivityCategoryReferenceCounts>;

  renameRegisterCategoryReferences(input: {
    previousName: string;
    nextName: string;
  }): Promise<void>;

  rewriteCategoryReferences(input: {
    sourceCategory: BudgetActivityCategoryReference;
    targetCategory: BudgetActivityCategoryReference;
  }): Promise<void>;
}
