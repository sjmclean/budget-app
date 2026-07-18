import assert from "node:assert/strict";
import {
  appendTransactionImportTrace,
  createTransactionImportTraceEntry,
  serialiseTransactionImportTrace,
} from "../apps/web/src/features/accounts/transactionImportTrace";

const source = createTransactionImportTraceEntry({
  stage: "source",
  input: { rowNumber: 1 },
  output: { payee: "WOOLWORTHS 1234" },
});
assert.equal(source.stage, "source");
assert.ok(source.timestamp);

const candidate = appendTransactionImportTrace(
  { id: "row-1", trace: [source] },
  {
    stage: "reconciliation",
    output: { status: "exact-match", selectedTransactionId: "tx-1" },
  },
);
assert.equal(candidate.trace?.length, 2);
assert.equal(candidate.trace?.[1]?.stage, "reconciliation");

const json = serialiseTransactionImportTrace([candidate]);
const parsed = JSON.parse(json) as Array<{ id: string; trace: unknown[] }>;
assert.equal(parsed[0]?.id, "row-1");
assert.equal(parsed[0]?.trace.length, 2);

console.log("v3.22.5 importer developer trace tests passed");
