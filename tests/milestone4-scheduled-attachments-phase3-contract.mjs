import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const maintenance = readFileSync(new URL("apps/web/src/features/accounts/scheduledTransactionMaintenance.ts", root), "utf8");
const panel = readFileSync(new URL("apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx", root), "utf8");

assert.match(maintenance, /for \(const attachment of transaction\.scheduledAttachments \?\? \[\]\)/);
assert.match(maintenance, /addTransactionAttachment/);
assert.match(maintenance, /`\$\{id\}:attachment:\$\{attachment\.id\}`/);
assert.match(panel, /type="file"/);
assert.match(panel, /multiple/);
assert.match(panel, /Added to every generated transaction|attached to every generated transaction/);

console.log("Milestone 4 Phase 3 scheduled attachment structural contracts passed.");
