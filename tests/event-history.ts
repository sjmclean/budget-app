import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createDomainEvent } from "../packages/budget-engine/src/services/createDomainEvent.js";
import { DomainEventType } from "../packages/types/src/DomainEventType.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteDomainEventRepository } from "../packages/repository/src/SqliteDomainEventRepository.js";
import { HistoryService } from "../packages/application/src/HistoryService.js";
import { UndoService } from "../packages/application/src/UndoService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();

  const db = createDatabase("Test.budget");

  const budgetRepo = new SqliteBudgetRepository(db);
  const eventRepo = new SqliteDomainEventRepository(db);
  const history = new HistoryService(eventRepo);
  const undo = new UndoService(eventRepo);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);

  const event = createDomainEvent(
    budget.id,
    DomainEventType.BudgetCreated,
    budget.id,
    budget
  );

  await eventRepo.append(event);

  console.log(await history.describeHistory(budget.id));
  console.log(await undo.getLastEvent(budget.id));
  console.log(undo.createUndoRecord(budget.id, event, { deleteBudgetId: budget.id }));
}

main();
