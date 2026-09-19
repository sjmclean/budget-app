import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import {
  doesPersistenceChangeAffect,
  flushPersistenceChanges,
  getPersistenceChangeStoreDiagnosticsForTests,
  getPersistenceChangesSince,
  getPersistenceRevisionForInterest,
  MAX_EXACT_PERSISTENCE_SCOPES_PER_BUDGET,
  MAX_RECENT_PERSISTENCE_PUBLICATIONS_PER_BUDGET,
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

function fillExactScopes(budgetId: string, count: number): number {
  let latest = 0;
  for (let index = 0; index < count; index += 1) {
    latest = publishPersistenceChange({ source: index % 2 ? "replication" : "local", scope: {
      budgetId, domains: ["budget"], transactionIds: [`filler-${index}`],
    } });
    assert.ok(getPersistenceChangeStoreDiagnosticsForTests(budgetId).exactScopeCount <= MAX_EXACT_PERSISTENCE_SCOPES_PER_BUDGET);
  }
  flushPersistenceChanges();
  return latest;
}

test("exact scopes have a hard cap and evicted relevant revisions remain observable", () => {
  const budgetId = "bounded-snapshot-budget";
  const accountA = { budgetId, domains: ["transactions"] as const, accountId: "a" };
  const accountB = { budgetId, domains: ["transactions"] as const, accountId: "b" };
  const original = publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions"], accountIds: ["a"], transactionIds: ["original"] } });
  assert.equal(getPersistenceRevisionForInterest(accountA), original);
  assert.equal(getPersistenceRevisionForInterest(accountB), 0);
  fillExactScopes(budgetId, MAX_EXACT_PERSISTENCE_SCOPES_PER_BUDGET + 50);
  assert.equal(getPersistenceChangeStoreDiagnosticsForTests(budgetId).exactScopeCount, MAX_EXACT_PERSISTENCE_SCOPES_PER_BUDGET);
  assert.ok(getPersistenceRevisionForInterest(accountA) >= original);
  assert.ok(getPersistenceRevisionForInterest(accountB) >= original, "eviction conservatively loses account specificity");
  assert.equal(getPersistenceRevisionForInterest({ budgetId, domains: ["payees"] }), 0);
  assert.equal(getPersistenceRevisionForInterest({ budgetId: "other-bounded-snapshot-budget", domains: ["transactions"] }), 0);
  const newer = publishPersistenceChange({ source: "restore", scope: { budgetId, domains: ["transactions"], accountIds: ["a"], transactionIds: ["newer"] } });
  assert.equal(getPersistenceRevisionForInterest(accountA), newer, "new exact revision wins over compacted history");
  flushPersistenceChanges();
});

test("evicted multi-domain scopes compact into each domain, not unrelated domains", () => {
  const budgetId = "multi-domain-compaction-budget";
  const original = publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions", "categories"], accountIds: ["a"] } });
  fillExactScopes(budgetId, MAX_EXACT_PERSISTENCE_SCOPES_PER_BUDGET);
  assert.equal(getPersistenceRevisionForInterest({ budgetId, domains: ["transactions"], accountId: "b" }), original);
  assert.equal(getPersistenceRevisionForInterest({ budgetId, domains: ["categories"], accountId: "b" }), original);
  assert.equal(getPersistenceRevisionForInterest({ budgetId, domains: ["payees"] }), 0);
  assert.ok(getPersistenceRevisionForInterest({ budgetId, accountId: "b" }) >= original, "missing interest domains means any domain");
});

test("evicted broad scopes still affect every interest in their budget", () => {
  const budgetId = "broad-compaction-budget";
  const broad = publishPersistenceChange({ source: "restore", scope: { budgetId, domains: [], broad: true } });
  fillExactScopes(budgetId, MAX_EXACT_PERSISTENCE_SCOPES_PER_BUDGET);
  assert.equal(getPersistenceChangeStoreDiagnosticsForTests(budgetId).compactedBroadRevision, broad);
  assert.equal(getPersistenceRevisionForInterest({ budgetId, domains: ["payees"], month: "2030-12", accountId: "unknown" }), broad);
  assert.equal(getPersistenceRevisionForInterest({ budgetId: "other-broad-compaction-budget" }), 0);
});

test("republication of an exact normalized scope replaces its revision without growing the cache", () => {
  const budgetId = "scope-replacement-budget";
  const scope = { budgetId, domains: ["transactions"] as const, transactionIds: ["same"] };
  const first = publishPersistenceChange({ source: "local", scope });
  const second = publishPersistenceChange({ source: "replication", scope });
  assert.equal(second, first + 1);
  assert.equal(getPersistenceChangeStoreDiagnosticsForTests(budgetId).exactScopeCount, 1);
  assert.equal(getPersistenceRevisionForInterest({ budgetId, domains: ["transactions"], transactionId: "same" }), second);
  flushPersistenceChanges();
});

test("recent original publications remain ordered and report journal overflow", () => {
  const budgetId = "bounded-journal-budget";
  const interest = { budgetId, domains: ["transactions"] as const, accountId: "a" };
  const first = publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions"], accountIds: ["a"] } });
  const second = publishPersistenceChange({ source: "replication", scope: { budgetId, domains: ["budget"] } });
  const third = publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["transactions"], accountIds: ["a"] } });
  const retained = getPersistenceChangesSince(interest, first - 1);
  assert.equal(retained.complete, true);
  if (!retained.complete) throw new Error("The recent journal was unexpectedly incomplete.");
  assert.equal(retained.latestRevision, third);
  assert.deepEqual(retained.changes.map(({ revision }) => revision), [first, third]);
  assert.deepEqual(retained.changes.map(({ event }) => event.source), ["local", "local"]);
  assert.equal(second, first + 1);
  for (let index = 0; index < MAX_RECENT_PERSISTENCE_PUBLICATIONS_PER_BUDGET + 50; index += 1) {
    publishPersistenceChange({ source: "local", scope: { budgetId, domains: ["budget"], transactionIds: [`journal-${index}`] } });
    assert.ok(getPersistenceChangeStoreDiagnosticsForTests(budgetId).recentPublicationCount <= MAX_RECENT_PERSISTENCE_PUBLICATIONS_PER_BUDGET);
  }
  assert.equal(getPersistenceChangesSince(interest, first).complete, false);
  assert.equal(getPersistenceChangesSince({ budgetId: "other-journal-budget" }, 0).complete, true);
  flushPersistenceChanges();
});
