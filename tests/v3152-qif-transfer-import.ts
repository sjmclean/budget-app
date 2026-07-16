import assert from "node:assert/strict";
import {
  buildRegisterTransactionsFromImport,
  extractQifTransferAccountName,
  previewTransactionQifImport,
} from "../apps/web/src/features/accounts/transactionImport.js";

const qif = `!Type:Bank
D16/07/2026
T-250.00
PTransfer to Savings
L[Savings]
MInternal transfer
^`;

const preview = previewTransactionQifImport(qif, [], {
  sourceAccountName: "Everyday",
  availableTransferAccountNames: ["Savings"],
});
assert.equal(preview.candidates.length, 1);

const candidate = preview.candidates[0];
assert.equal(candidate.parsed.importedCategoryName, "[Savings]");
assert.equal(candidate.parsed.transferAccountName, "Savings");
assert.equal(candidate.status, "new");
assert.equal(candidate.selected, true);

const transactions = buildRegisterTransactionsFromImport(preview.candidates);
assert.equal(transactions.length, 1);
assert.equal(transactions[0].payee, "Transfer: Savings");
assert.equal(transactions[0].category, "Transfer");
assert.equal(transactions[0].categoryId, undefined);
assert.equal(transactions[0].outflow, 250);
assert.equal(transactions[0].inflow, 0);

assert.equal(extractQifTransferAccountName("Groceries"), undefined);
assert.equal(extractQifTransferAccountName("[Savings]"), "Savings");
assert.equal(extractQifTransferAccountName(" [ Holiday Fund ] "), "Holiday Fund");
assert.equal(extractQifTransferAccountName("[Savings]/Interest"), undefined);

const missingDestinationPreview = previewTransactionQifImport(qif, [], {
  sourceAccountName: "Everyday",
  availableTransferAccountNames: ["Holiday Fund"],
});
assert.equal(missingDestinationPreview.candidates[0].status, "invalid");
assert.equal(missingDestinationPreview.candidates[0].selected, false);
assert.match(
  missingDestinationPreview.candidates[0].errors[0] ?? "",
  /Savings.*could not be found/,
);
assert.equal(
  buildRegisterTransactionsFromImport(missingDestinationPreview.candidates).length,
  0,
);

const selfTransferPreview = previewTransactionQifImport(
  qif.replace("[Savings]", "[Everyday]"),
  [],
  {
    sourceAccountName: "Everyday",
    availableTransferAccountNames: ["Savings"],
  },
);
assert.equal(selfTransferPreview.candidates[0].status, "invalid");
assert.match(selfTransferPreview.candidates[0].reason, /currently being imported/);

console.log("v3.15.2 QIF transfer import fidelity passed");
