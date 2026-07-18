import assert from "node:assert/strict";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: storage },
  configurable: true,
});

const {
  deleteTransactionImportSession,
  readTransactionImportSession,
  writeTransactionImportSession,
} = await import("../apps/web/src/features/accounts/transactionImportSession.ts");

const snapshot = {
  version: 1 as const,
  accountId: "checking",
  savedAt: "2026-07-18T00:00:00.000Z",
  fileName: "statement.qif",
  fileType: "qif" as const,
  fileHash: "hash",
  csvText: null,
  qifText: "!Type:Bank\n^",
  ofxText: null,
  ofxInspection: null,
  qifDetection: null,
  qifDateFormat: "DD/MM/YY" as const,
  qifAmountFormat: "decimal-dot" as const,
  analysis: null,
  mapping: {},
  preview: { summary: { totalRows: 1, invalidRows: 0, exactMatches: 0, possibleMatches: 0, newTransactions: 1, selectedForImport: 1 }, candidates: [] },
  candidates: [],
  bankCandidateDetails: {},
  processedCandidates: [],
  matchEditorOrigins: {},
  matchedTransactionOrigins: {},
  previouslyImportedCount: 0,
  alreadyRepresentedCount: 0,
  excludeMemos: false,
  updateMatchedTransactionDates: true,
};

assert.equal(writeTransactionImportSession(snapshot), true);
assert.deepEqual(readTransactionImportSession("checking"), snapshot);
assert.equal(readTransactionImportSession("savings"), null);
deleteTransactionImportSession("checking");
assert.equal(readTransactionImportSession("checking"), null);
console.log("v3.22.3 persistent import session tests passed");
