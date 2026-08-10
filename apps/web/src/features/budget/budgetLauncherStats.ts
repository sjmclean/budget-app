import { readAccounts } from "../accounts/accountService.js";
import { countTransactionEntities } from "../accounts/entities/transactionEntityPersistence.js";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort.js";
import type { BudgetSummary } from "./budgetRegistry.js";
import {
  createFixedBudgetScopedStorage,
} from "./budgetDataScope.js";
import { readYnab4LauncherImportRecord } from "./ynab4/finaliseYnab4Import.js";

export interface BudgetLauncherStats {
  accountCount: number;
  transactionCount: number;
}

/**
 * Reads the compact, audited YNAB4 import count when available. Calling the
 * generic entity counter decodes every transaction and can exhaust the browser
 * heap merely by rendering a card for a very large imported budget.
 */
export function readBudgetLauncherStats(
  storage: KeyValueStoragePort,
  budget: BudgetSummary,
): BudgetLauncherStats {
  const scopedStorage = createFixedBudgetScopedStorage(storage, budget.id);
  const importRecord = readYnab4LauncherImportRecord(storage, budget.id);

  return {
    accountCount: readAccounts(scopedStorage).length,
    transactionCount:
      importRecord?.schemaVersion === 2
        ? importRecord.counts.transactions
        : countTransactionEntities(scopedStorage),
  };
}
