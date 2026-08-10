import assert from "node:assert/strict";
import { createAccountService, readAccounts } from "../apps/web/src/features/accounts/accountService.js";
import { createAccountEntityRepository } from "../apps/web/src/features/accounts/entities/accountEntity.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

class MemoryStorage implements KeyValueStoragePort {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  listKeys() { return [...this.values.keys()]; }
}

const storage = new MemoryStorage();
const service = createAccountService({ storage });

const created = await service.createAccount({ name: "Everyday", type: "on-budget", startingBalance: 125 });
assert.equal(created.length, 1);
assert.equal(storage.getItem("budget-app.accounts.v1"), null, "legacy account document must not be written");
assert.ok(storage.getItem("budget-app.entity-replication.v1/account-index"));
assert.ok(storage.listKeys().some((key) => key.includes("/account/everyday")));

await service.updateAccount({ id: "everyday", name: "Daily", type: "credit-card" });
assert.equal(service.getAccountById("everyday")?.name, "Daily");
assert.equal(service.getAccountById("everyday")?.type, "credit-card");

await service.closeAccount("everyday");
assert.ok(service.getAccountById("everyday")?.closedAt);
await service.reopenAccount("everyday");
assert.equal(service.getAccountById("everyday")?.closedAt, null);

const result = await service.deleteAccount("everyday");
assert.equal(result.deleted, true);
assert.deepEqual(readAccounts(storage), []);
const tombstoned = createAccountEntityRepository(storage).get("everyday");
assert.ok(tombstoned?.metadata.tombstone, "deletion must retain a tombstone");
assert.equal(createAccountEntityRepository(storage).has("everyday"), true, "deleted entity remains addressable for replication");

console.log("PASS: Account persistence is entity-authoritative and tombstone based");
