import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localPayeeRecordToView } from "../apps/web/src/features/persistence/localFirst/localPayeeView";
import { completeBudgetDeletion } from "../apps/web/src/features/budget/completeBudgetDeletion";
import type { BudgetPersistenceProvider } from "../apps/web/src/features/persistence/budgetPersistenceProvider";

const view = localPayeeRecordToView({
  id: "payee", budgetId: "budget", name: "Grocer", note: "note", archived: false,
  defaultCategoryId: "groceries", defaultCategoryName: "Groceries", iconRef: "cart",
  createdAt: "2026-01-01", firstUsedAt: "2026-02-01", lastUsedAt: "2026-08-01",
  useCount: 17, scheduledUseCount: 3,
  aliases: [{ id: "alias", value: "GROCER 123" }],
  importRules: [{
    id: "rule", matchType: "contains", text: "GROCER",
    defaultCategoryId: "groceries", defaultCategoryName: "Groceries",
    priority: 2, enabled: true,
  }],
});
assert.deepEqual(view, {
  id: "payee", name: "Grocer", note: "note", isArchived: false,
  createdAt: "2026-02-01", lastUsedAt: "2026-08-01", useCount: 17,
  scheduledUseCount: 3, defaultCategoryId: "groceries",
  defaultCategoryName: "Groceries", iconRef: "cart",
  aliases: [{ id: "alias", value: "GROCER 123" }],
  importRules: [{
    id: "rule", matchType: "contains", text: "GROCER",
    defaultCategoryId: "groceries", defaultCategoryName: "Groceries",
    priority: 2, enabled: true,
  }],
});

const remoteBudgets = new Set(["ynab4-budget"]);
const localFiles = new Set(["ynab4-budget"]);
const registry = new Set(["ynab4-budget"]);
const events: string[] = [];
const provider = {
  syncArchitecture: "local-first-relay",
  accountRegisterQueries: {
    async deleteBudget(id: string) {
      events.push("authoritative");
      remoteBudgets.delete(id);
      localFiles.delete(id);
    },
  },
} as unknown as BudgetPersistenceProvider;
const result = await completeBudgetDeletion(provider, "ynab4-budget", () => {
  events.push("registry");
  registry.delete("ynab4-budget");
  return {
    completed: true, removedRecords: 1, writtenRecords: 0, remainingBudgets: 0,
    warnings: [], errors: [],
  };
});
assert.equal(result.completed, true);
assert.deepEqual(events, ["authoritative", "registry"]);
assert.equal(remoteBudgets.has("ynab4-budget"), false);
assert.equal(localFiles.has("ynab4-budget"), false);
assert.equal(registry.has("ynab4-budget"), false);
assert.deepEqual([...remoteBudgets], [], "bootstrap after deletion must not rediscover the budget");

const clientSource = readFileSync(
  "apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts", "utf8",
);
assert.doesNotMatch(clientSource, /function listLocalPayees/);
assert.doesNotMatch(clientSource, /useCount:\s*0/);
assert.match(clientSource, /rows\.map\(localPayeeRecordToView\)/);
assert.ok((clientSource.match(/listPersistedPayees\(budgetId,/g) ?? []).length >= 5);

const selectorSource = readFileSync("apps/web/src/pages/BudgetSelectorPage.tsx", "utf8");
assert.doesNotMatch(selectorSource, /packagePath\.startsWith\("hosted:\/\/"\)/);
assert.match(selectorSource, /completeBudgetDeletion/);

console.log("Milestone 4 canonical PayeeView and deletion lifecycle invariants passed.");
