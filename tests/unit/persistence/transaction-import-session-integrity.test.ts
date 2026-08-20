import assert from "node:assert/strict";
import test from "node:test";

import {
  readTransactionImportSessionEntity,
  writeTransactionImportSessionEntity,
} from "../../../apps/web/src/features/accounts/entities/importSessionEntity.js";
import type {
  TransactionImportSessionSnapshot,
} from "../../../apps/web/src/features/accounts/transactionImportSession.js";

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    listKeys() {
      return [...values.keys()];
    },
  };
}

test("saved import review preserves exact prepared source identity occurrences", () => {
  const storage = createMemoryStorage();

  const sourceIdentities = {
    "row-2": {
      candidateId: "row-2",
      identity: "csv:external:merchant-a",
      occurrence: 1,
    },
    "row-7": {
      candidateId: "row-7",
      identity: "csv:external:merchant-a",
      occurrence: 3,
    },
    "row-9": {
      candidateId: "row-9",
      identity: "csv:external:merchant-b",
      occurrence: 2,
    },
  } as const;

  const snapshot: TransactionImportSessionSnapshot = {
    version: 2,
    accountId: "checking",
    savedAt: "2026-08-20T03:00:00.000Z",
    fileName: "statement.csv",
    fileType: "csv",
    fileHash: "sha256:session-source-identity-fixture",
    csvText: "Date,Payee,Amount",
    qifText: null,
    ofxText: null,
    ofxInspection: null,
    qifDetection: null,
    qifDateFormat: "day-first",
    qifAmountFormat: "decimal-dot",
    analysis: null,
    mapping: {},
    preview: {} as TransactionImportSessionSnapshot["preview"],
    candidates: [],
    bankCandidateDetails: {},
    sourceIdentities: { ...sourceIdentities },
    processedCandidates: [],
    matchEditorOrigins: {},
    matchedTransactionOrigins: {},
    previouslyImportedCount: 0,
    alreadyRepresentedCount: 0,
    excludeMemos: false,
    updateMatchedTransactionDates: false,
  };

  writeTransactionImportSessionEntity(
    storage,
    snapshot,
    new Date("2026-08-20T03:00:00.000Z"),
  );

  const restored = readTransactionImportSessionEntity(
    storage,
    "checking",
  );

  assert.ok(restored);
  assert.equal(restored.version, 2);
  assert.deepEqual(
    restored.sourceIdentities,
    sourceIdentities,
    "review restore must preserve original whole-file identity ordinals exactly",
  );
  assert.equal(
    restored.sourceIdentities["row-7"]?.occurrence,
    3,
    "an occurrence greater than one must survive persistence unchanged",
  );
});
