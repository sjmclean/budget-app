import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const parser = readFileSync(
  new URL("../apps/web/src/features/accounts/transactionImportParser.ts", import.meta.url),
  "utf8",
);
const intake = readFileSync(
  new URL("../apps/web/src/features/accounts/transactionImport.ts", import.meta.url),
  "utf8",
);
const dialog = readFileSync(
  new URL("../apps/web/src/features/accounts/components/TransactionImportDialog.tsx", import.meta.url),
  "utf8",
);

assert.match(parser, /readonly payee: string/);
assert.match(parser, /readonly raw: Readonly<Record<string, string>>/);
assert.doesNotMatch(parser, /originalPayee/);
assert.doesNotMatch(parser, /payeeAliasId/);
assert.doesNotMatch(intake, /parsed\.originalPayee/);
assert.doesNotMatch(intake, /parsed\.payeeAliasId/);
assert.doesNotMatch(dialog, /parsed:\s*\{[\s\S]{0,180}(originalPayee|payeeAliasId)/);
assert.match(intake, /aliasSourcePayee/);
assert.match(dialog, /entry\.lifecycle\.source\.rawPayee/);

console.log("v3.21.7 parsed import immutability structure checks passed");
