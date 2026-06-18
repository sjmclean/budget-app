import { createDatabase } from "../packages/database/src/db.js";
import { SqliteUserRepository } from "../packages/repository/src/SqliteUserRepository.js";
import { SqliteSessionRepository } from "../packages/repository/src/SqliteSessionRepository.js";
import { SqliteUserSettingsRepository } from "../packages/repository/src/SqliteUserSettingsRepository.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteBudgetUserRepository } from "../packages/repository/src/SqliteBudgetUserRepository.js";
import { SqliteBackupRecordRepository } from "../packages/repository/src/SqliteBackupRecordRepository.js";
import { AuthApplicationService } from "../packages/application/src/AuthApplicationService.js";
import { UserBudgetApplicationService } from "../packages/application/src/UserBudgetApplicationService.js";
import { BackupApplicationService } from "../packages/application/src/BackupApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");

  const userRepo = new SqliteUserRepository(db);
  const budgetUserRepo = new SqliteBudgetUserRepository(db);

  const auth = new AuthApplicationService(
    userRepo,
    new SqliteSessionRepository(db),
    new SqliteUserSettingsRepository(db),
  );

  const userBudgets = new UserBudgetApplicationService(
    new SqliteBudgetRepository(db),
    budgetUserRepo,
  );

  const backups = new BackupApplicationService(
    new SqliteBackupRecordRepository(db),
    budgetUserRepo,
  );

  const user = await auth.signUp("Stewart", null, "password123");
  const budget = await userBudgets.createBudgetForUser(
    user.id,
    "Household Budget",
  );

  console.log(
    await backups.recordBackup(user.id, budget.id, "backups/household.budget"),
  );
  console.log(
    await backups.restoreBudget(user.id, budget.id, "backups/household.budget"),
  );
}

main();
