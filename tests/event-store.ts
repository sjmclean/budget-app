import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createDomainEvent } from "../packages/budget-engine/src/services/createDomainEvent.js";
import { DomainEventType } from "../packages/types/src/DomainEventType.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteDomainEventRepository } from "../packages/repository/src/SqliteDomainEventRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();

  const db = createDatabase("Test.budget");

  const budgetRepo = new SqliteBudgetRepository(db);
  const eventRepo = new SqliteDomainEventRepository(db);

  const budget = createBudget("Household Budget");

  await budgetRepo.create(budget);

  await eventRepo.append(
    createDomainEvent(
      budget.id,
      DomainEventType.BudgetCreated,
      budget.id,
      budget,
    ),
  );

  console.log(await eventRepo.findByBudget(budget.id));
}

main();
