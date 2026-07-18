import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

assert.ok(dialog.includes('type ProcessedImportAction = "imported" | "matched" | "skipped"'));
assert.ok(dialog.includes("processedCandidates"));
assert.ok(dialog.includes("sortImportCandidates"));
assert.ok(dialog.includes('"exact-match": 0'));
assert.ok(dialog.includes("History ({processedCandidates.length})"));
assert.ok(dialog.includes("restoreProcessedCandidate"));
assert.ok(dialog.includes("{candidates.length} remaining"));
assert.ok(dialog.includes('processCandidate(candidateId, "imported")'));
assert.ok(dialog.includes('processCandidate(candidateId, "matched")'));
assert.ok(dialog.includes('processCandidate(candidateId, "skipped")'));
assert.ok(dialog.includes("Complete Import"));
assert.ok(!dialog.includes("Remaining: {candidates.length}"));

console.log("v3.16.6 import session history checks passed");
