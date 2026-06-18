import { createDatabase } from "../packages/database/src/db.js";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createUser } from "../packages/budget-engine/src/services/createUser.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createBudgetUser } from "../packages/budget-engine/src/services/createBudgetUser.js";
import { BudgetRole } from "../packages/types/src/BudgetRole.js";
import { SqliteUserRepository } from "../packages/repository/src/SqliteUserRepository.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteBudgetUserRepository } from "../packages/repository/src/SqliteBudgetUserRepository.js";
import { SqliteTransactionAttachmentRepository } from "../packages/repository/src/SqliteTransactionAttachmentRepository.js";
import { AttachmentApplicationService } from "../packages/application/src/AttachmentApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const folder = mkdtempSync(join(tmpdir(), "budget-attachments-"));

  try {
    const db = createDatabase("Test.budget");

    const user = createUser("Stewart", null, "password123");
    const budget = createBudget("Household Budget");

    const userRepo = new SqliteUserRepository(db);
    const budgetRepo = new SqliteBudgetRepository(db);
    const budgetUserRepo = new SqliteBudgetUserRepository(db);
    const attachmentRepo = new SqliteTransactionAttachmentRepository(db);

    await userRepo.create(user);
    await budgetRepo.create(budget);
    await budgetUserRepo.create(createBudgetUser(budget.id, user.id, BudgetRole.Owner));

    const service = new AttachmentApplicationService(attachmentRepo, budgetUserRepo);

    const attachment = await service.attachFile({
      userId: user.id,
      budgetId: budget.id,
      transactionId: "transaction-1",
      budgetFolder: folder,
      attachmentsFolderName: "Household.attachments",
      originalFileName: "receipt.txt",
      mimeType: "text/plain",
      content: "Receipt content"
    });

    console.log(attachment);
    console.log(await service.listForTransaction(user.id, budget.id, "transaction-1"));
    console.log(await service.verifyBudgetAttachments(user.id, budget.id, folder));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

main();
