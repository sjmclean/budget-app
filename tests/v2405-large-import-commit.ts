import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const serviceSource = readFileSync(
  "apps/web/src/features/accounts/accountRegisterService.ts",
  "utf8",
);

assert.match(serviceSource, /createTransferTargetResolver/);
assert.match(serviceSource, /pendingPrepends/);
assert.match(serviceSource, /Prepend transaction batches/);
assert.match(serviceSource, /logRegisterBatchCommitTimings/);
assert.match(serviceSource, /Build transaction views/);

console.log("v2.40.5 large import commit checks passed");
