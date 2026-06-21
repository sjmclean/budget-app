import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createPayeeService, findPayeeIdByName, readPayees } from "../apps/web/src/features/accounts/payeeService.js";
import { createSqlitePayeePersistenceAdapter } from "../apps/web/src/features/persistence/sqlitePayeePersistenceAdapter.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";
import type { SqlitePayeeRecord } from "../apps/web/src/features/persistence/sqlitePayeePersistenceAdapter.js";

async function main() {
  await validateBrowserPayeeArchiveLifecycle();
  await validateSqlitePayeeArchiveLifecycle();
  validatePayeeManagerWiresArchiveRestoreActions();

  console.log("v1.41 payee archive validation passed");
}

async function validateBrowserPayeeArchiveLifecycle(): Promise<void> {
  const storage = createMemoryStorage();
  const service = createPayeeService({ storage });

  await service.recordPayee("Woolworths");
  await service.recordPayee("Chemist Warehouse");

  const woolworthsId = findPayeeIdByName(storage, "Woolworths");
  assert.ok(woolworthsId, "active payee should be resolvable before archive");

  await service.archivePayee(woolworthsId);

  assert.equal(
    findPayeeIdByName(storage, "Woolworths"),
    undefined,
    "archived payees should be hidden from active payee lookup/autocomplete resolution",
  );

  assert.deepEqual(
    (await service.listPayees()).map((payee) => payee.name),
    ["Chemist Warehouse"],
    "archived payees should not appear in the active payee list",
  );

  assert.deepEqual(
    (await service.listArchivedPayees()).map((payee) => payee.name),
    ["Woolworths"],
    "archived payees should be available for management restore flows",
  );

  assert.equal(
    readPayees(storage).some((payee) => payee.id === woolworthsId && payee.isArchived),
    true,
    "archive should preserve the payee record and id instead of hard-deleting it",
  );

  await service.restorePayee(woolworthsId);

  assert.equal(
    findPayeeIdByName(storage, "Woolworths"),
    woolworthsId,
    "restored payees should become resolvable again",
  );

  assert.deepEqual(
    (await service.listArchivedPayees()).map((payee) => payee.name),
    [],
    "restored payees should leave the archived list",
  );

  await service.deletePayee(woolworthsId);
  assert.equal(
    readPayees(storage).some((payee) => payee.id === woolworthsId),
    true,
    "legacy deletePayee should archive rather than remove saved payees",
  );
}

async function validateSqlitePayeeArchiveLifecycle(): Promise<void> {
  const repository = new MemorySqlitePayeeRepository();
  const adapter = createSqlitePayeePersistenceAdapter({ repository, budgetId: "budget-1" });

  await adapter.recordPayee("Woolworths");
  const active = await adapter.listPayees();
  assert.equal(active.length, 1, "recorded SQLite payee should appear as active");

  const payeeId = active[0]?.id;
  assert.ok(payeeId, "recorded SQLite payee should have an id");

  await adapter.archivePayee(payeeId);

  assert.equal((await adapter.listPayees()).length, 0, "SQLite archived payees should be hidden from active lists");
  assert.deepEqual(
    (await adapter.listArchivedPayees()).map((payee) => payee.name),
    ["Woolworths"],
    "SQLite archived payees should be available for restore flows",
  );
  assert.equal(
    repository.records.some((payee) => payee.id === payeeId && payee.isArchived),
    true,
    "SQLite archive should preserve the payee record and id",
  );

  await adapter.restorePayee(payeeId);
  assert.deepEqual(
    (await adapter.listPayees()).map((payee) => payee.name),
    ["Woolworths"],
    "SQLite restored payees should return to active lists",
  );
}

function validatePayeeManagerWiresArchiveRestoreActions(): void {
  const accountRegisterPage = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
  const payeePort = readFileSync("apps/web/src/features/accounts/payeePersistencePort.ts", "utf8");
  const releaseScripts = readFileSync("package.json", "utf8");

  assert.match(accountRegisterPage, /archivePayee\(selectedPayeeSummary\.payee\.id\)/, "payee manager should call archivePayee");
  assert.match(accountRegisterPage, /restorePayee\(selectedPayeeSummary\.payee\.id\)/, "payee manager should call restorePayee");
  assert.match(accountRegisterPage, /listArchivedPayees\(\)/, "payee manager should load archived payees");
  assert.match(payeePort, /archivePayee\(payeeId: string\)/, "payee persistence port should expose archivePayee");
  assert.match(payeePort, /restorePayee\(payeeId: string\)/, "payee persistence port should expose restorePayee");
  assert.match(releaseScripts, /test:v141/, "release scripts should include v1.41 validation");
}

function createMemoryStorage(): KeyValueStoragePort {
  const data = new Map<string, string>();

  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

class MemorySqlitePayeeRepository {
  records: SqlitePayeeRecord[] = [];

  async create(payee: SqlitePayeeRecord): Promise<void> {
    this.records.push({ ...payee });
  }

  async update(payee: SqlitePayeeRecord): Promise<void> {
    this.records = this.records.map((record) => (record.id === payee.id ? { ...payee } : record));
  }

  async archive(payeeId: string): Promise<void> {
    this.records = this.records.map((record) =>
      record.id === payeeId ? { ...record, isArchived: true, updatedAt: new Date() } : record,
    );
  }

  async delete(payeeId: string): Promise<void> {
    this.records = this.records.filter((record) => record.id !== payeeId);
  }

  async findByBudget(budgetId: string): Promise<SqlitePayeeRecord[]> {
    return this.records.filter((record) => record.budgetId === budgetId);
  }

  async findActiveByBudget(budgetId: string): Promise<SqlitePayeeRecord[]> {
    return this.records.filter((record) => record.budgetId === budgetId && !record.isArchived);
  }

  async findById(payeeId: string): Promise<SqlitePayeeRecord | null> {
    return this.records.find((record) => record.id === payeeId) ?? null;
  }

  async findByNormalizedName(budgetId: string, normalizedName: string): Promise<SqlitePayeeRecord | null> {
    return (
      this.records.find(
        (record) => record.budgetId === budgetId && record.normalizedName === normalizedName,
      ) ?? null
    );
  }
}

main();
