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
import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";
import { createSqlitePersistenceGateway } from "../apps/web/src/features/persistence/sqlitePersistenceGateway.js";
import { getAppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGatewayFactory.js";

const tempDir = mkdtempSync(join(tmpdir(), "budget-app-v133-"));
const db = createDatabase(join(tempDir, "gateway-repository-wiring.sqlite"));

try {
  await validateSqliteGatewayUsesRealRepositories();
  console.log("v1.33 SQLite gateway repository wiring checks OK");
} finally {
  db.$client.close();
  rmSync(tempDir, { recursive: true, force: true });
}

async function validateSqliteGatewayUsesRealRepositories(): Promise<void> {
  const accountRepository = new SqliteAccountRepository(db);
  const payeeRepository = new SqlitePayeeRepository(db);

  const accounts = createSqliteAccountPersistenceAdapter({
    repository: accountRepository,
    budgetId: DEFAULT_SQLITE_BUDGET_ID,
  });

  const payees = createSqlitePayeePersistenceAdapter({
    repository: payeeRepository,
    budgetId: DEFAULT_SQLITE_BUDGET_ID,
    now: () => new Date("2026-06-21T09:30:00.000Z"),
  });

  const sqliteGateway = createSqlitePersistenceGateway({
    accounts,
    payees,
    accountRegisters: browserLocalStoragePersistenceGateway.accountRegisters,
    budgetView: browserLocalStoragePersistenceGateway.budgetView,
    categories: browserLocalStoragePersistenceGateway.categories,
    scheduledTransactions: browserLocalStoragePersistenceGateway.scheduledTransactions,
  });

  const selectedGateway = getAppPersistenceGateway("sqlite-adapter", sqliteGateway);

  assertEqual(
    selectedGateway.metadata.kind,
    "sqlite-adapter",
    "explicit SQLite gateway selection should return the SQLite gateway",
  );

  await validateAccountsThroughGateway(selectedGateway.accounts, accountRepository);
  await validatePayeesThroughGateway(selectedGateway.payees, payeeRepository);
}

async function validateAccountsThroughGateway(
  accounts: ReturnType<typeof createSqliteAccountPersistenceAdapter>,
  repository: SqliteAccountRepository,
): Promise<void> {
  let accountViews = await accounts.createAccount({
    name: "Operating Account",
    type: "on-budget",
    startingBalance: 100000,
  });

  assertEqual(accountViews.length, 1, "gateway account create should return one account");
  assertEqual(accountViews[0]?.id, "operating-account", "gateway should expose adapter-created account id");

  const createdRecord = await repository.getById("operating-account");
  assertExists(createdRecord, "real account repository should contain gateway-created account");
  assertEqual(createdRecord.budgetId, DEFAULT_SQLITE_BUDGET_ID, "account budget id should be persisted");
  assertEqual(createdRecord.name, "Operating Account", "account name should persist through repository");
  assertEqual(createdRecord.type, "Checking", "on-budget UI account should map to SQLite Checking type");
  assertEqual(createdRecord.participation, "OnBudget", "on-budget UI account should map to OnBudget participation");

  accountViews = await accounts.updateAccount({
    id: "operating-account",
    name: "Operating Renamed",
    type: "tracking",
  });

  assertEqual(accountViews[0]?.name, "Operating Renamed", "updated gateway account should round-trip");
  assertEqual(accountViews[0]?.type, "tracking", "updated gateway account type should round-trip");

  const updatedRecord = await repository.getById("operating-account");
  assertExists(updatedRecord, "real account repository should contain updated account");
  assertEqual(updatedRecord.name, "Operating Renamed", "repository account name should update");
  assertEqual(updatedRecord.participation, "OffBudget", "tracking UI account should map to OffBudget participation");
}

async function validatePayeesThroughGateway(
  payees: ReturnType<typeof createSqlitePayeePersistenceAdapter>,
  repository: SqlitePayeeRepository,
): Promise<void> {
  let payeeViews = await payees.recordPayee("  Corner   Store  ");

  assertEqual(payeeViews.length, 1, "gateway payee create should return one payee");
  assertEqual(payeeViews[0]?.id, "corner-store", "gateway should expose adapter-created payee id");
  assertEqual(payeeViews[0]?.name, "Corner Store", "gateway should normalise payee display name");

  const createdRecord = await repository.findById("corner-store");
  assertExists(createdRecord, "real payee repository should contain gateway-created payee");
  assertEqual(createdRecord.budgetId, DEFAULT_SQLITE_BUDGET_ID, "payee budget id should be persisted");
  assertEqual(createdRecord.normalizedName, "corner store", "payee normalized name should persist");
  assertEqual(createdRecord.isArchived, false, "gateway-created payee should be active");

  payeeViews = await payees.renamePayee({
    id: "corner-store",
    name: "Corner Market",
  });

  const renamedView = payeeViews.find((payee) => payee.id === "corner-store");
  assertExists(renamedView, "renamed payee should remain visible through gateway");
  assertEqual(renamedView.name, "Corner Market", "renamed payee should round-trip through gateway");

  const renamedRecord = await repository.findById("corner-store");
  assertExists(renamedRecord, "real payee repository should contain renamed payee");
  assertEqual(renamedRecord.name, "Corner Market", "repository payee name should update");
  assertEqual(renamedRecord.normalizedName, "corner market", "repository normalized payee name should update");
}

function assertExists<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
