import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApplicationHistoryService, type ApplicationHistoryContext } from "../../../apps/web/src/features/history/applicationHistory.ts";
import { setTransactionTagsCommand } from "../../../apps/web/src/features/history/commands/management/tagCommands.ts";
import { createTransactionGraphChangeCommand } from "../../../apps/web/src/features/history/commands/transactions/transactionCommands.ts";
import type { TransactionTagDefinition } from "../../../apps/web/src/features/tags/transactionTagTypes.ts";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.ts";

const budgetId = "phase-6";
const tag = (id: string): TransactionTagDefinition => ({ id, name: id, colour: "blue", autoTagImportedTransactions: false, archived: false, createdAt: "created", updatedAt: "updated" });

test("tag definition replacement round-trips and rejects stale state", async () => {
  let tags: readonly TransactionTagDefinition[] = [tag("one")];
  const queries = {
    async listTransactionTags() { return structuredClone(tags); },
    async replaceTransactionTagsHistoryState(input: any) {
      assert.equal(JSON.stringify(tags), JSON.stringify(input.expected));
      tags = structuredClone(input.replacement);
      return tags;
    },
  };
  const persistence = { accountRegisterQueries: queries } as unknown as BudgetPersistenceProvider;
  const history = new ApplicationHistoryService<ApplicationHistoryContext>({ getContext: () => ({ budgetId, persistence }) });
  await history.execute(budgetId, setTransactionTagsCommand("add-tag:two", "Create tag", [tag("one"), tag("two")]));
  assert.deepEqual(tags.map(({ id }) => id), ["one", "two"]);
  await history.undo(budgetId);
  assert.deepEqual(tags.map(({ id }) => id), ["one"]);
  await history.redo(budgetId);
  tags = [tag("external")];
  const result = await history.undo(budgetId);
  assert.equal(result.performed, false);
  assert.equal(history.getSnapshot(budgetId).undoDepth, 1);
});

test("attachment commands use the exact transaction graph command", () => {
  const workflow = readFileSync(new URL("../../../apps/web/src/features/accounts/useRegisterAttachmentWorkflow.ts", import.meta.url), "utf8");
  assert.match(workflow, /label: "Add attachment"/);
  assert.match(workflow, /label: "Remove attachment"/);
  assert.equal((workflow.match(/createTransactionGraphChangeCommand/g) ?? []).length, 3);
  const command = createTransactionGraphChangeCommand({ id: "attachment", label: "Add attachment", transactionIds: ["tx"], mutate: async () => undefined });
  assert.equal(command.label, "Add attachment");
});

test("payee and tag UI wiring uses application history and preserves explicit exclusions", () => {
  const payees = readFileSync(new URL("../../../apps/web/src/pages/PayeeManagementPage.tsx", import.meta.url), "utf8");
  const register = readFileSync(new URL("../../../apps/web/src/pages/AccountRegisterPage.tsx", import.meta.url), "utf8");
  const tags = readFileSync(new URL("../../../apps/web/src/features/tags/TransactionTagManager.tsx", import.meta.url), "utf8");
  assert.match(payees, /usePayeeHistory\(activeBudgetId\)/);
  assert.match(payees, /accountRegisterQueries!\.mergePayees/);
  assert.match(register, /payeeHistory\.createPayee/);
  assert.match(register, /setTransactionTagsCommand/);
  assert.match(tags, /Remove .* from its transactions before deleting it/);
});
