import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../packages/database/src/db.js";
import {
  SqliteBudgetRepository,
  SqliteAccountRepository,
  SqliteTransactionRepository,
  SqlitePayeeRepository,
} from "../packages/repository/src/index.js";
import {
  createBudget,
  createAccount,
  createPayee,
  createTransaction,
} from "../packages/budget-engine/src/index.js";
import {
  AccountType,
  BudgetParticipation,
  ClearedStatus,
} from "../packages/types/src/index.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const dbPath = join(
  mkdtempSync(join(tmpdir(), "v1211-contracts-")),
  "contract.sqlite",
);
const db = createDatabase(dbPath);
const budgetRepo = new SqliteBudgetRepository(db);
const accountRepo = new SqliteAccountRepository(db);
const payeeRepo = new SqlitePayeeRepository(db);
const txRepo = new SqliteTransactionRepository(db);

const budget = createBudget("Contract Budget", "AUD");
await budgetRepo.create(budget);

const positional = createAccount(
  budget.id,
  "Everyday",
  AccountType.Checking,
  BudgetParticipation.OnBudget,
  1000,
);
const objectStyle = createAccount({
  budgetId: budget.id,
  name: "Savings",
  type: AccountType.Savings,
  participation: BudgetParticipation.OnBudget,
  openingBalance: 2000,
});
await accountRepo.create(positional);
await accountRepo.create(objectStyle);

const payee = createPayee(budget.id, "Woolworths");
await payeeRepo.create(payee);

const tx = createTransaction({
  budgetId: budget.id,
  accountId: positional.id,
  payeeId: payee.id,
  date: "2026-06-18",
  amount: -1234,
  clearedStatus: ClearedStatus.Cleared,
  memo: "contract test",
});
await txRepo.create(tx);

const loadedAccounts = await accountRepo.findByBudget(budget.id);
const loadedTransactions = await txRepo.findByBudget(budget.id);

assert(
  loadedAccounts.length === 2,
  "Expected both account factory calling styles to persist",
);
assert(
  loadedAccounts.some((account) => account.currentBalance === 1000),
  "Expected positional account balance to round-trip",
);
assert(
  loadedAccounts.some((account) => account.currentBalance === 2000),
  "Expected object-style account balance to round-trip",
);
assert(
  loadedTransactions.length === 1 &&
    loadedTransactions[0].memo === "contract test",
  "Expected transaction factory/repository contract to round-trip",
);

console.log("PASS: v1.2.11 factory/repository contract tests");
