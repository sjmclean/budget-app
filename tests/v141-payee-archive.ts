import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createPayeeService, findPayeeIdByName, readPayees } from "../apps/web/src/features/accounts/payeeService.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

async function main() {
  await validateBrowserPayeeArchiveLifecycle();
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
    "a used payee must not be permanently deleted",
  );
}

function validatePayeeManagerWiresArchiveRestoreActions(): void {
  const payeeManagementPage = readFileSync("apps/web/src/pages/PayeeManagementPage.tsx", "utf8");
  const payeePort = readFileSync("apps/web/src/features/accounts/payeePersistencePort.ts", "utf8");
  const releaseScripts = readFileSync("package.json", "utf8");

  assert.match(payeeManagementPage, /archivePayee\(selectedPayee\.id\)/, "payee manager should call archivePayee");
  assert.match(payeeManagementPage, /restorePayee\(selectedPayee\.id\)/, "payee manager should call restorePayee");
  assert.match(payeeManagementPage, /listArchivedPayees\(\)/, "payee manager should load archived payees");
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
