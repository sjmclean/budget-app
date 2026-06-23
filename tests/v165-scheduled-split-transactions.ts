import assert from "node:assert/strict";
import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createCategoryGroup } from "../packages/budget-engine/src/services/createCategoryGroup.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createScheduledSplitTransaction } from "../packages/budget-engine/src/services/createScheduledSplitTransaction.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { ScheduledFrequency } from "../packages/types/src/ScheduledFrequency.js";
import { TransactionType } from "../packages/types/src/TransactionType.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteCategoryGroupRepository } from "../packages/repository/src/SqliteCategoryGroupRepository.js";
import { SqliteCategoryRepository } from "../packages/repository/src/SqliteCategoryRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteScheduledTransactionRepository } from "../packages/repository/src/SqliteScheduledTransactionRepository.js";
import { SqliteScheduledTransactionSplitLineRepository } from "../packages/repository/src/SqliteScheduledTransactionSplitLineRepository.js";
import { resetDatabase } from "./reset.js";

async function testCreateScheduledSplitTransaction() {
  const result = createScheduledSplitTransaction({
    budgetId: "budget-1",
    accountId: "account-1",
    payeeId: "payee-1",
    amount: -15000,
    memo: "Fortnightly split bill",
    nextDueDate: "2026-07-01",
    frequency: ScheduledFrequency.EveryTwoWeeks,
    lines: [
      { categoryId: "category-rent", amount: -10000, memo: "Rent share" },
      { categoryId: "category-utilities", amount: -5000, memo: "Utilities share" },
    ],
  });

  assert.equal(result.scheduledTransaction.type, TransactionType.Split);
  assert.equal(result.scheduledTransaction.categoryId, null);
  assert.equal(result.scheduledTransaction.amount, -15000);
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0].scheduledTransactionId, result.scheduledTransaction.id);
  assert.equal(result.lines[0].sortOrder, 0);
  assert.equal(result.lines[1].sortOrder, 1);
}

async function testRejectsUnbalancedScheduledSplitTransaction() {
  assert.throws(() =>
    createScheduledSplitTransaction({
      budgetId: "budget-1",
      accountId: "account-1",
      amount: -15000,
      nextDueDate: "2026-07-01",
      frequency: ScheduledFrequency.Monthly,
      lines: [
        { categoryId: "category-rent", amount: -10000 },
        { categoryId: "category-utilities", amount: -4000 },
      ],
    }),
  );
}

async function testPersistScheduledSplitTransactionLines() {
  resetDatabase();
  const db = createDatabase("Test.budget");

  const budgetRepo = new SqliteBudgetRepository(db);
  const groupRepo = new SqliteCategoryGroupRepository(db);
  const categoryRepo = new SqliteCategoryRepository(db);
  const accountRepo = new SqliteAccountRepository(db);
  const scheduledRepo = new SqliteScheduledTransactionRepository(db);
  const scheduledSplitRepo = new SqliteScheduledTransactionSplitLineRepository(db);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);

  const group = createCategoryGroup(budget.id, "Bills", 0);
  await groupRepo.create(group);

  const rent = createCategory(group.id, "Rent", 0);
  const electricity = createCategory(group.id, "Electricity", 1);
  await categoryRepo.create(rent);
  await categoryRepo.create(electricity);

  const checking = createAccount(
    budget.id,
    "Checking",
    AccountType.Checking,
    BudgetParticipation.OnBudget,
    0,
  );
  await accountRepo.create(checking);

  const result = createScheduledSplitTransaction({
    budgetId: budget.id,
    accountId: checking.id,
    amount: -150000,
    memo: "Scheduled household bill",
    nextDueDate: "2026-07-15",
    frequency: ScheduledFrequency.Monthly,
    lines: [
      { categoryId: rent.id, amount: -120000, memo: "Rent" },
      { categoryId: electricity.id, amount: -30000, memo: "Electricity" },
    ],
  });

  await scheduledRepo.create(result.scheduledTransaction);
  await scheduledSplitRepo.createMany(result.lines);

  const scheduled = await scheduledRepo.findActiveByBudget(budget.id);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].type, TransactionType.Split);
  assert.equal(scheduled[0].amount, -150000);

  const lines = await scheduledSplitRepo.findByScheduledTransaction(result.scheduledTransaction.id);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].categoryId, rent.id);
  assert.equal(lines[0].amount, -120000);
  assert.equal(lines[0].memo, "Rent");
  assert.equal(lines[1].categoryId, electricity.id);
  assert.equal(lines[1].amount, -30000);
  assert.equal(lines[1].sortOrder, 1);
}

await testCreateScheduledSplitTransaction();
await testRejectsUnbalancedScheduledSplitTransaction();
await testPersistScheduledSplitTransactionLines();
console.log("v1.65 scheduled split transaction tests passed");
