import assert from "node:assert/strict";
import {
  applyTransactionPayeeAliases,
  createTransactionPayeeAlias,
  findMatchingTransactionPayeeAlias,
  normalisePayeeAliasSource,
  upsertTransactionPayeeAlias,
  type ParsedImportTransaction,
} from "../apps/web/src/features/accounts/transactionImport";

const alias = createTransactionPayeeAlias({
  sourcePayee: "PAYPAL *WOOLWORTHSL 4029357733",
  targetPayee: "Woolworths",
});

assert.equal(
  normalisePayeeAliasSource("PAYPAL *WOOLWORTHSL 4029357733"),
  "paypal woolworthsl",
  "payee alias matching should ignore long volatile numeric references",
);

const matched = findMatchingTransactionPayeeAlias(
  "PAYPAL *WOOLWORTHSL 5173827733",
  [alias],
);

assert.equal(matched?.targetPayee, "Woolworths");

const imported: ParsedImportTransaction[] = [
  {
    rowNumber: 2,
    date: "2026-06-30",
    payee: "PAYPAL *WOOLWORTHSL 5173827733",
    memo: "Card ending 4165",
    outflow: 4.7,
    inflow: 0,
    raw: {},
  },
];

const aliased = applyTransactionPayeeAliases(imported, [alias]);
assert.equal(aliased[0].payee, "Woolworths");
assert.equal(aliased[0].originalPayee, "PAYPAL *WOOLWORTHSL 5173827733");
assert.equal(aliased[0].payeeAliasId, alias.id);

const updated = upsertTransactionPayeeAlias([alias], {
  ...alias,
  targetPayee: "Woolies",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

assert.equal(updated.length, 1);
assert.equal(updated[0].targetPayee, "Woolies");

console.log("v2.41.5 payee alias learning checks passed");
