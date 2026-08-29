import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rowSource = readFileSync("apps/web/src/features/accounts/components/TransactionRow.tsx", "utf8");
const pageSource = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");

test("register rows use the existing decorative PayeeIcon renderer without parsing icon refs", () => {
  assert.match(rowSource, /import \{ PayeeIcon \} from "\.\.\/\.\.\/icons\/PayeeIcon"/);
  assert.match(rowSource, /<PayeeIcon payee=\{canonicalPayee\} size=\{20\} decorative \/>/);
  assert.doesNotMatch(rowSource, /parsePayeeIconReference|resolvePayeeIcon|listPayees/);
  assert.match(rowSource, /<strong>\{transaction\.payee\}<\/strong>/);
});

test("register builds one payee ID lookup and resolves rows without persistence reads", () => {
  assert.match(pageSource, /new Map\(allManagedPayees\.map\(\(payee\) => \[payee\.id, payee\]\)\)/);
  assert.match(pageSource, /resolveRegisterPayee\(registerPayeesById, transaction\)/);
  assert.doesNotMatch(pageSource, /transaction\.(payeeIcon|iconRef|merchantLogo|payeeImage)/);
});
