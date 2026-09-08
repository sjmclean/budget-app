import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialogSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const engineSource = readFileSync(
  "apps/web/src/features/accounts/importCommitEngine.ts",
  "utf8",
);

test("historical payee cleanup is staged before the import commit", () => {
  assert.match(
    dialogSource,
    /const historicalPayeeUpdates\s*=\s*await prepareHistoricalRegisterPayeeUpdates\(\);/,
  );
  assert.match(
    dialogSource,
    /matchedCandidates,\s*historicalPayeeUpdates,\s*completedSourceCandidates,/,
  );
  assert.doesNotMatch(
    dialogSource,
    /applyHistoricalRegisterPayeeUpdates/,
  );
  assert.doesNotMatch(
    dialogSource,
    /historicalPayeeCleanupFailed/,
  );
});

test("historical payee updates share the atomic register batch", () => {
  assert.match(
    engineSource,
    /const registerUpdates = \[\s*\.\.\.plan\.matchedTransactionUpdates,\s*\.\.\.plan\.historicalPayeeUpdates,\s*\];/,
  );
  assert.match(
    engineSource,
    /adapters\.commitTransactionBatch\(\s*session\.accountId,\s*plan!\.additions,\s*registerUpdates,\s*plan!\.provenanceAssignments,\s*plan!\.payeeCreations,/,
  );
  assert.match(
    engineSource,
    /plan\.historicalPayeeUpdates\.length > 0/,
  );
});

test("historical payees use the import resolver and cannot collide with matches", () => {
  assert.match(
    engineSource,
    /plan!\.historicalPayeeUpdates\.map\(\(transaction\) =>\s*resolvePayeeForSubmission\(transaction, resolvePayee\)/,
  );
  assert.match(
    engineSource,
    /matchedRegisterIds\.has\(transaction\.id\)[\s\S]*?"invalid-historical-payee-update"/,
  );
});
