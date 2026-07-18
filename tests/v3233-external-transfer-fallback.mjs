import assert from "node:assert/strict";
import fs from "node:fs";

const reconciliation = fs.readFileSync(
  "apps/web/src/features/accounts/transactionImportReconciliation.ts",
  "utf8",
);
const transactionImport = fs.readFileSync(
  "apps/web/src/features/accounts/transactionImport.ts",
  "utf8",
);
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.match(reconciliation, /findTransferDestinationAccount/);
assert.match(reconciliation, /const unresolvedTransfer/);
assert.match(reconciliation, /transfer: unresolvedTransfer/);
assert.doesNotMatch(
  reconciliation,
  /Transfer destination account .* could not be resolved[\s\S]*kind: "transfer"/,
);
assert.match(transactionImport, /downgradeUnresolvedExternalTransfer/);
assert.match(
  transactionImport,
  /assessment\.transfer\?\.status === "missing"/,
);
assert.equal(
  packageJson.scripts["test:v3233:external-transfer-fallback"],
  "tsx tests/v3233-external-transfer-fallback.ts",
);
assert.equal(
  packageJson.scripts["test:v3233:external-transfer-fallback-structure"],
  "node tests/v3233-external-transfer-fallback.mjs",
);
assert.ok(fs.existsSync("tests/v3233-external-transfer-fallback.ts"));
assert.ok(fs.existsSync("tests/v3233-external-transfer-fallback.mjs"));

console.log("v3.23.3 external transfer fallback structure tests passed");
