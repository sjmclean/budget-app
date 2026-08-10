import assert from "node:assert/strict";
import {
  createTransactionPayeeAlias,
  previewTransactionQifImport,
  resolveTransactionPayeeAlias,
  writeTransactionPayeeAliases,
  type ParsedImportTransaction,
} from "../apps/web/src/features/accounts/transactionImport";
import { installInMemoryBudgetPersistence } from "./support/persistence/inMemoryBudgetPersistence.js";

const parsed: ParsedImportTransaction = {
  rowNumber: 2,
  date: "2026-07-18",
  payee: "PAYPAL *ALDI 123456789",
  memo: "Card purchase",
  importedCategoryName: "Groceries",
  outflow: 24.5,
  inflow: 0,
  raw: {
    date: "18/07/2026",
    payee: "PAYPAL *ALDI 123456789",
    category: "Groceries",
  },
};
const alias = createTransactionPayeeAlias({
  sourcePayee: parsed.payee,
  targetPayee: "Aldi",
});
const before = structuredClone(parsed);

assert.equal(resolveTransactionPayeeAlias(parsed, [alias])?.id, alias.id);
assert.deepEqual(parsed, before, "alias lookup must leave the source row unchanged");

const { cleanup } = installInMemoryBudgetPersistence();

try {
  writeTransactionPayeeAliases([alias]);
  const preview = previewTransactionQifImport(
    "!Type:Bank\nD18/07/2026\nT-24.50\nPPAYPAL *ALDI 123456789\nLGroceries\n^",
    [],
    { dateFormat: "DD/MM/YYYY", amountFormat: "decimal-dot" },
  );
  const candidate = preview.candidates[0];

  assert.equal(candidate.parsed.payee, "PAYPAL *ALDI 123456789");
  assert.equal(candidate.lifecycle.source.rawPayee, "PAYPAL *ALDI 123456789");
  assert.equal(candidate.lifecycle.merchant.aliasId, alias.id);
  assert.equal(candidate.lifecycle.merchant.aliasSourcePayee, parsed.payee);
  assert.equal(candidate.lifecycle.proposal.payee, "Aldi");
  assert.equal(candidate.parsed.importedCategoryName, "Groceries");
} finally {
  cleanup();
}

console.log("v3.21.7 parsed import immutability checks passed");
