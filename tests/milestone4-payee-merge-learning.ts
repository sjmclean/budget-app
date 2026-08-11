import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolvePayeeRecognition } from "../apps/web/src/features/accounts/payeeRecognition.js";
import type { PayeeView } from "../apps/web/src/features/accounts/payeeService.js";

const page = readFileSync("apps/web/src/pages/PayeeManagementPage.tsx", "utf8");
const worker = readFileSync("apps/web/src/features/persistence/localFirst/localBudget.worker.ts", "utf8");

assert.match(page, /Merge payees\?/);
assert.match(page, /Merging…/);
assert.match(page, /role="alert"/);
assert.match(page, /updateLinkedTransactions: true/);
assert.match(page, /updateScheduledTransactions: true/);
assert.match(page, /addMergedAliases: true/);
assert.match(page, /redirectRecognitionRules: true/);
assert.doesNotMatch(page, /isHostedSqliteBudget/,
  "local SQLite payee counts and mutations must not depend on remote baseline status");
assert.match(page, /accountRegisterQueries!\.listPayees\(activeBudgetId!, false\)/,
  "duplicate counts must come from the authoritative local SQLite payee query");
assert.match(worker, /`merge:\$\{mutation\.mutationId\}:\$\{sourcePayeeId\}`/,
  "each source must receive a unique history id in a multi-source atomic merge");
assert.match(worker, /INSERT OR IGNORE INTO local_payee_aliases/);
assert.match(worker, /BEGIN IMMEDIATE[\s\S]*INSERT OR IGNORE INTO local_payee_aliases[\s\S]*COMMIT/);

const canonical: PayeeView = {
  id: "woolworths", name: "Woolworths", createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: "2026-08-10T00:00:00.000Z", useCount: 84,
  aliases: [{ id: "merged:woolworths-metro", value: "WOOLWORTHS METRO 1234" }],
};
const recognition = resolvePayeeRecognition("WOOLWORTHS METRO 1234", [canonical]);
assert.equal(recognition.match?.payee.id, canonical.id,
  "a persisted exact merged-name alias must resolve a future imported description");
assert.equal(recognition.match?.source, "alias");

console.log("Milestone 4 payee merge learning passed: atomic history, mandatory invariants, visible errors, and exact alias recognition.");
