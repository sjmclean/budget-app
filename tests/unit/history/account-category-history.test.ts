import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApplicationHistoryService, type ApplicationHistoryContext } from "../../../apps/web/src/features/history/applicationHistory.ts";
import { createAccountCommand, deleteEmptyAccountCommand, setAccountClosedCommand, updateAccountCommand } from "../../../apps/web/src/features/history/commands/management/accountCommands.ts";
import { archiveCategoryCommand, createCategoryCommand, moveCategoryCommand, moveCategoryGroupCommand, renameCategoryCommand, setCategoryOverspendingHandlingCommand, updateCategoryGroupNoteCommand, updateCategoryNoteCommand } from "../../../apps/web/src/features/history/commands/management/categoryCommands.ts";
import type { LocalAccountRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.ts";
import type { BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes.ts";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.ts";

const budgetId = "budget-management";
const month = "2026-08";

function account(id: string): LocalAccountRecord {
  return { id, budgetId, name: "Everyday", type: "on-budget", participation: "on-budget", openingBalance: 12345, currencyCode: "AUD", createdAt: "created", closedAt: null };
}

function view(): BudgetMonthView {
  return { budgetId, budgetName: "Budget", monthLabel: "August", currencyCode: "AUD", readyToAssign: 0, totalAssigned: 0, totalActivity: 0, totalAvailable: 0, categoryGroups: [
    { id: "group-a", name: "Bills", previousAvailable: 0, assigned: 0, activity: 0, available: 0, note: "group note", categories: [
      { id: "cat-a", name: "Rent", previousAvailable: 0, assigned: 0, activity: 0, available: 0, isOverspent: false, isArchived: false, note: "note-a" },
      { id: "cat-b", name: "Power", previousAvailable: 0, assigned: 0, activity: 0, available: 0, isOverspent: false, isArchived: false, note: "note-b" },
    ] },
    { id: "group-b", name: "Fun", previousAvailable: 0, assigned: 0, activity: 0, available: 0, note: "", categories: [] },
  ] };
}

function harness() {
  const accounts = new Map<string, LocalAccountRecord>();
  let budgetView = view();
  const same = (left: unknown, right: unknown) => assert.equal(JSON.stringify(left), JSON.stringify(right));
  const queries = {
    async captureAccount(_budgetId: string, id: string) { return structuredClone(accounts.get(id) ?? null); },
    async createAccount(_budgetId: string, input: any) { accounts.set(input.id, { ...account(input.id), name: input.name, type: input.type, openingBalance: Math.round(input.startingBalance * 100) }); return []; },
    async updateAccount(_budgetId: string, input: any) { accounts.set(input.id, { ...accounts.get(input.id)!, name: input.name, type: input.type }); return []; },
    async setAccountClosed(input: any) { accounts.set(input.accountId, { ...accounts.get(input.accountId)!, closedAt: input.closed ? "closed" : null }); },
    async deleteAccount(_budgetId: string, id: string) { accounts.delete(id); return { deleted: true, accounts: [] }; },
    async replaceAccountHistoryState(input: any) { same(accounts.get(input.accountId) ?? null, input.expected); if (input.replacement) accounts.set(input.accountId, structuredClone(input.replacement)); else accounts.delete(input.accountId); },
    async getBudgetMonthView() { return structuredClone(budgetView); },
    async replaceBudgetMonthHistoryState(input: any) { same(budgetView, input.expected); budgetView = structuredClone(input.replacement); },
  };
  const categories: any = {
    async createCategory(input: any) { const group = budgetView.categoryGroups.find(({ id }) => id === input.groupId)!; group.categories.push({ id: input.categoryId, name: input.name, previousAvailable: 0, assigned: 0, activity: 0, available: 0, isOverspent: false, isArchived: false, note: "" }); return budgetView; },
    async renameCategory(input: any) { const category = budgetView.categoryGroups.flatMap(({ categories }) => categories).find(({ id }) => id === input.categoryId)!; category.name = input.name; return budgetView; },
    async setCategoryArchived(input: any) { const category = budgetView.categoryGroups.flatMap(({ categories }) => categories).find(({ id }) => id === input.categoryId)!; category.isArchived = input.isArchived; return budgetView; },
    async moveCategory(input: any) { const group = budgetView.categoryGroups.find(({ categories }) => categories.some(({ id }) => id === input.categoryId))!; group.categories.reverse(); return budgetView; },
    async moveCategoryGroup() { budgetView.categoryGroups.reverse(); return budgetView; },
    async updateCategoryNote(input: any) { budgetView.categoryGroups.flatMap(({ categories }) => categories).find(({ id }) => id === input.categoryId)!.note = input.note; return budgetView; },
    async updateCategoryGroupNote(input: any) { budgetView.categoryGroups.find(({ id }) => id === input.groupId)!.note = input.note; return budgetView; },
    async setCategoryOverspendingHandling(input: any) { budgetView.categoryGroups.flatMap(({ categories }) => categories).find(({ id }) => id === input.categoryId)!.overspendingHandling = input.overspendingHandling; return budgetView; },
  };
  const persistence = { accountRegisterQueries: queries, categories } as unknown as BudgetPersistenceProvider;
  const service = new ApplicationHistoryService<ApplicationHistoryContext>({ getContext: (id) => ({ budgetId: id, persistence }) });
  return { service, accounts, getView: () => budgetView, setView: (next: BudgetMonthView) => { budgetView = next; } };
}

test("account create/update/close/reopen/delete use stable exact records", async () => {
  const { service, accounts } = harness();
  await service.execute(budgetId, createAccountCommand("stable-account", { name: "Savings", type: "on-budget", startingBalance: 50 }));
  assert.equal(accounts.get("stable-account")!.openingBalance, 5000);
  await service.undo(budgetId); assert.equal(accounts.has("stable-account"), false);
  await service.redo(budgetId); assert.equal(accounts.get("stable-account")!.id, "stable-account");
  await service.execute(budgetId, updateAccountCommand({ id: "stable-account", name: "Renamed", type: "tracking" }));
  await service.undo(budgetId); assert.equal(accounts.get("stable-account")!.name, "Savings");
  await service.execute(budgetId, setAccountClosedCommand("stable-account", true));
  await service.undo(budgetId); assert.equal(accounts.get("stable-account")!.closedAt, null);
  await service.execute(budgetId, setAccountClosedCommand("stable-account", false));
  assert.equal(service.getSnapshot(budgetId).undoLabel, "Reopen account");
  await service.execute(budgetId, deleteEmptyAccountCommand("stable-account"));
  await service.undo(budgetId); assert.equal(accounts.get("stable-account")!.id, "stable-account");
  await service.redo(budgetId); assert.equal(accounts.has("stable-account"), false);
});

test("account conflict rejects unsafe Undo and retains history", async () => {
  const { service, accounts } = harness(); accounts.set("account-a", account("account-a"));
  await service.execute(budgetId, updateAccountCommand({ id: "account-a", name: "Changed", type: "on-budget" }));
  accounts.set("account-a", { ...accounts.get("account-a")!, name: "External" });
  const result = await service.undo(budgetId);
  assert.equal(result.performed, false); assert.equal(service.getSnapshot(budgetId).undoDepth, 1); assert.equal(accounts.get("account-a")!.name, "External");
});

test("category create/rename/archive/move/notes and group order round-trip exactly", async () => {
  const { service, getView } = harness();
  await service.execute(budgetId, createCategoryCommand({ budgetId, month, categoryId: "stable-category", groupId: "group-a", groupName: "Bills", name: "Internet" }));
  await service.undo(budgetId); assert.equal(getView().categoryGroups[0].categories.some(({ id }) => id === "stable-category"), false);
  await service.redo(budgetId); assert.equal(getView().categoryGroups[0].categories.at(-1)!.id, "stable-category");
  await service.execute(budgetId, renameCategoryCommand({ budgetId, month, categoryId: "cat-a", name: "Mortgage" }));
  await service.execute(budgetId, archiveCategoryCommand({ budgetId, month, categoryId: "cat-a", isArchived: true }));
  await service.execute(budgetId, updateCategoryNoteCommand({ budgetId, month, categoryId: "cat-a", note: "changed note" }));
  await service.execute(budgetId, setCategoryOverspendingHandlingCommand({ budgetId, month, categoryId: "cat-a", overspendingHandling: "carry-category" }));
  await service.undo(budgetId); assert.equal(getView().categoryGroups[0].categories.find(({ id }) => id === "cat-a")!.overspendingHandling, undefined);
  await service.redo(budgetId); assert.equal(getView().categoryGroups[0].categories.find(({ id }) => id === "cat-a")!.overspendingHandling, "carry-category");
  await service.execute(budgetId, moveCategoryCommand({ budgetId, month, categoryId: "cat-a", direction: "down" }));
  assert.equal(getView().categoryGroups[0].categories[0].id, "stable-category");
  await service.undo(budgetId); assert.equal(getView().categoryGroups[0].categories[0].id, "cat-a");
  await service.execute(budgetId, updateCategoryGroupNoteCommand({ budgetId, month, groupId: "group-a", note: "new group note" }));
  await service.execute(budgetId, moveCategoryGroupCommand({ budgetId, month, groupId: "group-a", direction: "down" }));
  await service.undo(budgetId); assert.equal(getView().categoryGroups[0].id, "group-a");
});

test("category conflict and production wiring preserve safe boundaries", async () => {
  const { service, getView, setView } = harness();
  await service.execute(budgetId, renameCategoryCommand({ budgetId, month, categoryId: "cat-a", name: "Mortgage" }));
  setView({ ...getView(), budgetName: "external" });
  const result = await service.undo(budgetId); assert.equal(result.performed, false); assert.equal(service.getSnapshot(budgetId).undoDepth, 1);
  const sidebar = readFileSync(new URL("../../../apps/web/src/layouts/Sidebar.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../../../apps/web/src/features/budget/useBudgetWorkspace.ts", import.meta.url), "utf8");
  assert.match(sidebar, /useAccountHistory\(activeBudgetId\)/);
  assert.doesNotMatch(sidebar, /accountRegisterQueries\.(createAccount|updateAccount|setAccountClosed|deleteAccount)/);
  assert.match(workspace, /useCategoryHistory\(budgetId, month\)/);
  assert.match(workspace, /categoriesPersistence\.mergeCategory/);
  assert.doesNotMatch(workspace, /categoriesPersistence\.(renameCategory|setCategoryArchived|setCategoryOverspendingHandling|moveCategory|moveCategoryToPosition|moveCategoryGroup|moveCategoryGroupToPosition|updateCategoryNote|updateCategoryGroupNote|createCategory)/);
});

test("worker account/category replacements compare, transact, verify and roll back", () => {
  const worker = readFileSync(new URL("../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url), "utf8");
  for (const name of ["replaceAccountHistoryState", "replaceBudgetMonthHistoryState"]) {
    const start = worker.indexOf(`function ${name}(`); const source = worker.slice(start, worker.indexOf("\nfunction ", start + 10));
    assert.match(source, /BEGIN IMMEDIATE/); assert.match(source, /CONFLICT/); assert.match(source, /VERIFICATION_FAILED/); assert.match(source, /COMMIT/); assert.match(source, /ROLLBACK/);
  }
});
