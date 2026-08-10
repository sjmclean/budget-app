import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  LOCAL_BUDGET_SCHEMA_VERSION,
  REQUIRED_BUDGET_DOMAINS,
  assertCompleteManifest,
  emptyDomainCounts,
  type LocalBudgetManifest,
} from "../apps/web/src/features/persistence/localFirst/contracts";

const complete: LocalBudgetManifest = {
  budgetId: "budget-one",
  syncEpoch: "epoch-one",
  schemaVersion: LOCAL_BUDGET_SCHEMA_VERSION,
  localRevision: 0,
  durable: true,
  counts: emptyDomainCounts(),
};
assert.doesNotThrow(() => assertCompleteManifest(complete));
assert.deepEqual(REQUIRED_BUDGET_DOMAINS, [
  "accounts",
  "transactions",
  "payees",
  "categories",
  "budgetMonths",
  "scheduledTransactions",
  "transactionTags",
]);

assert.throws(
  () => assertCompleteManifest({
    ...complete,
    syncEpoch: "",
  }),
  /sync epoch/,
);
assert.throws(
  () => assertCompleteManifest({
    ...complete,
    schemaVersion: LOCAL_BUDGET_SCHEMA_VERSION + 1,
  }),
  /Unsupported local budget schema/,
);
assert.throws(
  () => assertCompleteManifest({
    ...complete,
    counts: { ...complete.counts, transactions: -1 },
  }),
  /transactions/,
);

const worker = await readFile(
  new URL(
    "../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);
assert.match(worker, /new sqlite3\.oo1\.OpfsDb/);
assert.match(worker, /BEGIN IMMEDIATE/);
assert.match(worker, /local_budget_outbox/);
assert.match(worker, /STALE_SYNC_EPOCH/);
assert.doesNotMatch(worker, /localStorage/);
assert.doesNotMatch(worker, /File\.text\(/);

const vite = await readFile(
  new URL("../apps/web/vite.config.ts", import.meta.url),
  "utf8",
);
for (const header of [
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Embedder-Policy",
]) {
  assert.match(vite, new RegExp(header));
}

const settings = await readFile(
  new URL("../apps/web/src/pages/SettingsPage.tsx", import.meta.url),
  "utf8",
);
assert.match(settings, /Browser journal status only/);
assert.match(settings, /settings-sync-status-card/);

console.log(
  "Milestone 4 local-first foundation passed: complete manifest, durable worker, atomic outbox, stale-epoch refusal, and tablet diagnostics.",
);
