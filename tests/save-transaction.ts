import assert from "node:assert/strict";
import { SqliteBudgetScenario } from "./support/persistence/sqliteBudgetScenario.js";

async function main() {
  const scenario = SqliteBudgetScenario.create();
  try {
    const budget = await scenario.budget();
    const checking = await scenario.account(budget, { openingBalance: 500_000 });
    const food = await scenario.categoryGroup(budget, "Food");
    const groceries = await scenario.category(food, "Groceries");
    const woolworths = await scenario.payee(budget, "Woolworths");
    const transaction = await scenario.transaction(budget, {
      account: checking,
      payee: woolworths,
      category: groceries,
      amount: -15_000,
    });

    assert.deepEqual(await scenario.transactions.findByAccount(checking.id), [transaction]);
  } finally {
    scenario.cleanup();
  }
}

main();
