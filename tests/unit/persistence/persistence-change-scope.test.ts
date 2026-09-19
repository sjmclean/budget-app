import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import {
  doesPersistenceChangeAffect,
  flushPersistenceChanges,
  getPersistenceRevisionForInterest,
  mergePersistenceChanges,
  normalisePersistenceChange,
  publishPersistenceChange,
  subscribeToPersistenceInterest,
  usePersistenceChange,
} from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";

const webRequire = createRequire(new URL("../../../apps/web/package.json", import.meta.url));
const { createElement, useLayoutEffect } = webRequire("react");
const { act, create } = webRequire("react-test-renderer");
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

test("authoritative snapshots recover a publication between render and subscribe", () => {
  const interest = { budgetId: "mount-race-budget", domains: ["categories"] as const, month: "2026-09" };
  assert.equal(getPersistenceRevisionForInterest(interest), 0); // render snapshot
  const relevant = publishPersistenceChange({ source: "local", scope: { budgetId: interest.budgetId, domains: ["categories"], months: [interest.month] } });
  const stop = subscribeToPersistenceInterest(interest, () => {}); // commit subscription
  assert.equal(getPersistenceRevisionForInterest(interest), relevant); // React's post-subscribe check
  publishPersistenceChange({ source: "local", scope: { budgetId: "other-mount-race-budget", domains: ["categories"] } });
  assert.equal(getPersistenceRevisionForInterest(interest), relevant);
  publishPersistenceChange({ source: "local", scope: { budgetId: interest.budgetId, domains: ["payees"], months: ["2026-10"] } });
  assert.equal(getPersistenceRevisionForInterest(interest), relevant);
  stop();
  flushPersistenceChanges();
});

test("React observes a relevant publication in the render-to-subscribe window", async () => {
  const interest = { budgetId: "react-mount-race-budget", domains: ["categories"] as const, month: "2026-09" };
  const observed: number[] = [];
  let published = 0;
  function PublishDuringCommit() {
    useLayoutEffect(() => {
      published = publishPersistenceChange({ source: "local", scope: { budgetId: interest.budgetId, domains: ["categories"], months: [interest.month] } });
      flushPersistenceChanges();
    }, []);
    return null;
  }
  function Observe() {
    observed.push(usePersistenceChange(interest));
    return null;
  }
  let root: { unmount(): void } | undefined;
  await act(async () => {
    root = create(createElement("section", null, createElement(PublishDuringCommit), createElement(Observe)));
  });
  assert.equal(observed[0], 0, "render captures the pre-publication snapshot");
  assert.equal(observed.at(-1), published, "post-subscribe snapshot recovers the publication");
  await act(async () => { root?.unmount(); });
  flushPersistenceChanges();
});

test("authoritative snapshots preserve broad, wildcard, and specific scope matching", () => {
  const budgetId = "snapshot-scope-budget";
  const accountA = { budgetId, domains: ["transactions"] as const, accountId: "a" };
  const accountB = { budgetId, domains: ["transactions"] as const, accountId: "b" };
  assert.equal(getPersistenceRevisionForInterest(accountA), 0);
  const specific = publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions"], accountIds: ["a"] } });
  assert.equal(getPersistenceRevisionForInterest(accountA), specific);
  assert.equal(getPersistenceRevisionForInterest(accountB), 0);
  const wildcard = publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions"] } });
  assert.equal(getPersistenceRevisionForInterest(accountA), wildcard);
  assert.equal(getPersistenceRevisionForInterest(accountB), wildcard);
  const broad = publishPersistenceChange({ source: "restore", scope: { budgetId, domains: [], broad: true } });
  assert.equal(getPersistenceRevisionForInterest({ budgetId, domains: ["settings"], month: "2030-01" }), broad);
  assert.equal(getPersistenceRevisionForInterest({ budgetId: "unrelated-snapshot-budget" }), 0);
  flushPersistenceChanges();
});

test("coalesced notification does not assign an unrelated publication revision", () => {
  const interest = { budgetId: "snapshot-coalescing-budget", domains: ["categories"] as const, month: "2026-09" };
  const relevant = publishPersistenceChange({ source: "local", scope: { budgetId: interest.budgetId, domains: ["categories"], months: [interest.month] } });
  publishPersistenceChange({ source: "local", scope: { budgetId: interest.budgetId, domains: ["payees"], months: ["2026-10"] } });
  assert.equal(getPersistenceRevisionForInterest(interest), relevant);
  flushPersistenceChanges();
  assert.equal(getPersistenceRevisionForInterest(interest), relevant);
  const newer = publishPersistenceChange({ source: "local", scope: { budgetId: interest.budgetId, domains: ["budget"], months: [interest.month] } });
  assert.equal(getPersistenceRevisionForInterest({ ...interest, domains: ["categories", "budget"] }), newer);
  flushPersistenceChanges();
});
