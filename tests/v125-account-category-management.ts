import { createTemporaryDatabase } from "./support/persistence/temporaryDatabase.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createAccountSettings } from "../packages/budget-engine/src/services/createAccountSettings.js";
import { createCategoryGroup } from "../packages/budget-engine/src/services/createCategoryGroup.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { createCategorySettings } from "../packages/budget-engine/src/services/createCategorySettings.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteAccountSettingsRepository } from "../packages/repository/src/SqliteAccountSettingsRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { SqliteCategoryGroupRepository } from "../packages/repository/src/SqliteCategoryGroupRepository.js";
import { SqliteCategoryRepository } from "../packages/repository/src/SqliteCategoryRepository.js";
import { SqliteCategorySettingsRepository } from "../packages/repository/src/SqliteCategorySettingsRepository.js";
import { AccountManagementApplicationService } from "../packages/application/src/AccountManagementApplicationService.js";
import { CategoryManagementApplicationService } from "../packages/application/src/CategoryManagementApplicationService.js";

const { db, cleanup } = createTemporaryDatabase("budget-v125-account-category");
const budgetRepo = new SqliteBudgetRepository(db);
const accountRepo = new SqliteAccountRepository(db);
const accountSettingsRepo = new SqliteAccountSettingsRepository(db);
const transactionRepo = new SqliteTransactionRepository(db);
const groupRepo = new SqliteCategoryGroupRepository(db);
const categoryRepo = new SqliteCategoryRepository(db);
const categorySettingsRepo = new SqliteCategorySettingsRepository(db);
const accountService = new AccountManagementApplicationService(accountRepo, accountSettingsRepo, transactionRepo);
const categoryService = new CategoryManagementApplicationService(categoryRepo, groupRepo, categorySettingsRepo);

const budget = createBudget("v1.2.5 Account Category", "AUD");
await budgetRepo.create(budget);
const account = createAccount(budget.id, "Old Name", AccountType.Checking, BudgetParticipation.OnBudget, 0);
await accountRepo.create(account);
await accountSettingsRepo.create(createAccountSettings(account.id, 1));

const renamedAccount = await accountService.renameAccount(account.id, "New Name");
if (renamedAccount.name !== "New Name") throw new Error("Expected account rename");
const closed = await accountService.closeAccount(account.id);
if (!closed.closed) throw new Error("Expected account close");
const reopened = await accountService.reopenAccount(account.id);
if (reopened.closed) throw new Error("Expected account reopen");
const hidden = await accountService.setHidden(account.id, true);
if (!hidden.hidden) throw new Error("Expected hidden account setting");

const group = createCategoryGroup(budget.id, "Bills", 1);
await groupRepo.create(group);
const movedGroup = createCategoryGroup(budget.id, "Savings", 2);
await groupRepo.create(movedGroup);
const category = createCategory(group.id, "Power", 1);
await categoryRepo.create(category);
await categorySettingsRepo.create(createCategorySettings(category.id));

const renamedCategory = await categoryService.renameCategory(category.id, "Electricity");
if (renamedCategory.name !== "Electricity") throw new Error("Expected category rename");
const moved = await categoryService.moveCategory(category.id, movedGroup.id, 5);
if (moved.groupId !== movedGroup.id || moved.sortOrder !== 5) throw new Error("Expected category move");
const renamedGroup = await categoryService.renameGroup(group.id, "Monthly Bills");
if (renamedGroup.name !== "Monthly Bills") throw new Error("Expected group rename");
const categoryHidden = await categoryService.setHidden(category.id, true);
if (!categoryHidden.hidden) throw new Error("Expected category hide");
const pinned = await categoryService.setPinned(category.id, true);
if (!pinned.pinned) throw new Error("Expected category pin");

console.log("v1.2.5 account/category management OK");
cleanup();
