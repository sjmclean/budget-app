import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const accountRegisterTypesSource = readFileSync(
  "apps/web/src/features/accounts/accountRegisterTypes.ts",
  "utf8",
);
const accountRegisterPortSource = readFileSync(
  "apps/web/src/features/accounts/accountRegisterPersistencePort.ts",
  "utf8",
);
const accountRegisterServiceSource = readFileSync(
  "apps/web/src/features/accounts/accountRegisterService.ts",
  "utf8",
);
const useAccountRegisterSource = readFileSync(
  "apps/web/src/features/accounts/useAccountRegister.ts",
  "utf8",
);
const pageSource = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const payeeServiceSource = readFileSync(
  "apps/web/src/features/accounts/payeeService.ts",
  "utf8",
);
const sqliteAdapterSource = readFileSync(
  "apps/web/src/features/persistence/sqliteAccountRegisterPersistenceAdapter.ts",
  "utf8",
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(accountRegisterTypesSource, /addTransactions\(input: \{/);
assert.match(accountRegisterPortSource, /addTransactions\(input: \{/);
assert.match(useAccountRegisterSource, /addTransactions: \(inputs: NewRegisterTransactionInput\[\]\) => Promise<void>/);
assert.match(useAccountRegisterSource, /accountRegisters\.addTransactions\(\{ accountId, transactions: inputs \}\)/);
assert.match(pageSource, /await addTransactions\(transactions\)/);
assert.doesNotMatch(pageSource, /for \(const transaction of transactions\) \{\n\s*await addTransaction\(transaction\);/);

assert.match(accountRegisterServiceSource, /async addTransactions\(input: \{/);
assert.match(accountRegisterServiceSource, /writeRegisters\(this\.dependencies\.storage, registers\)/);
assert.match(accountRegisterServiceSource, /for \(const accountId of changedAccountIds\)/);
assert.match(payeeServiceSource, /async recordPayees\(names: string\[\]\): Promise<PayeeView\[\]>/);
assert.match(sqliteAdapterSource, /async addTransactions\(input: \{/);

assert.equal(
  packageJson.scripts["test:v2404:batch-import-commit"],
  "tsx tests/v2404-batch-import-commit.ts",
);
assert.equal(
  packageJson.scripts["test:v2404"],
  "pnpm test:v2403 && pnpm test:v2404:batch-import-commit",
);

console.log("v2.40.4 batch import commit checks passed");
