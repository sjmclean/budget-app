import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("apps/web/src/features/accounts/accountRegisterTypes.ts", "utf8");
const service = readFileSync("apps/web/src/features/accounts/accountRegisterService.ts", "utf8");
const scheduledService = readFileSync("apps/web/src/features/accounts/scheduledTransactionService.ts", "utf8");
const scheduledPanel = readFileSync("apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx", "utf8");
const ynabImport = readFileSync("apps/web/src/features/budget/ynab4LauncherImport.ts", "utf8");
const actualImport = readFileSync("apps/web/src/features/budget/actualBudgetLauncherImport.ts", "utf8");

assert.doesNotMatch(types, /TransactionFlag|\bflag\??:/);
assert.doesNotMatch(service, /input\.transaction\.flag|transaction\.flag|\bflag:/);
assert.match(scheduledService, /tagIds\?: string\[\]/);
assert.match(scheduledService, /function legacyFlagTagId/);
assert.match(scheduledService, /ynab4-imported-flag-/);
assert.match(scheduledService, /const \{ flag: legacyFlag, \.\.\.currentTransaction \}/);
assert.doesNotMatch(scheduledService, /TransactionFlag|transaction\.flag/);
assert.doesNotMatch(
  scheduledService,
  /export interface ScheduledTransactionView\s*\{[^}]*\bflag\??:/,
);
assert.doesNotMatch(
  scheduledService,
  /export interface UpsertScheduledTransactionInput\s*\{[^}]*\bflag\??:/,
);
assert.match(scheduledPanel, /function ScheduledTagSelect/);
assert.match(scheduledPanel, /checked=\{value\.includes\(tag\.id\)\}/);
assert.doesNotMatch(scheduledPanel, /FlagColourSelect|FlagPickerDot|TransactionFlag/);
assert.match(ynabImport, /ynab4-imported-flag-/);
assert.doesNotMatch(ynabImport, /mapLegacyScheduledFlag|RegisterTransactionView\["flag"\]/);
assert.doesNotMatch(actualImport, /\bflag: null/);

console.log("v2.93.6 transaction flag removal and scheduled tag checks passed");
