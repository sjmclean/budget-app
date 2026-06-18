import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqlitePayeeRepository } from "../packages/repository/src/SqlitePayeeRepository.js";
import { PayeeManagementApplicationService } from "../packages/application/src/PayeeManagementApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const payeeRepo = new SqlitePayeeRepository(db);
  const service = new PayeeManagementApplicationService(payeeRepo);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);

  await payeeRepo.create({
    id: "p1",
    budgetId: budget.id,
    name: "Woolworths",
    normalizedName: "woolworths",
    isArchived: false,
    isTransfer: false,
    transferAccountId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await payeeRepo.create({
    id: "p2",
    budgetId: budget.id,
    name: " WOOLWORTHS ",
    normalizedName: "woolworths",
    isArchived: false,
    isTransfer: false,
    transferAccountId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await payeeRepo.create({
    id: "p3",
    budgetId: budget.id,
    name: "Coles",
    normalizedName: "coles",
    isArchived: false,
    isTransfer: false,
    transferAccountId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const suggestions = await service.findDuplicateSuggestions(budget.id);
  if (suggestions.length !== 1)
    throw new Error("Expected one duplicate payee suggestion");
  if (suggestions[0].normalizedName !== "woolworths")
    throw new Error("Expected Woolworths duplicate suggestion");
  if (suggestions[0].payees.length !== 2)
    throw new Error("Expected two Woolworths payees in suggestion");

  console.log("v1.2.2 payee cleanup duplicate suggestions OK");
}

main();
