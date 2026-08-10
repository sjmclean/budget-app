import assert from "node:assert/strict";
import { installInMemoryBudgetPersistence } from "./support/persistence/inMemoryBudgetPersistence.js";
import { writeBudgetRegistry } from "../apps/web/src/features/budget/budgetRegistry";
import { SELECTED_BUDGET_STORAGE_KEY } from "../apps/web/src/features/budget/budgetDataScope";
import {
  createImportedFileFingerprintRepository,
  createImportedTransactionFingerprintRepository,
  IMPORTED_FILE_FINGERPRINT_ENTITY_INDEX_KEY,
  IMPORTED_TRANSACTION_FINGERPRINT_ENTITY_INDEX_KEY,
} from "../apps/web/src/features/accounts/entities/importFingerprintEntity";
import {
  findImportedFileFingerprint,
  partitionPreviouslyImportedCandidates,
  rememberImportedFileFingerprint,
  rememberImportedTransactionCandidates,
} from "../apps/web/src/features/accounts/transactionImportKnowledge";

const { storage, cleanup } = installInMemoryBudgetPersistence();
try {
writeBudgetRegistry(storage, [{ id: "budget-a", name: "Budget A", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" }]);
storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "budget-a");

rememberImportedFileFingerprint({
  accountId: "checking",
  fileHash: "hash-1",
  fileName: "statement.csv",
  importedAt: "2026-07-01T00:00:00.000Z",
  transactionCount: 1,
});
assert.equal(findImportedFileFingerprint("checking", "hash-1")?.fileName, "statement.csv");
assert.equal(storage.getItem("budget-app.imported-file-fingerprints.v1"), null);
assert.ok(storage.listKeys().some((key) => key.endsWith(IMPORTED_FILE_FINGERPRINT_ENTITY_INDEX_KEY)));

const candidate = {
  id: "row-1",
  parsed: {
    date: "2026-07-01",
    payee: "Grocer",
    outflow: 4200,
    inflow: 0,
    raw: { date: "2026-07-01", payee: "Grocer", amount: "-42.00" },
  },
};
rememberImportedTransactionCandidates({
  accountId: "checking",
  fileType: "csv",
  candidates: [candidate],
  importedAt: "2026-07-01T00:00:00.000Z",
});
assert.equal(partitionPreviouslyImportedCandidates({ accountId: "checking", fileType: "csv", candidates: [candidate] }).previouslyImportedCandidates.length, 1);
assert.equal(storage.getItem("budget-app.imported-transaction-fingerprints.v1"), null);
assert.ok(storage.listKeys().some((key) => key.endsWith(IMPORTED_TRANSACTION_FINGERPRINT_ENTITY_INDEX_KEY)));

const fileEntity = createImportedFileFingerprintRepository({
  getItem: (key) => storage.getItem(`budget-app.budgets.budget-a.${key}`),
  setItem: (key, value) => storage.setItem(`budget-app.budgets.budget-a.${key}`, value),
  removeItem: (key) => storage.removeItem(`budget-app.budgets.budget-a.${key}`),
  listKeys: () => storage.listKeys().filter((key) => key.startsWith("budget-app.budgets.budget-a.")).map((key) => key.slice("budget-app.budgets.budget-a.".length)),
}).list()[0];
assert.equal(fileEntity.fields.fileName.value, "statement.csv");
assert.equal(createImportedTransactionFingerprintRepository({
  getItem: (key) => storage.getItem(`budget-app.budgets.budget-a.${key}`),
  setItem: (key, value) => storage.setItem(`budget-app.budgets.budget-a.${key}`, value),
  removeItem: (key) => storage.removeItem(`budget-app.budgets.budget-a.${key}`),
  listKeys: () => storage.listKeys().filter((key) => key.startsWith("budget-app.budgets.budget-a.")).map((key) => key.slice("budget-app.budgets.budget-a.".length)),
}).list().length, 1);

console.log("v5.10 import fingerprint entity cutover checks passed");
} finally {
  cleanup();
}
