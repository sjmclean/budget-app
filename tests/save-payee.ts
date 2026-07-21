import assert from "node:assert/strict";
import { SqliteBudgetScenario } from "./support/persistence/sqliteBudgetScenario.js";

async function main() {
  const scenario = SqliteBudgetScenario.create();
  try {
    const budget = await scenario.budget();
    const payee = await scenario.payee(budget, "Woolworths");

    const persisted = await scenario.payees.findByBudget(budget.id);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]?.id, payee.id);
    assert.equal(persisted[0]?.budgetId, budget.id);
    assert.equal(persisted[0]?.name, "Woolworths");
    assert.equal(persisted[0]?.normalizedName, "woolworths");
  } finally {
    scenario.cleanup();
  }
}

main();
