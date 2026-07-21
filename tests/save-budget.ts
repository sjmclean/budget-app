import assert from "node:assert/strict";
import { SqliteBudgetScenario } from "./support/persistence/sqliteBudgetScenario.js";

async function main() {
  const scenario = SqliteBudgetScenario.create();
  try {
    const budget = await scenario.budget();

    assert.deepEqual(await scenario.budgets.getById(budget.id), budget);
  } finally {
    scenario.cleanup();
  }
}

main();
