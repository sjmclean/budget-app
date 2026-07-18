import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importSource = readFileSync(
  "apps/web/src/features/accounts/transactionImport.ts",
  "utf8",
);
const dialogSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

for (const requiredDeclaration of [
  "export interface TransactionImportCandidate",
  "export interface TransactionImportPerformanceEntry",
  "export interface TransactionImportPerformanceReport",
  "export function createTransactionImportPerformanceReport",
  "export function formatImportDuration",
]) {
  assert.match(importSource, new RegExp(requiredDeclaration));
}

assert.match(dialogSource, /const activeProcessingCandidate =/);
assert.match(dialogSource, /const activeProposedTransactionEdit =/);
assert.doesNotMatch(
  dialogSource,
  /processingCandidate\?\.id === candidate\.id[\s\S]{0,180}processingCandidate\.action/,
);
assert.doesNotMatch(
  dialogSource,
  /proposedTransactionEdit\?\.candidateId === candidate\.id[\s\S]{0,180}proposedTransactionEdit\.field/,
);

assert.equal(
  packageJson.scripts["test:v3221:import-facade-regression"],
  "tsx tests/v3221-transaction-import-facade-regression.ts",
);
assert.equal(
  packageJson.scripts["test:v3221:import-facade-structure"],
  "node tests/v3221-transaction-import-facade-regression.mjs",
);

console.log("v3.22.1 transaction import facade structure tests passed");
