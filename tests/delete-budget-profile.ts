import { createDatabase } from "../packages/database/src/db.js";
import { SqliteUserRepository } from "../packages/repository/src/SqliteUserRepository.js";
import { SqliteSessionRepository } from "../packages/repository/src/SqliteSessionRepository.js";
import { SqliteUserSettingsRepository } from "../packages/repository/src/SqliteUserSettingsRepository.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteBudgetUserRepository } from "../packages/repository/src/SqliteBudgetUserRepository.js";
import { AuthApplicationService } from "../packages/application/src/AuthApplicationService.js";
import { UserBudgetApplicationService } from "../packages/application/src/UserBudgetApplicationService.js";
import { ProfileApplicationService } from "../packages/application/src/ProfileApplicationService.js";
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

  const budgetUsers = new SqliteBudgetUserRepository(db);

  const userBudgets = new UserBudgetApplicationService(
    new SqliteBudgetRepository(db),
    budgetUsers,
  );

  const profiles = new ProfileApplicationService(userRepo, settingsRepo);

  const user = await auth.signUp("Stewart", null, "password123");
  const budget = await userBudgets.createBudgetForUser(
    user.id,
    "Household Budget",
  );

  await userBudgets.deleteBudgetAccessRecords(user.id, budget.id);
  console.log(await budgetUsers.findUsersForBudget(budget.id));

  await profiles.softDeleteProfile(user.id);
  console.log(await userRepo.getById(user.id));
  console.log(await settingsRepo.getByUser(user.id));
}

main();
