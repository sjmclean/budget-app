import assert from "node:assert/strict";
import fs from "node:fs";

const transactionImport = fs.readFileSync(
  "apps/web/src/features/accounts/transactionImport.ts",
  "utf8",
);
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const importCommitEngine = fs.readFileSync(
  "apps/web/src/features/accounts/importCommitEngine.ts",
  "utf8",
);

assert.match(
  transactionImport,
  /const fallbackPayee = parsed\.payee\.trim\(\);[\s\S]*lifecycle\.merchant\.canonicalPayee = fallbackPayee;[\s\S]*lifecycle\.proposal\.payee = fallbackPayee;/,
);
assert.doesNotMatch(
  transactionImport,
  /lifecycle\.merchant\.canonicalPayee ===\s*`Transfer:/,
);
assert.match(
  importCommitEngine,
  /Array\.isArray\(session\.merchantKnowledge\?\.merchants\)[\s\S]*createEmptyMerchantKnowledgeStore\(\)/,
);
assert.equal(
  packageJson.scripts["test:v3234:external-transfer-commit"],
  "tsx tests/v3234-external-transfer-commit.ts",
);
assert.equal(
  packageJson.scripts["test:v3234:external-transfer-commit-structure"],
  "node tests/v3234-external-transfer-commit.mjs",
);
assert.ok(fs.existsSync("tests/v3234-external-transfer-commit.ts"));
assert.ok(fs.existsSync("tests/v3234-external-transfer-commit.mjs"));

console.log("v3.23.4 external transfer commit structure tests passed");
