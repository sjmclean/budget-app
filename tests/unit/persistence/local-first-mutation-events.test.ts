import assert from "node:assert/strict";
import test from "node:test";

import {
  getLastPersistenceChange,
  getPersistenceChangeVersion,
} from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import {
  notifyLocalFirstMutationCommitted,
} from "../../../apps/web/src/features/persistence/localFirst/mutationEvents.js";

test("local-first committed mutation publishes a local persistence change", () => {
  const before = getPersistenceChangeVersion();

  notifyLocalFirstMutationCommitted("budget-1");

  assert.equal(getPersistenceChangeVersion(), before + 1);
  assert.equal(getLastPersistenceChange()?.source, "local");
});
