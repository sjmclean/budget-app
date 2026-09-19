import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requireLocalBudgetEngine } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.js";
import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.js";

test("the local engine capability guard fails deliberately instead of dereferencing undefined", () => {
  assert.throws(() => requireLocalBudgetEngine(undefined), /requires the Local Budget Engine capability/);
  const engine = { marker: true };
  assert.equal(requireLocalBudgetEngine(engine as never), engine);
});

test("a query-only provider remains usable independently of its absent write engine", async () => {
  const provider = { accountRegisterQueries: { async listTransactionTags() { return ["query-result"]; } } } as unknown as BudgetPersistenceProvider;
  assert.deepEqual(await provider.accountRegisterQueries!.listTransactionTags("budget"), ["query-result"]);
  assert.throws(() => requireLocalBudgetEngine(provider.localBudgetEngine), /Local Budget Engine capability/);
});

test("production consumers do not use non-null assertions for the optional local engine", () => {
  const files = [
    "apps/web/src/features/accounts/useAccountRegister.ts",
    "apps/web/src/features/history/commands/management/tagCommands.ts",
    "apps/web/src/pages/AccountRegisterPage.tsx",
    "apps/web/src/pages/PayeeManagementPage.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /localBudgetEngine!/);
  }
});
