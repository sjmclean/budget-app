import assert from "node:assert/strict";
import test from "node:test";

import { subscribePersistenceChanges } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import {
  notifyLocalFirstMutationCommitted,
} from "../../../apps/web/src/features/persistence/localFirst/mutationEvents.js";

test("local-first committed mutation publishes a scoped local persistence change", async () => {
  const events: unknown[] = [];
  const unsubscribe = subscribePersistenceChanges((event) => events.push(event));
  notifyLocalFirstMutationCommitted("budget-1", { domains: ["transactions"], accountIds: ["account-1"] });
  await Promise.resolve();
  unsubscribe();
  assert.equal(events.length, 1);
  assert.equal((events[0] as { source: string }).source, "local");
  assert.equal((events[0] as { scope: { budgetId: string } }).scope.budgetId, "budget-1");
});
