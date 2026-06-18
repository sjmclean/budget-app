import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { accountBalances } from "../packages/budget-engine/src/reports/accountBalances.js";
import { spendingByCategory } from "../packages/budget-engine/src/reports/spendingByCategory.js";
import { netWorth } from "../packages/budget-engine/src/reports/netWorth.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
const budgetId = "budget"; const checking = createAccount(budgetId, "Checking", AccountType.Checking, BudgetParticipation.OnBudget, 500000); const groceries = createCategory("food", "Groceries"); const tx = createTransaction({ budgetId, accountId: checking.id, categoryId: groceries.id, date: "2026-06-17", amount: -15000 }); console.log(accountBalances([checking], [tx])); console.log(spendingByCategory([groceries], [tx])); console.log(netWorth([checking], [tx]));
