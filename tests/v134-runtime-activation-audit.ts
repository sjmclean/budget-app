import assert from "node:assert/strict";

import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";
import { createSqlitePersistenceGateway } from "../apps/web/src/features/persistence/sqlitePersistenceGateway.js";
import { getAppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGatewayFactory.js";
import type { AccountPersistencePort } from "../apps/web/src/features/accounts/accountPersistencePort.js";
import type { PayeePersistencePort } from "../apps/web/src/features/accounts/payeePersistencePort.js";

const sqliteAccountsStub = {} as AccountPersistencePort;
const sqlitePayeesStub = {} as PayeePersistencePort;

const defaultGateway = getAppPersistenceGateway();

assert.equal(
  defaultGateway.metadata.kind,
  "browser-local-storage",
  "browser runtime must remain localStorage-backed by default after v1.34 audit",
);

const sqliteGateway = createSqlitePersistenceGateway({
  accounts: sqliteAccountsStub,
  payees: sqlitePayeesStub,
  accountRegisters: browserLocalStoragePersistenceGateway.accountRegisters,
  budgetView: browserLocalStoragePersistenceGateway.budgetView,
  categories: browserLocalStoragePersistenceGateway.categories,
  scheduledTransactions: browserLocalStoragePersistenceGateway.scheduledTransactions,
});

assert.equal(
  sqliteGateway.metadata.kind,
  "sqlite-adapter",
  "explicit SQLite gateway composition should remain available for adapter validation",
);

assert.equal(
  sqliteGateway.metadata.isProductionPersistence,
  false,
  "SQLite gateway must not be marked production persistence while runtime-critical domains remain browser-backed",
);

assert.strictEqual(
  sqliteGateway.accounts,
  sqliteAccountsStub,
  "SQLite gateway should use the supplied SQLite account adapter",
);

assert.strictEqual(
  sqliteGateway.payees,
  sqlitePayeesStub,
  "SQLite gateway should use the supplied SQLite payee adapter",
);

assert.strictEqual(
  sqliteGateway.accountRegisters,
  browserLocalStoragePersistenceGateway.accountRegisters,
  "v1.34 audit documents account registers as the next runtime activation blocker",
);

assert.strictEqual(
  sqliteGateway.budgetView,
  browserLocalStoragePersistenceGateway.budgetView,
  "v1.34 audit documents budget view as still browser-backed",
);

assert.strictEqual(
  sqliteGateway.categories,
  browserLocalStoragePersistenceGateway.categories,
  "v1.34 audit documents categories as still browser-backed",
);

assert.strictEqual(
  sqliteGateway.scheduledTransactions,
  browserLocalStoragePersistenceGateway.scheduledTransactions,
  "v1.34 audit documents scheduled transactions as still browser-backed",
);

const selectedSqliteGateway = getAppPersistenceGateway("sqlite-adapter", sqliteGateway);

assert.strictEqual(
  selectedSqliteGateway,
  sqliteGateway,
  "explicit SQLite selection should return the composed SQLite gateway only when supplied",
);

console.log("v1.34 runtime activation audit OK");
