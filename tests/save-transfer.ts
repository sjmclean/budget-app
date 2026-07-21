import assert from "node:assert/strict";
import { AccountType } from "../packages/types/src/AccountType.js";
import { SqliteBudgetScenario } from "./support/persistence/sqliteBudgetScenario.js";

async function main() {
  const scenario = SqliteBudgetScenario.create();
  try {
    const budget = await scenario.budget();
    const checking = await scenario.account(budget, { openingBalance: 500_000 });
    const savings = await scenario.account(budget, {
      name: "Savings",
      type: AccountType.Savings,
      openingBalance: 100_000,
    });
    const transfer = await scenario.transfer(budget, checking, savings);

    const transactions = await scenario.transactions.findByBudget(budget.id);
    assert.equal(transactions.length, 2);
    assert.deepEqual(new Set(transactions.map((transaction) => transaction.id)), new Set([
      transfer.outflow.id,
      transfer.inflow.id,
    ]));
  } finally {
    scenario.cleanup();
  }
}

main();
