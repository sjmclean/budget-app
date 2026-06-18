import { createDatabase } from "../packages/database/src/db.js";
import { createUser } from "../packages/budget-engine/src/services/createUser.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createBudgetUser } from "../packages/budget-engine/src/services/createBudgetUser.js";
import { BudgetRole } from "../packages/types/src/BudgetRole.js";
import { SqliteUserRepository } from "../packages/repository/src/SqliteUserRepository.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteBudgetUserRepository } from "../packages/repository/src/SqliteBudgetUserRepository.js";
import { SqliteBackupVersionRepository } from "../packages/repository/src/SqliteBackupVersionRepository.js";
import { BackupVersionApplicationService } from "../packages/application/src/BackupVersionApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");

  const userRepo = new SqliteUserRepository(db);
  const budgetRepo = new SqliteBudgetRepository(db);
  const budgetUserRepo = new SqliteBudgetUserRepository(db);
  const backupRepo = new SqliteBackupVersionRepository(db);

  const user = createUser("Stewart", null, "password123");
  const budget = createBudget("Household Budget");

  await userRepo.create(user);
  await budgetRepo.create(budget);
  await budgetUserRepo.create(
    createBudgetUser(budget.id, user.id, BudgetRole.Owner),
  );

  const service = new BackupVersionApplicationService(
    backupRepo,
    budgetUserRepo,
  );

  console.log(
    await service.createManualBackup({
      budgetId: budget.id,
      userId: user.id,
      filePath: "backups/household-manual-1.budget",
      fileSize: 1024,
      note: "Before major changes",
    }),
  );

  console.log(
    await service.createAutomaticBackup({
      budgetId: budget.id,
      userId: user.id,
      filePath: "backups/household-auto-1.budget",
      fileSize: 1024,
    }),
  );

  console.log(await service.listBackups(user.id, budget.id));
}

main();
