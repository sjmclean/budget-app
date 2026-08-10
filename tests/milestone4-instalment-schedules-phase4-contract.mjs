import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync("apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx", "utf8");
const entity = readFileSync("apps/web/src/features/accounts/entities/scheduledTransactionEntity.ts", "utf8");
const localFirst = readFileSync("apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts", "utf8");

assert.match(panel, /Instalments \/ specific dates/);
assert.match(panel, /Instalment dates and amounts/);
assert.match(panel, /Enter an amount for every instalment/);
assert.match(entity, /specificInstalments/);
assert.match(localFirst, /specificInstalments/);

console.log("Milestone 4 Phase 4 instalment schedule structural contracts passed.");
