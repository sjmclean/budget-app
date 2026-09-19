import assert from "node:assert/strict";
import test from "node:test";
import {
  doesPersistenceChangeAffect,
  flushPersistenceChanges,
  mergePersistenceChanges,
  normalisePersistenceChange,
  publishPersistenceChange,
  subscribeToPersistenceInterest,
} from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";

const change = normalisePersistenceChange({
  source: "local",
  occurredAt: "2026-09-16T00:00:00.000Z",
  scope: {
    budgetId: "budget-a",
    domains: ["transactions", "budget"],
    accountIds: ["account-b"],
    categoryIds: ["category-1"],
    transactionIds: ["tx-1"],
    months: ["2026-10"],
  },
});

test("unrelated register, month, and budget interests do zero work while relevant work runs once", () => {
  let accountAQueries = 0; let septemberQueries = 0; let budgetBQueries = 0;
  const unsubscribers = [
    subscribeToPersistenceInterest({ budgetId: "budget-a", accountId: "account-a", domains: ["transactions"] }, () => { accountAQueries += 1; }),
    subscribeToPersistenceInterest({ budgetId: "budget-a", month: "2026-09", domains: ["budget", "transactions"] }, () => { septemberQueries += 1; }),
    subscribeToPersistenceInterest({ budgetId: "budget-b", domains: ["transactions"] }, () => { budgetBQueries += 1; }),
  ];
  publishPersistenceChange({ source: "local", scope: { budgetId: "budget-a", domains: ["transactions", "budget"], accountIds: ["account-b"], months: ["2026-10"] } });
  flushPersistenceChanges();
  assert.deepEqual({ accountAQueries, septemberQueries, budgetBQueries }, { accountAQueries: 0, septemberQueries: 0, budgetBQueries: 0 });
  publishPersistenceChange({ source: "local", scope: { budgetId: "budget-a", domains: ["transactions", "budget"], accountIds: ["account-a"], months: ["2026-09"] } });
  publishPersistenceChange({ source: "local", scope: { budgetId: "budget-a", domains: ["transactions"], accountIds: ["account-a"], months: ["2026-09"] } });
  flushPersistenceChanges();
  assert.deepEqual({ accountAQueries, septemberQueries, budgetBQueries }, { accountAQueries: 1, septemberQueries: 1, budgetBQueries: 0 });
  unsubscribers.forEach((unsubscribe) => unsubscribe());
});

test("scoped changes isolate budget, account, month, category, and domain", () => {
  assert.equal(doesPersistenceChangeAffect(change, { budgetId: "budget-b" }), false);
  assert.equal(doesPersistenceChangeAffect(change, { budgetId: "budget-a", domains: ["accounts"], accountId: "account-b" }), false);
  assert.equal(doesPersistenceChangeAffect(change, { budgetId: "budget-a", domains: ["transactions"], accountId: "account-a" }), false);
  assert.equal(doesPersistenceChangeAffect(change, { budgetId: "budget-a", domains: ["budget"], month: "2026-09" }), false);
  assert.equal(doesPersistenceChangeAffect(change, { budgetId: "budget-a", categoryId: "category-2" }), false);
  assert.equal(doesPersistenceChangeAffect(change, { budgetId: "budget-a", domains: ["transactions"], accountId: "account-b", month: "2026-10" }), true);
});

test("missing event specificity is conservative", () => {
  const unspecific = normalisePersistenceChange({ source: "replication", scope: { budgetId: "budget-a", domains: ["transactions"] } });
  assert.equal(doesPersistenceChangeAffect(unspecific, { budgetId: "budget-a", accountId: "any", month: "2026-01" }), true);
});

test("broad changes affect every same-budget interest only", () => {
  const broad = normalisePersistenceChange({ source: "restore", scope: { budgetId: "budget-a", domains: [], broad: true } });
  assert.equal(doesPersistenceChangeAffect(broad, { budgetId: "budget-a", domains: ["settings"], accountId: "x" }), true);
  assert.equal(doesPersistenceChangeAffect(broad, { budgetId: "budget-b" }), false);
});

test("compatible changes coalesce without losing scope", () => {
  const second = normalisePersistenceChange({ source: "local", occurredAt: "2026-09-16T00:00:01.000Z", scope: { budgetId: "budget-a", domains: ["transactions"], accountIds: ["account-c"], transactionIds: ["tx-2"], months: ["2026-11"] } });
  const merged = mergePersistenceChanges(change, second)!;
  assert.deepEqual(merged.scope.accountIds, ["account-b", "account-c"]);
  assert.deepEqual(merged.scope.transactionIds, ["tx-1", "tx-2"]);
  assert.deepEqual(merged.scope.months, ["2026-10", "2026-11"]);
  assert.equal(mergePersistenceChanges(change, { ...second, scope: { ...second.scope, budgetId: "budget-b" } }), null);
  assert.equal(mergePersistenceChanges(change, { ...second, source: "replication" }), null);
  const broad = normalisePersistenceChange({ source: "local", scope: { budgetId: "budget-a", domains: [], broad: true } });
  const broadMerged = mergePersistenceChanges(change, broad)!;
  assert.equal(broadMerged.scope.broad, true);
  assert.equal(broadMerged.scope.accountIds, undefined);
});

test("coalescing preserves wildcard semantics for every optional scope dimension", () => {
  const dimensions = ["accountIds", "transactionIds", "categoryIds", "months"] as const;
  for (const dimension of dimensions) {
    const specific = normalisePersistenceChange({ source: "local", scope: { budgetId: "budget-a", domains: ["transactions"], [dimension]: ["one"] } });
    const wildcard = normalisePersistenceChange({ source: "local", scope: { budgetId: "budget-a", domains: ["transactions"] } });
    assert.equal(mergePersistenceChanges(wildcard, specific)!.scope[dimension], undefined);
    assert.equal(mergePersistenceChanges(specific, wildcard)!.scope[dimension], undefined);
    assert.equal(mergePersistenceChanges(wildcard, wildcard)!.scope[dimension], undefined);
    const other = normalisePersistenceChange({ source: "local", scope: { budgetId: "budget-a", domains: ["transactions"], [dimension]: ["two"] } });
    assert.deepEqual(mergePersistenceChanges(specific, other)!.scope[dimension], ["one", "two"]);
  }
});
