import { readAccounts } from "../accounts/accountService";
import type { KeyValueStoragePort } from "./keyValueStoragePort";
import type { SidebarAccountType } from "../accounts/accountService";
import type {
  BudgetActivityCategoryReference,
  BudgetActivityCategoryReferenceCounts,
  BudgetActivityPersistencePort,
  BudgetActivityRegisterTransaction,
  BudgetActivitySplitLine,
} from "../budget/budgetActivityPersistencePort";

const REGISTER_STORAGE_KEY = "budget-app.account-registers.v1";
const SCHEDULED_TRANSACTIONS_STORAGE_KEY = "budget-app.scheduled-transactions.v1";

interface StoredRegisterSplitLine extends BudgetActivitySplitLine {}

interface StoredRegisterTransaction {
  id: string;
  date: string;
  payee?: string;
  category: string;
  categoryId?: string;
  memo?: string;
  inflow: number;
  outflow: number;
  transferAccountId?: string;
  splitLines?: StoredRegisterSplitLine[];
}

interface StoredRegisterView {
  accountName?: string;
  accountType?: string;
  transactions?: StoredRegisterTransaction[];
}

type StoredRegisters = Record<string, StoredRegisterView>;

interface StoredScheduledTransaction {
  id: string;
  category: string;
  categoryId?: string;
}

export function createBrowserLocalStorageBudgetActivityPersistence(
  storage: KeyValueStoragePort,
): BudgetActivityPersistencePort {
  return {
    async listRegisterTransactionsForBudgetActivity() {
      return readBudgetScopedRegisterTransactions(storage);
    },

    async countCategoryReferences(category) {
      const registerCounts = countRegisterCategoryReferences(storage, category);
      const scheduledTransactionCount = countScheduledCategoryReferences(storage, category);

      return {
        ...registerCounts,
        scheduledTransactionCount,
      };
    },

    async renameRegisterCategoryReferences({ previousName, nextName }) {
      renameStoredRegisterCategory(storage, previousName, nextName);
    },

    async rewriteCategoryReferences({ sourceCategory, targetCategory }) {
      rewriteStoredRegisterCategoryReferences(storage, sourceCategory, targetCategory);
      rewriteScheduledCategoryReferences(storage, sourceCategory, targetCategory);
    },
  };
}

function readBudgetScopedRegisterTransactions(storage: KeyValueStoragePort): BudgetActivityRegisterTransaction[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = storage.getItem(REGISTER_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const registers = JSON.parse(raw) as StoredRegisters;
    const accounts = readAccounts(storage);
    const accountTypeById = new Map(accounts.map((account) => [account.id, account.type]));
    const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));

    return Object.entries(registers).flatMap(([accountId, register]) => {
      const accountType = accountTypeById.get(accountId) ?? mapRegisterAccountType(register.accountType);
      const accountName = accountNameById.get(accountId) ?? register.accountName ?? accountId;

      if (accountType === "tracking") {
        return [];
      }

      return (register.transactions ?? []).map((transaction) => ({
        ...transaction,
        accountId,
        accountName,
        accountType,
      }));
    });
  } catch {
    return [];
  }
}

function mapRegisterAccountType(accountType: string | undefined): SidebarAccountType | null {
  if (!accountType) {
    return null;
  }

  const normalised = accountType.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (normalised === "tracking") {
    return "tracking";
  }

  if (normalised === "creditcard") {
    return "credit-card";
  }

  if (normalised === "onbudget") {
    return "on-budget";
  }

  return null;
}

function countRegisterCategoryReferences(storage: KeyValueStoragePort, category: BudgetActivityCategoryReference): {
  registerTransactionCount: number;
  registerSplitLineCount: number;
} {
  if (typeof window === "undefined") {
    return { registerTransactionCount: 0, registerSplitLineCount: 0 };
  }

  const raw = storage.getItem(REGISTER_STORAGE_KEY);

  if (!raw) {
    return { registerTransactionCount: 0, registerSplitLineCount: 0 };
  }

  try {
    const registers = JSON.parse(raw) as StoredRegisters;
    const matchesSourceCategory = createCategoryReferenceMatcher(category);
    let registerTransactionCount = 0;
    let registerSplitLineCount = 0;

    for (const register of Object.values(registers)) {
      for (const transaction of register.transactions ?? []) {
        if (matchesSourceCategory(transaction.category, transaction.categoryId)) {
          registerTransactionCount += 1;
        }

        for (const splitLine of transaction.splitLines ?? []) {
          if (matchesSourceCategory(splitLine.category, splitLine.categoryId)) {
            registerSplitLineCount += 1;
          }
        }
      }
    }

    return { registerTransactionCount, registerSplitLineCount };
  } catch {
    return { registerTransactionCount: 0, registerSplitLineCount: 0 };
  }
}

function countScheduledCategoryReferences(storage: KeyValueStoragePort, category: BudgetActivityCategoryReference): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const raw = storage.getItem(SCHEDULED_TRANSACTIONS_STORAGE_KEY);

  if (!raw) {
    return 0;
  }

  try {
    const scheduledTransactions = JSON.parse(raw) as StoredScheduledTransaction[];
    const matchesSourceCategory = createCategoryReferenceMatcher(category);

    return Array.isArray(scheduledTransactions)
      ? scheduledTransactions.filter((transaction) => matchesSourceCategory(transaction.category, transaction.categoryId)).length
      : 0;
  } catch {
    return 0;
  }
}

function rewriteStoredRegisterCategoryReferences(
  storage: KeyValueStoragePort,
  sourceCategory: BudgetActivityCategoryReference,
  targetCategory: BudgetActivityCategoryReference,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const raw = storage.getItem(REGISTER_STORAGE_KEY);

  if (!raw) {
    return;
  }

  try {
    const registers = JSON.parse(raw) as StoredRegisters;
    const matchesSourceCategory = createCategoryReferenceMatcher(sourceCategory);
    let changed = false;

    const rewriteValue = (item: { category: string; categoryId?: string }) => {
      if (!matchesSourceCategory(item.category, item.categoryId)) {
        return;
      }

      changed = true;
      item.category = targetCategory.name;
      item.categoryId = targetCategory.id;
    };

    for (const register of Object.values(registers)) {
      for (const transaction of register.transactions ?? []) {
        rewriteValue(transaction);

        for (const splitLine of transaction.splitLines ?? []) {
          rewriteValue(splitLine);
        }
      }
    }

    if (changed) {
      storage.setItem(REGISTER_STORAGE_KEY, JSON.stringify(registers));
    }
  } catch {
    // If register storage is unreadable, leave transactions untouched.
  }
}

function rewriteScheduledCategoryReferences(
  storage: KeyValueStoragePort,
  sourceCategory: BudgetActivityCategoryReference,
  targetCategory: BudgetActivityCategoryReference,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const raw = storage.getItem(SCHEDULED_TRANSACTIONS_STORAGE_KEY);

  if (!raw) {
    return;
  }

  try {
    const scheduledTransactions = JSON.parse(raw) as StoredScheduledTransaction[];

    if (!Array.isArray(scheduledTransactions)) {
      return;
    }

    const matchesSourceCategory = createCategoryReferenceMatcher(sourceCategory);
    let changed = false;

    const nextScheduledTransactions = scheduledTransactions.map((transaction) => {
      if (!matchesSourceCategory(transaction.category, transaction.categoryId)) {
        return transaction;
      }

      changed = true;
      return {
        ...transaction,
        category: targetCategory.name,
        categoryId: targetCategory.id,
      };
    });

    if (changed) {
      storage.setItem(
        SCHEDULED_TRANSACTIONS_STORAGE_KEY,
        JSON.stringify(nextScheduledTransactions),
      );
    }
  } catch {
    // If scheduled transaction storage is unreadable, leave scheduled transactions untouched.
  }
}

function renameStoredRegisterCategory(storage: KeyValueStoragePort, previousName: string, nextName: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const raw = storage.getItem(REGISTER_STORAGE_KEY);

  if (!raw) {
    return;
  }

  try {
    const registers = JSON.parse(raw) as StoredRegisters;
    const previousKey = normaliseCategoryKey(previousName);
    let changed = false;

    const renameValue = (value: string) => {
      if (normaliseCategoryKey(value) !== previousKey) {
        return value;
      }

      changed = true;
      return nextName;
    };

    for (const register of Object.values(registers)) {
      for (const transaction of register.transactions ?? []) {
        transaction.category = renameValue(transaction.category);

        for (const splitLine of transaction.splitLines ?? []) {
          splitLine.category = renameValue(splitLine.category);
        }
      }
    }

    if (changed) {
      storage.setItem(REGISTER_STORAGE_KEY, JSON.stringify(registers));
    }
  } catch {
    // If register storage is unreadable, leave transactions untouched.
  }
}

function createCategoryReferenceMatcher(
  category: BudgetActivityCategoryReference,
): (value: string, categoryId?: string) => boolean {
  const sourceKeys = new Set([
    normaliseCategoryKey(category.id),
    normaliseCategoryKey(category.name),
  ]);

  return (value: string, categoryId?: string) =>
    sourceKeys.has(normaliseCategoryKey(value)) ||
    Boolean(categoryId && sourceKeys.has(normaliseCategoryKey(categoryId)));
}

function normaliseCategoryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}
