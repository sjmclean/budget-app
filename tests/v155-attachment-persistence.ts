import assert from "node:assert/strict";

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

  listKeys(): string[] {
    return [...this.values.keys()];
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

const receiptPayload = "data:application/pdf;base64,JVBERi0xLjQKdmFsaWQtcmVjZWlwdA==";

register = await registers.addAttachment({
  accountId: account.id,
  transactionId: transaction.id,
  attachment: {
    fileName: "receipt.pdf",
    fileSize: 31,
    mimeType: "application/pdf",
    contentDataUrl: receiptPayload,
  },
});

const withAttachment = register.transactions.find((current) => current.id === transaction.id);
assert.ok(withAttachment, "transaction should still exist after adding attachment");
assert.equal(withAttachment.attachmentCount, 1, "adding an attachment should update count");
const attachment = withAttachment.attachments?.[0];
assert.ok(attachment, "attachment record should be present");
assert.equal(attachment.fileName, "receipt.pdf", "attachment filename should be stored");
assert.equal(attachment.mimeType, "application/pdf", "attachment MIME type should be stored");
assert.equal(attachment.contentDataUrl, receiptPayload, "attachment content should be persisted in the browser register model");
assert.equal(attachment.storageType, "inline-data-url", "browser attachment payload should identify inline storage");

const reloaded = await registers.getAccountRegisterView({ accountId: account.id });
const reloadedAttachment = reloaded.transactions.find((current) => current.id === transaction.id)?.attachments?.[0];
assert.equal(reloadedAttachment?.contentDataUrl, receiptPayload, "attachment content should survive service reload");
assert.equal(reloadedAttachment?.storageType, "inline-data-url", "attachment storage type should survive service reload");

register = await registers.removeAttachment({
  accountId: account.id,
  transactionId: transaction.id,
  attachmentId: attachment.id,
});
const withoutAttachment = register.transactions.find((current) => current.id === transaction.id);
assert.ok(withoutAttachment, "transaction should still exist after removing attachment");
assert.equal(withoutAttachment.attachmentCount, 0, "removing attachment should update count");
assert.deepEqual(withoutAttachment.attachments, [], "removing attachment should clear persisted content and metadata");

console.log("v1.55 attachment persistence checks passed");
