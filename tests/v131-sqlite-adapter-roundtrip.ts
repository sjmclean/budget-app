import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase } from "../packages/database/src/index.js";
import { SqliteAccountRepository } from "../packages/repository/src/SqliteAccountRepository.js";
import { SqlitePayeeRepository } from "../packages/repository/src/SqlitePayeeRepository.js";
import {
  createSqliteAccountPersistenceAdapter,
  DEFAULT_SQLITE_BUDGET_ID,
} from "../apps/web/src/features/persistence/sqliteAccountPersistenceAdapter.js";
import { createSqlitePayeePersistenceAdapter } from "../apps/web/src/features/persistence/sqlitePayeePersistenceAdapter.js";

const tempDir = mkdtempSync(join(tmpdir(), "budget-app-v131-"));
const db = createDatabase(join(tempDir, "adapter-roundtrip.sqlite"));

try {
  await validateAccountAdapterRoundTrip();
  await validatePayeeAdapterRoundTrip();
  console.log("v1.31 SQLite adapter round-trip checks OK");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

async function validateAccountAdapterRoundTrip(): Promise<void> {
  const repository = new SqliteAccountRepository(db);
  const adapter = createSqliteAccountPersistenceAdapter({
    repository,
    budgetId: DEFAULT_SQLITE_BUDGET_ID,
  });

  let accounts = await adapter.createAccount({
    name: "Everyday Account",
    type: "on-budget",
    startingBalance: 12500,
  });

  assertEqual(accounts.length, 1, "account create should return one account");
  assertEqual(accounts[0]?.id, "everyday-account", "account id should be derived from name");
  assertEqual(accounts[0]?.name, "Everyday Account", "account name should round-trip");
  assertEqual(accounts[0]?.type, "on-budget", "account type should map to on-budget");
  assertEqual(accounts[0]?.startingBalance, 12500, "account opening balance should round-trip");

  const createdRecord = await repository.getById("everyday-account");
  assertExists(createdRecord, "repository should contain created account");
  assertEqual(createdRecord.budgetId, DEFAULT_SQLITE_BUDGET_ID, "account budgetId should be written");
  assertEqual(createdRecord.type, "Checking", "on-budget account should map to SQLite Checking type");
  assertEqual(createdRecord.participation, "OnBudget", "on-budget account should map to OnBudget participation");
  assertEqual(createdRecord.openingBalance, 12500, "opening balance should be stored");
  assertEqual(createdRecord.currentBalance, 12500, "current balance should initially match opening balance");

  accounts = await adapter.updateAccount({
    id: "everyday-account",
    name: "Everyday Renamed",
    type: "tracking",
  });

  assertEqual(accounts.length, 1, "account update should preserve account count");
  assertEqual(accounts[0]?.name, "Everyday Renamed", "updated account name should round-trip");
  assertEqual(accounts[0]?.type, "tracking", "tracking account type should round-trip");

  const updatedRecord = await repository.getById("everyday-account");
  assertExists(updatedRecord, "repository should contain updated account");
  assertEqual(updatedRecord.name, "Everyday Renamed", "repository account name should update");
  assertEqual(updatedRecord.type, "Checking", "tracking account should still use a concrete SQLite account type");
  assertEqual(updatedRecord.participation, "OffBudget", "tracking account should map to OffBudget participation");

  const cachedAccount = adapter.getAccountById("everyday-account");
  assertExists(cachedAccount, "adapter should cache account after list/update");
  assertEqual(cachedAccount.name, "Everyday Renamed", "cached account should reflect latest list result");

  accounts = await adapter.createAccount({
    name: "Visa Card",
    type: "credit-card",
    startingBalance: -2500,
  });

  const creditCard = accounts.find((account) => account.id === "visa-card");
  assertExists(creditCard, "credit card account should be present after creation");
  assertEqual(creditCard.type, "credit-card", "credit card type should round-trip");

  const creditCardRecord = await repository.getById("visa-card");
  assertExists(creditCardRecord, "repository should contain credit card account");
  assertEqual(creditCardRecord.type, "CreditCard", "credit card should map to SQLite CreditCard type");
  assertEqual(creditCardRecord.participation, "OnBudget", "credit card should remain OnBudget");
}

async function validatePayeeAdapterRoundTrip(): Promise<void> {
  const repository = new SqlitePayeeRepository(db);
  const fixedNow = new Date("2026-06-21T07:00:00.000Z");
  const adapter = createSqlitePayeePersistenceAdapter({
    repository,
    budgetId: DEFAULT_SQLITE_BUDGET_ID,
    now: () => fixedNow,
  });

  let payees = await adapter.recordPayee("  Local   Grocer  ");

  assertEqual(payees.length, 1, "recordPayee should create one payee");
  assertEqual(payees[0]?.id, "local-grocer", "payee id should be derived from normalized display name");
  assertEqual(payees[0]?.name, "Local Grocer", "payee name should be normalised for display");
  assertEqual(payees[0]?.lastUsedAt, fixedNow.toISOString(), "payee lastUsedAt should map from updatedAt");

  const createdPayee = await repository.findById("local-grocer");
  assertExists(createdPayee, "repository should contain created payee");
  assertEqual(createdPayee.budgetId, DEFAULT_SQLITE_BUDGET_ID, "payee budgetId should be written");
  assertEqual(createdPayee.normalizedName, "local grocer", "normalizedName should be persisted");
  assertEqual(createdPayee.isArchived, false, "payee should be active by default");
  assertEqual(createdPayee.isTransfer, false, "payee should not be marked as transfer by default");

  payees = await adapter.recordPayee("local grocer");
  assertEqual(payees.length, 1, "recording a duplicate normalized payee should not create another row");

  payees = await adapter.recordPayees(["Fuel Station", "Transfer: Savings", "Coffee Shop"]);
  assertEqual(payees.length, 3, "recordPayees should create non-transfer payees and ignore transfer pseudo-payees");
  assertExists(payees.find((payee) => payee.id === "fuel-station"), "fuel station should be created");
  assertExists(payees.find((payee) => payee.id === "coffee-shop"), "coffee shop should be created");
  assertMissing(payees.find((payee) => payee.name === "Transfer: Savings"), "transfer pseudo-payee should not be created");

  payees = await adapter.renamePayee({ id: "fuel-station", name: "Fuel & Snacks" });
  const renamed = payees.find((payee) => payee.id === "fuel-station");
  assertExists(renamed, "renamed payee should still exist");
  assertEqual(renamed.name, "Fuel & Snacks", "renamed payee should round-trip through repository");

  const renamedRecord = await repository.findById("fuel-station");
  assertExists(renamedRecord, "repository should contain renamed payee");
  assertEqual(renamedRecord.normalizedName, "fuel & snacks", "renamed payee normalizedName should update");

  payees = await adapter.renamePayee({ id: "coffee-shop", name: "Fuel & Snacks" });
  assertEqual(payees.length, 2, "renaming to an existing normalized payee should merge by deleting duplicate target");
  assertMissing(await repository.findById("coffee-shop"), "duplicate payee should be deleted during merge-style rename");

  payees = await adapter.deletePayee("fuel-station");
  assertMissing(payees.find((payee) => payee.id === "fuel-station"), "deleted payee should not appear in adapter list");
  assertMissing(await repository.findById("fuel-station"), "deleted payee should be removed from repository");
}

function assertExists<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

function assertMissing(value: unknown, message: string): void {
  if (value !== null && value !== undefined) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
