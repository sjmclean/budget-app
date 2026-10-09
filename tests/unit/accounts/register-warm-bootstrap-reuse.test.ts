import assert from "node:assert/strict";
import test from "node:test";
import { canReuseCurrentRegisterBootstrap } from "../../../apps/web/src/features/accounts/registerWarmBootstrapReuse.js";

const current = {
  hasLoadedData: true,
  hasSqlitePage: true,
  claimedWarmKey: "budget:a:default",
  currentQueryKey: "budget:a:default",
  appliedRevision: 7,
  currentRevision: 7,
};

test("current prefetched Register data avoids immediate duplicate bootstrap", () => {
  assert.equal(canReuseCurrentRegisterBootstrap(current), true);
});

test("stale prefetched Register data must refresh", () => {
  assert.equal(canReuseCurrentRegisterBootstrap({ ...current, currentRevision: 8 }), false);
});

test("different account or search query cannot reuse a previous snapshot", () => {
  assert.equal(canReuseCurrentRegisterBootstrap({ ...current, currentQueryKey: "budget:b:default" }), false);
  assert.equal(canReuseCurrentRegisterBootstrap({ ...current, currentQueryKey: "budget:a:search" }), false);
});

test("missing snapshot or unresolved data requires bootstrap", () => {
  assert.equal(canReuseCurrentRegisterBootstrap({ ...current, claimedWarmKey: null }), false);
  assert.equal(canReuseCurrentRegisterBootstrap({ ...current, hasSqlitePage: false }), false);
  assert.equal(canReuseCurrentRegisterBootstrap({ ...current, hasLoadedData: false }), false);
});
