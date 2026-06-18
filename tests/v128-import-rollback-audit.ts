import { unlinkSync } from "fs";
import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { createImportMap, createImportRun } from "../packages/budget-engine/src/services/createImportRun.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { ImportSource } from "../packages/types/src/ImportRun.js";
import { DomainEventType } from "../packages/types/src/DomainEventType.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { SqliteImportRunRepository } from "../packages/repository/src/SqliteImportRunRepository.js";
import { SqliteImportMapRepository } from "../packages/repository/src/SqliteImportMapRepository.js";
import { SqliteDomainEventRepository } from "../packages/repository/src/SqliteDomainEventRepository.js";
import { AuditApplicationService } from "../packages/application/src/AuditApplicationService.js";
import { ImportRollbackApplicationService } from "../packages/application/src/ImportRollbackApplicationService.js";

const dbPath = "/tmp/budget-v128-import-rollback.sqlite";
try { unlinkSync(dbPath); } catch {}
const db = createDatabase(dbPath);
const budgetRepo = new SqliteBudgetRepository(db);
const accountRepo = new SqliteAccountRepository(db);
const txRepo = new SqliteTransactionRepository(db);
const importRunRepo = new SqliteImportRunRepository(db);
const importMapRepo = new SqliteImportMapRepository(db);
const audit = new AuditApplicationService(new SqliteDomainEventRepository(db));
const rollback = new ImportRollbackApplicationService(db);

const budget = createBudget("v1.2.8 Import Rollback", "AUD");
await budgetRepo.create(budget);
const account = createAccount(budget.id, "Imported Cheque", AccountType.Checking, BudgetParticipation.OnBudget, 0);
await accountRepo.create(account);
const tx = createTransaction({ budgetId: budget.id, accountId: account.id, date: "2026-06-17", amount: -4200 });
await txRepo.create(tx);
const run = createImportRun({ budgetId: budget.id, userId: "user-1", source: ImportSource.YNAB4, sourceFileName: "Budget.ynab4" });
await importRunRepo.create(run);
await importMapRepo.create(createImportMap({ importRunId: run.id, sourceEntityType: "Account", sourceEntityId: "ynab-account-1", targetEntityType: "account", targetEntityId: account.id }));
await importMapRepo.create(createImportMap({ importRunId: run.id, sourceEntityType: "Transaction", sourceEntityId: "ynab-tx-1", targetEntityType: "transaction", targetEntityId: tx.id }));
await audit.record({ budgetId: budget.id, type: DomainEventType.TransactionCreated, entityId: tx.id, payload: { source: "YNAB4" } });

const result = await rollback.undoImportRun(run.id);
if (result.status !== "rolled_back") throw new Error("Expected import run rollback status");
if ((await txRepo.getById(tx.id)) !== null) throw new Error("Expected imported transaction to be removed");
if ((await accountRepo.getById(account.id)) !== null) throw new Error("Expected imported account to be removed");
const events = await audit.history(budget.id);
if (events.length !== 1) throw new Error("Expected audit event to be recorded");
console.log("v1.2.8 import rollback and audit wiring OK");
