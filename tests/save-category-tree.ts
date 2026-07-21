import assert from "node:assert/strict";
import { SqliteBudgetScenario } from "./support/persistence/sqliteBudgetScenario.js";

async function main() {
  const scenario = SqliteBudgetScenario.create();
  try {
    const budget = await scenario.budget();
    const housing = await scenario.categoryGroup(budget, "Housing");
    const rent = await scenario.category(housing, "Rent");

    assert.deepEqual(await scenario.categoryGroups.findByBudget(budget.id), [housing]);
    assert.deepEqual(await scenario.categories.findByGroup(housing.id), [rent]);
  } finally {
    scenario.cleanup();
  }
}

main();
