import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService.js";
import { createAccountService, readAccounts } from "../apps/web/src/features/accounts/accountService.js";
import { createPayeeService, findPayeeIdByName } from "../apps/web/src/features/accounts/payeeService.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

class MemoryStorage implements KeyValueStoragePort {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();
const accounts = createAccountService({ storage });
const payees = createPayeeService({ storage });
const registers = createAccountRegisterService({
  storage,
  recordPayee: async (payeeName) => {
    await payees.recordPayee(payeeName);
  },
  findPayeeIdByName: (payeeName) => findPayeeIdByName(storage, payeeName),
  readAccounts: () => readAccounts(storage),
  getAccountById: (accountId) => accounts.getAccountById(accountId) ?? undefined,
});

const createdAccounts = await accounts.createAccount({
  name: "Everyday",
  type: "on-budget",
  startingBalance: 1000,
});
const account = createdAccounts[0];
assert.ok(account, "test account should be created");

let register = await registers.addTransaction({
  accountId: account.id,
  transaction: {
    date: "2026-06-22",
    flag: null,
    payee: "Officeworks",
    category: "Office Supplies",
    memo: "Printer paper",
    outflow: 18.5,
    inflow: 0,
  },
});
const transaction = register.transactions[0];
assert.ok(transaction, "test transaction should be created");
assert.equal(transaction.attachmentCount, 0, "new transactions should start without attachments");

register = await registers.addAttachment({
  accountId: account.id,
  transactionId: transaction.id,
  attachment: {
    fileName: "receipt.pdf",
    fileSize: 12345,
    mimeType: "application/pdf",
  },
});

const withAttachment = register.transactions.find((current) => current.id === transaction.id);
assert.ok(withAttachment, "transaction should still exist after adding attachment metadata");
assert.equal(withAttachment.attachmentCount, 1, "browser register should track attachment count");
assert.equal(withAttachment.attachments?.[0]?.fileName, "receipt.pdf", "browser register should store attachment file name metadata");
assert.equal(withAttachment.attachments?.[0]?.fileSize, 12345, "browser register should store attachment size metadata");
assert.equal(withAttachment.attachments?.[0]?.mimeType, "application/pdf", "browser register should store attachment mime metadata");
assert.equal(
  Object.prototype.hasOwnProperty.call(withAttachment.attachments?.[0] ?? {}, "content"),
  false,
  "browser register attachment records must not pretend to persist file bytes",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(withAttachment.attachments?.[0] ?? {}, "relativePath"),
  false,
  "browser register attachment records do not yet point at package files",
);

register = await registers.removeAttachment({
  accountId: account.id,
  transactionId: transaction.id,
  attachmentId: withAttachment.attachments?.[0]?.id ?? "missing",
});
const withoutAttachment = register.transactions.find((current) => current.id === transaction.id);
assert.ok(withoutAttachment, "transaction should still exist after removing attachment metadata");
assert.equal(withoutAttachment.attachmentCount, 0, "removing attachment metadata should update count");
assert.deepEqual(withoutAttachment.attachments, [], "removing attachment metadata should clear the attachment list");

const sqliteAdapterSource = readFileSync(
  "apps/web/src/features/persistence/sqliteAccountRegisterPersistenceAdapter.ts",
  "utf8",
);
assert.match(
  sqliteAdapterSource,
  /does not support attachment mutation yet/,
  "SQLite register adapter must continue to expose attachment mutation as an explicit unsupported boundary",
);

console.log("v1.54 attachment foundation checks passed");
