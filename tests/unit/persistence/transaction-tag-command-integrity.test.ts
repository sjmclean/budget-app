import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTagCommands } from "../../../apps/web/src/features/persistence/localFirst/engine/tagCommands.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";

function source(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

const runtime = source("apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts");
const tagCommands = source("apps/web/src/features/persistence/localFirst/engine/tagCommands.ts");
const contracts = source("apps/web/src/features/persistence/accountRegisterQueryContracts.ts");
const provider = source("apps/web/src/features/persistence/budgetPersistenceProvider.ts");

test("transaction-tag ordinary writes are owned by the engine module", () => {
  assert.match(tagCommands, /async replaceTransactionTags/);
  assert.match(tagCommands, /local\.mutateBatch\(mutations\)/);
  assert.doesNotMatch(tagCommands, /\bsynchronise\b/);
  assert.doesNotMatch(tagCommands, /local\.mutate\(mutation\)/);
  assert.doesNotMatch(runtime, /async function writeEntity\(/);
  assert.doesNotMatch(runtime, /writeTag:|deleteTag:/);
});

const tag = (id: string) => ({ id, name: id, colour: "blue", autoTagImportedTransactions: false, archived: false, createdAt: "now", updatedAt: "now" });

function tagHarness(initial = [tag("old")]) {
  let tags = initial; let sequence = 0; let fail = false; const batches: readonly LocalBudgetMutation[][] = [];
  const database = {
    async listEntities() { return tags; },
    async mutateBatch(mutations: readonly LocalBudgetMutation[]) {
      if (fail) throw new Error("worker failed");
      (batches as LocalBudgetMutation[][]).push(mutations);
      tags = mutations.filter(({ operation }) => operation === "upsert").map(({ payload }) => payload as ReturnType<typeof tag>);
    },
  } as unknown as LocalBudgetDatabaseClient;
  const commands = createTagCommands({ requireDatabase: async () => database,
    createMutation(budgetId, domain, entityId, operation, payload) { sequence += 1; return { mutationId: `m-${sequence}`, budgetId, syncEpoch: "epoch", deviceId: "device", deviceSequence: sequence, baseCursor: 0, domain, entityId, operation, payload, createdAt: "now" }; } });
  return { commands, batches, setFailure: () => { fail = true; } };
}

test("tag replacement commits one local batch and returns its exact mutation IDs without relay access", async () => {
  const h = tagHarness(); const result = await h.commands.replaceTransactionTags("budget", [tag("next")]);
  assert.equal(h.batches.length, 1);
  assert.deepEqual(result.mutationIds, h.batches[0]!.map(({ mutationId }) => mutationId));
  assert.deepEqual(h.batches[0]!.map(({ operation, entityId }) => [operation, entityId]), [["delete", "old"], ["upsert", "next"]]);
});

test("tag history replacement validates local state and failed persistence returns no envelope", async () => {
  const h = tagHarness();
  await assert.rejects(() => h.commands.replaceTransactionTagsHistoryState({ budgetId: "budget", expected: [], replacement: [] }), /HISTORY_CONFLICT/);
  h.setFailure();
  await assert.rejects(() => h.commands.replaceTransactionTags("budget", [tag("next")]), /worker failed/);
  assert.equal(h.batches.length, 0);
});

test("conflict recovery is a narrow typed provider surface, not an ordinary command bypass", () => {
  assert.match(contracts, /interface LocalBudgetConflictRecoveryClient/);
  assert.match(contracts, /resolveSyncConflict\([\s\S]*"keep-local" \| "accept-remote"/);
  assert.doesNotMatch(contracts, /interface LocalBudgetConflictRecoveryClient[\s\S]*\bmutate\b/);
  assert.match(provider, /localBudgetConflictRecovery\?: LocalBudgetConflictRecoveryClient/);
  assert.doesNotMatch(provider, /accountRegisterQueries as[\s\S]*resolveSyncConflict/);
});
