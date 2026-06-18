import { createDatabase } from "../packages/database/src/db.js";
import { SqliteUserRepository } from "../packages/repository/src/SqliteUserRepository.js";
import { SqliteSessionRepository } from "../packages/repository/src/SqliteSessionRepository.js";
import { SqliteUserSettingsRepository } from "../packages/repository/src/SqliteUserSettingsRepository.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteBudgetUserRepository } from "../packages/repository/src/SqliteBudgetUserRepository.js";
import { AuthApplicationService } from "../packages/application/src/AuthApplicationService.js";
import { UserBudgetApplicationService } from "../packages/application/src/UserBudgetApplicationService.js";
import { BudgetRole } from "../packages/types/src/BudgetRole.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");

  const userRepo = new SqliteUserRepository(db);
  const settingsRepo = new SqliteUserSettingsRepository(db);

  const auth = new AuthApplicationService(
    userRepo,
    new SqliteSessionRepository(db),
    settingsRepo,
  );

  const budgets = new UserBudgetApplicationService(
    new SqliteBudgetRepository(db),
    new SqliteBudgetUserRepository(db),
  );

  const stewart = await auth.signUp("Stewart", null, "password123");
  const daughter = await auth.signUp("Daughter", null, "password456");

  const household = await budgets.createBudgetForUser(
    stewart.id,
    "Household Budget",
  );
  const daughterBudget = await budgets.createBudgetForUser(
    daughter.id,
    "Daughter Budget",
  );

  console.log(await budgets.listAccessibleBudgetIds(stewart.id));
  console.log(await budgets.listAccessibleBudgetIds(daughter.id));

  await budgets.shareBudget(
    stewart.id,
    household.id,
    daughter.id,
    BudgetRole.Viewer,
  );

  console.log(await budgets.listAccessibleBudgetIds(daughter.id));
  console.log(household.name, daughterBudget.name);
}

main();
