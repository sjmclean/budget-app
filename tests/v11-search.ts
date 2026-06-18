import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createCategoryGroup } from "../packages/budget-engine/src/services/createCategoryGroup.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { createPayee } from "../packages/budget-engine/src/services/createPayee.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { createTransactionAttachment } from "../packages/budget-engine/src/services/createTransactionAttachment.js";
import { SearchApplicationService } from "../packages/application/src/SearchApplicationService.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteCategoryGroupRepository } from "../packages/repository/src/SqliteCategoryGroupRepository.js";
import { SqliteCategoryRepository } from "../packages/repository/src/SqliteCategoryRepository.js";
import { SqlitePayeeRepository } from "../packages/repository/src/SqlitePayeeRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { SqliteTransactionAttachmentRepository } from "../packages/repository/src/SqliteTransactionAttachmentRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const accountRepo = new SqliteAccountRepository(db);
  const groupRepo = new SqliteCategoryGroupRepository(db);
  const categoryRepo = new SqliteCategoryRepository(db);
  const payeeRepo = new SqlitePayeeRepository(db);
  const transactionRepo = new SqliteTransactionRepository(db);
  const attachmentRepo = new SqliteTransactionAttachmentRepository(db);

  const service = new SearchApplicationService(accountRepo, groupRepo, categoryRepo, payeeRepo, transactionRepo, attachmentRepo);
  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);

  const account = createAccount(budget.id, "Everyday Checking", AccountType.Checking, BudgetParticipation.OnBudget, 0);
  await accountRepo.create(account);
  const group = createCategoryGroup(budget.id, "Living Expenses");
  await groupRepo.create(group);
  const category = createCategory(group.id, "Groceries");
  await categoryRepo.create(category);
  const payee = createPayee(budget.id, "Local Market");
  await payeeRepo.create(payee);
  const transaction = createTransaction({ budgetId: budget.id, accountId: account.id, payeeId: payee.id, categoryId: category.id, date: "2026-06-17", amount: -4250, memo: "Weekly groceries" });
  await transactionRepo.create(transaction);
  const attachment = createTransactionAttachment({ budgetId: budget.id, transactionId: transaction.id, originalFileName: "market-receipt.pdf", mimeType: "application/pdf", fileSize: 123, relativePath: "Attachments", content: "receipt" });
  await attachmentRepo.create(attachment);

  const groceries = await service.searchBudget(budget.id, "groceries");
  if (groceries.categories.length !== 1) throw new Error("Expected category search hit");
  if (groceries.transactions.length !== 1) throw new Error("Expected transaction memo search hit");

  const receipt = await service.searchBudget(budget.id, "receipt");
  if (receipt.attachments.length !== 1) throw new Error("Expected attachment search hit");

  const empty = await service.searchBudget(budget.id, "   ");
  if (empty.accounts.length || empty.categories.length || empty.payees.length || empty.transactions.length || empty.attachments.length) {
    throw new Error("Expected blank search to return no results");
  }

  console.log("PASS: search finds categories and transaction memos");
  console.log("PASS: search finds attachment filenames");
  console.log("PASS: blank search returns empty result set");
  console.log("v1.1 search service OK");
}

main();
