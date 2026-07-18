import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(
  "apps/web/src/features/accounts/merchantKnowledgeService.ts",
  "utf8",
);
const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const engine = readFileSync(
  "apps/web/src/features/accounts/importCommitEngine.ts",
  "utf8",
);

assert.match(service, /export function acceptMerchantAlias/);
assert.match(service, /recordMerchantAliasEvidence/);
assert.match(service, /export function persistMerchantKnowledge/);
assert.match(service, /writeMerchantKnowledge/);
assert.match(dialog, /acceptMerchantAlias/);
assert.match(dialog, /lifecycle:\s*\{/);
assert.match(dialog, /proposal:\s*\{/);
assert.match(engine, /persistMerchantKnowledge/);

console.log("v3.21.2 merchant knowledge service checks passed");
