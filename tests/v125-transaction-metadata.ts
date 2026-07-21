import { createTemporaryDatabase } from "./support/persistence/temporaryDatabase.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createAccount } from "../packages/budget-engine/src/services/createAccount.js";
import { createTransaction } from "../packages/budget-engine/src/services/createTransaction.js";
import { AccountType } from "../packages/types/src/AccountType.js";
import { BudgetParticipation } from "../packages/types/src/BudgetParticipation.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqliteTransactionRepository } from "../packages/repository/src/SqliteTransactionRepository.js";
import { SqliteTransactionNoteRepository } from "../packages/repository/src/SqliteTransactionNoteRepository.js";
import { SqliteTransactionTagRepository } from "../packages/repository/src/SqliteTransactionTagRepository.js";
import { SqliteTransactionTagAssignmentRepository } from "../packages/repository/src/SqliteTransactionTagAssignmentRepository.js";
import { TransactionMetadataApplicationService } from "../packages/application/src/TransactionMetadataApplicationService.js";
import { ClearedStatus } from "../packages/types/src/ClearedStatus.js";

const { db, cleanup } = createTemporaryDatabase("budget-v125-metadata");

const budgetRepo = new SqliteBudgetRepository(db);
const accountRepo = new SqliteAccountRepository(db);
const transactionRepo = new SqliteTransactionRepository(db);
const noteRepo = new SqliteTransactionNoteRepository(db);
const tagRepo = new SqliteTransactionTagRepository(db);
const assignmentRepo = new SqliteTransactionTagAssignmentRepository(db);
const metadataService = new TransactionMetadataApplicationService(transactionRepo, noteRepo, tagRepo, assignmentRepo);

const budget = createBudget("v1.2.5 Metadata", "AUD");
await budgetRepo.create(budget);
const account = createAccount(budget.id, "Everyday", AccountType.Checking, BudgetParticipation.OnBudget, 100000);
await accountRepo.create(account);
const transaction = createTransaction({ budgetId: budget.id, accountId: account.id, payeeId: null, categoryId: null, date: "2026-06-17", amount: -2500, memo: "Groceries" });
await transactionRepo.create(transaction);

const note = await metadataService.addNote(transaction.id, "  Imported note  ");
if (note.note !== "Imported note") throw new Error("Expected note trimming");
const editedNote = await metadataService.editNote(note, "Updated note");
if (editedNote.note !== "Updated note") throw new Error("Expected note update");
if ((await metadataService.listNotes(transaction.id)).length !== 1) throw new Error("Expected one note");
await metadataService.deleteNote(note.id);
if ((await metadataService.listNotes(transaction.id)).length !== 0) throw new Error("Expected note delete");

const tag = await metadataService.createTag(budget.id, " Tax Deductible ", "green");
await metadataService.assignTag(transaction.id, tag.id);
await metadataService.assignTag(transaction.id, tag.id);
const tags = await metadataService.listTransactionTags(transaction.id);
if (tags.length !== 1 || tags[0].name !== "Tax Deductible") throw new Error("Expected idempotent tag assignment");
await metadataService.removeTag(transaction.id, tag.id);
if ((await metadataService.listTransactionTags(transaction.id)).length !== 0) throw new Error("Expected tag removal");

const cleared = await metadataService.setClearedStatus(transaction.id, ClearedStatus.Cleared);
if (cleared.clearedStatus !== ClearedStatus.Cleared) throw new Error("Expected cleared status update");

console.log("v1.2.5 transaction metadata OK");
cleanup();
