import fs from "node:fs";
import assert from "node:assert/strict";

const dialog = fs.readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const register = fs.readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);

assert.match(dialog, /bankCandidateDetails/);
assert.match(dialog, /const bankParsed = bankCandidateDetails\[candidate\.id\]/);
assert.match(dialog, /formatImportReviewDate\(bankParsed\.date\)/);
assert.match(dialog, /bankParsed\.payee \|\| "Missing payee"/);
assert.match(dialog, /bankParsed\.memo \|\| "—"/);
assert.match(dialog, /normaliseSuggestedImportCategory/);
assert.match(dialog, /trimmed\.toLocaleLowerCase\(\) === "ready to assign"/);
assert.match(dialog, /transaction\.inflow > 0 && transaction\.outflow === 0/);
assert.match(register, /isTransactionImportOpening/);
assert.match(register, /requestAnimationFrame/);
assert.match(register, /Drop your transaction file here/);

console.log("v3.19.6 importer responsiveness, immutable Bank row, and category guard checks passed");
