import assert from "node:assert/strict";
import test from "node:test";

import {
  auditYnab4LauncherImportAccuracy,
  formatYnab4LauncherImportAccuracyAuditReport,
} from "../../../apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.js";
import { createFixedBudgetScopedStorage } from "../../../apps/web/src/features/budget/budgetDataScope.js";
import { replaceTransactionRegisters } from "../../../apps/web/src/features/accounts/entities/transactionEntityPersistence.js";
import type { KeyValueStoragePort } from "../../../apps/web/src/features/persistence/keyValueStoragePort.js";

function memoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

test("persisted YNAB4 accuracy audit reports imported-payee provenance loss", () => {
  const budgetId = "budget-provenance-audit";
  const transactionId = "transaction-provenance-loss";
  const storage = memoryStorage();
  const scoped = createFixedBudgetScopedStorage(storage, budgetId);

  replaceTransactionRegisters(scoped, {
    checking: {
      accountId: "checking",
      accountName: "Unknown Account",
      accountType: "On budget",
      currencyCode: "AUD",
      clearedBalance: -12.34,
      unclearedBalance: 0,
      workingBalance: -12.34,
      transactions: [{
        id: transactionId,
        date: "2026-08-13",
        attachmentCount: 0,
        payee: "Local Shop",
        category: "Uncategorised",
        inflow: 0,
        outflow: 12.34,
        runningBalance: -12.34,
        cleared: true,
        reconciled: false,
      }],
    },
  });

  const budgetDataPath = "Budget/data/device/Budget.yfull";
  const result = auditYnab4LauncherImportAccuracy(storage, {
    budgetId,
    budgetDataPath,
    entries: [{
      path: budgetDataPath,
      selectedBudgetData: true,
      parsedData: {
        accounts: [],
        masterCategories: [],
        monthlyBudgets: [],
        scheduledTransactions: [],
        transactions: [{
          entityId: transactionId,
          accountId: "checking",
          date: "2026-08-13",
          amount: -12_340,
          importedPayee: "LOCAL SHOP 0421 MELBOURNE",
        }],
      },
    }],
  });

  assert.equal(result.status, "fail");
  assert.equal(
    result.importedPayeeProvenance.sourceTransactionsWithImportedPayee,
    1,
  );
  assert.equal(result.importedPayeeProvenance.preservedRawPayees, 0);
  assert.equal(result.importedPayeeProvenance.mismatches.length, 1);
  assert.match(result.mismatches.join("\n"), /Imported-payee provenance mismatch/);

  const report = formatYnab4LauncherImportAccuracyAuditReport(result);
  assert.match(report, /Imported Payee Provenance/);
  assert.match(report, /Provenance mismatches: 1/);
});
