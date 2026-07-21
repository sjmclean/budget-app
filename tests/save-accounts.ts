import assert from "node:assert/strict";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { SqliteBudgetScenario } from "./support/persistence/sqliteBudgetScenario.js";

async function main() {
  const scenario = SqliteBudgetScenario.create();
  try {
    const budget = await scenario.budget();
    const checking = await scenario.account(budget, {
      openingBalance: 500_000,
      type: AccountType.Checking,
      participation: BudgetParticipation.OnBudget,
    });

    assert.deepEqual(await scenario.accounts.findByBudget(budget.id), [checking]);
  } finally {
    scenario.cleanup();
  }
}

main();
