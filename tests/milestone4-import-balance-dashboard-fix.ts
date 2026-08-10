import assert from "node:assert/strict";
import type { TransactionImportCandidate } from "../apps/web/src/features/accounts/transactionImport.ts";
import { calculateTransactionImportBalancePreview } from "../apps/web/src/features/accounts/transactionImportBalancePreview.ts";

function candidate(id: string, inflow: number, outflow: number): TransactionImportCandidate {
  return { id, parsed: { inflow, outflow } } as TransactionImportCandidate;
}

const preview = calculateTransactionImportBalancePreview(1_000, [
  { candidate: candidate("accepted-expense", 0, 54.36), action: "imported" },
  { candidate: candidate("accepted-income", 100, 0), action: "imported" },
  { candidate: candidate("matched", 0, 25), action: "matched" },
  { candidate: candidate("skipped", 0, 40), action: "skipped" },
]);

assert.deepEqual(preview, {
  currentWorkingBalance: 1_000,
  acceptedChange: 45.64,
  projectedWorkingBalance: 1_045.64,
});

console.log("Milestone 4 import balance preview passed: accepted decisions update the projection while matched and skipped decisions do not.");
