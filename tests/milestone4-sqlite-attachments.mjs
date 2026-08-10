import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const schema = read("apps/web/src/features/persistence/localFirst/registerSchema.ts");
const worker = read("apps/web/src/features/persistence/localFirst/localBudget.worker.ts");
const client = read("apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts");
const hook = read("apps/web/src/features/accounts/useAccountRegister.ts");
const access = read("apps/web/src/features/accounts/attachmentAccess.ts");
const entity = read("apps/web/src/features/accounts/entities/transactionEntity.ts");
const queryPort = read("packages/application/src/accountRegister/AccountRegisterQueryPort.ts");

assert.match(schema, /CREATE TABLE IF NOT EXISTS local_transaction_attachments/);
assert.match(schema, /content BLOB NOT NULL/);
assert.match(schema, /FOREIGN KEY\(transaction_id\) REFERENCES local_transactions\(id\) ON DELETE CASCADE/);
assert.match(worker, /FROM local_transaction_attachments[\s\S]*transaction_id IN/);
assert.match(worker, /FROM local_transaction_attachments AS attachment[\s\S]{0,220}AS attachmentCount/);
assert.match(worker, /readTransactionAttachmentContent/);
assert.match(client, /transaction-attachment-upsert/);
assert.match(worker, /mutation\.entityId\.startsWith\("attachment:"\)/);
assert.match(client, /contentBase64: encodeBase64\(input\.content\)/);
assert.match(client, /32 \* 1024 \* 1024/);
assert.match(hook, /storageMode === "sqlite"[\s\S]*addTransactionAttachment/);
assert.match(hook, /storageMode === "sqlite"[\s\S]*removeTransactionAttachment/);
assert.match(access, /calculateAttachmentContentHash/);
assert.match(entity, /value\.storageType === "local-sqlite"/);
assert.match(queryPort, /AccountTransactionAttachmentRow/);
assert.doesNotMatch(
  worker.match(/function queryTransactions[\s\S]*?function getTransaction/)?.[0] ?? "",
  /SELECT[\s\S]*\bcontent\b[\s\S]*FROM local_transaction_attachments/,
  "Register queries must not hydrate attachment BLOBs.",
);

console.log(
  "Milestone 4 SQLite attachments passed: normalized BLOB storage, bounded metadata reads, lazy integrity-checked content, cascade cleanup, and relay mutations.",
);
