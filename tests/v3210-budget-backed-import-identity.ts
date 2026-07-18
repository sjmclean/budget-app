import assert from "node:assert/strict";
import {
  findImportedFileFingerprint,
  rememberImportedFileFingerprint,
  rememberImportedTransactionCandidates,
  partitionPreviouslyImportedCandidates,
} from "../apps/web/src/features/accounts/transactionImportKnowledge";
import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createInitialBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry";
import { SELECTED_BUDGET_STORAGE_KEY } from "../apps/web/src/features/budget/budgetDataScope";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});

const household = createInitialBudgetRegistry(new Date("2026-01-01T00:00:00.000Z"))[0];
const second = { ...household, id: "second", name: "Second Budget", packagePath: "~/Budgets/Second.budget" };
storage.setItem(BUDGET_REGISTRY_STORAGE_KEY, JSON.stringify([household, second]));

const candidate = {
  id: "row-1",
  parsed: {
    date: "2026-07-17",
    payee: "Netflix",
    outflow: 25.99,
    inflow: 0,
    raw: { date: "17/07/2026", payee: "NETFLIX AU 123", amount: "-25.99" },
  },
};

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "household");
rememberImportedFileFingerprint({
  accountId: "checking",
  fileHash: "same-file",
  fileName: "statement.qif",
  importedAt: "2026-07-17T00:00:00.000Z",
  transactionCount: 1,
});
rememberImportedTransactionCandidates({
  accountId: "checking",
  fileType: "qif",
  candidates: [candidate],
});

assert.ok(findImportedFileFingerprint("checking", "same-file"));
assert.equal(
  partitionPreviouslyImportedCandidates({
    accountId: "checking",
    fileType: "qif",
    candidates: [candidate],
  }).previouslyImportedCandidates.length,
  1,
);

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "second");
assert.equal(findImportedFileFingerprint("checking", "same-file"), undefined);
assert.equal(
  partitionPreviouslyImportedCandidates({
    accountId: "checking",
    fileType: "qif",
    candidates: [candidate],
  }).previouslyImportedCandidates.length,
  0,
);

rememberImportedFileFingerprint({
  accountId: "checking",
  fileHash: "same-file",
  fileName: "statement.qif",
  importedAt: "2026-07-18T00:00:00.000Z",
  transactionCount: 1,
});
assert.ok(findImportedFileFingerprint("checking", "same-file"));

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "household");
assert.equal(
  findImportedFileFingerprint("checking", "same-file")?.importedAt,
  "2026-07-17T00:00:00.000Z",
);

console.log("v3.21.0 budget-backed import identity checks passed");
