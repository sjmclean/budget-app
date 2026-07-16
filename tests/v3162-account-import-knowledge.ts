import assert from "node:assert/strict";
import {
  createImportFileHash,
  createQifStructureSignature,
  findAccountImportKnowledge,
  findImportedFileFingerprint,
  rememberAccountImportKnowledge,
  rememberImportedFileFingerprint,
} from "../apps/web/src/features/accounts/transactionImportKnowledge";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
      clear() {
        store.clear();
      },
    },
  },
});

const csvMapping = {
  0: "date",
  1: "payee",
  2: "outflow",
} as const;

assert.equal(createImportFileHash("same"), createImportFileHash("same"));
assert.notEqual(createImportFileHash("same"), createImportFileHash("different"));

const qifA = `!Type:Bank\nD01/07/2026\nT-10.00\nPAldi\n^`;
const qifB = `!Type:Bank\nD02/07/2026\nT-25.00\nPColes\n^`;
assert.equal(
  createQifStructureSignature(qifA),
  createQifStructureSignature(qifB),
  "QIF signature should describe structure rather than transaction values",
);

rememberAccountImportKnowledge({
  accountId: "account-a",
  fileType: "csv",
  structureSignature: "date|description|debit",
  csvMapping,
});

assert.deepEqual(
  findAccountImportKnowledge({
    accountId: "account-a",
    fileType: "csv",
    structureSignature: "date|description|debit",
  })?.csvMapping,
  csvMapping,
);
assert.equal(
  findAccountImportKnowledge({
    accountId: "account-b",
    fileType: "csv",
    structureSignature: "date|description|debit",
  }),
  undefined,
  "knowledge must remain scoped to the destination account",
);

rememberAccountImportKnowledge({
  accountId: "account-a",
  fileType: "qif",
  structureSignature: createQifStructureSignature(qifA),
  qifDateFormat: "DD/MM/YYYY",
  qifAmountFormat: "decimal-dot",
});
assert.equal(
  findAccountImportKnowledge({
    accountId: "account-a",
    fileType: "qif",
    structureSignature: createQifStructureSignature(qifB),
  })?.qifDateFormat,
  "DD/MM/YYYY",
);

const fileHash = createImportFileHash(qifA);
rememberImportedFileFingerprint({
  accountId: "account-a",
  fileHash,
  fileName: "transactions.qif",
  importedAt: "2026-07-16T00:00:00.000Z",
  transactionCount: 1,
});
assert.equal(
  findImportedFileFingerprint("account-a", fileHash)?.fileName,
  "transactions.qif",
);
assert.equal(
  findImportedFileFingerprint("account-b", fileHash),
  undefined,
  "duplicate file detection must remain account-specific",
);

console.log("v3.16.2 account import knowledge checks passed");
