import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const engine = readFileSync(
  "apps/web/src/features/accounts/importCommitEngine.ts",
  "utf8",
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(engine, /export function verifyImportCommitPlan/);
assert.match(engine, /candidate-overlap/);
assert.match(engine, /duplicate-register-match/);
assert.match(engine, /invalid-transfer/);
assert.match(engine, /invalid-category-reference/);
assert.match(engine, /invalid-transaction-amount/);
assert.match(engine, /measureStage\(stages, "Validate commit plan"/);
assert.equal(
  packageJson.scripts["test:v3227"],
  "pnpm test:v3227:commit-plan-verification && pnpm test:v3227:commit-plan-structure",
);

assert.equal(
  packageJson.scripts["verify:v3227"],
  "pnpm test:v3227 && pnpm --filter @budget-app/web build",
);

console.log("v3.22.7 import commit plan verification structure tests passed");
