import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

import type { BudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.js";
import { configureBudgetPersistenceProvider } from "../../../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";
import {
  MAX_REACTIVE_QUERY_CACHE_ENTRIES,
  createReactiveQueryDefinition,
  getReactiveQueryStoreDiagnosticsForTests,
  prefetchReactiveQuery,
  resetReactiveQueryStore,
  seedReactiveQuery,
  useReactiveQuery,
  type ReactiveQuerySnapshot,
} from "../../../apps/web/src/features/persistence/reactiveQueryStore.js";
import {
  flushPersistenceChanges,
  publishPersistenceChange,
} from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";

const provider = {} as BudgetPersistenceProvider;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("identical active consumers share one in-flight authoritative read", async () => {
  resetReactiveQueryStore();
  const pending = deferred<string>();
  let loads = 0;
  const query = createReactiveQueryDefinition<{ budgetId: string }, string>({
    id: "dedupe",
    key: ({ budgetId }) => budgetId,
    interest: ({ budgetId }) => ({ budgetId, domains: ["budget"] }),
    load: async () => {
      loads += 1;
      return pending.promise;
    },
  });
  const snapshots: ReactiveQuerySnapshot<string>[] = [];

  function Consumer() {
    snapshots.push(useReactiveQuery(query, provider, { budgetId: "budget-a" }));
    return null;
  }

  let root: ReturnType<typeof create> | undefined;
  await act(async () => {
    root = create(createElement("section", null, createElement(Consumer), createElement(Consumer)));
  });
  assert.equal(loads, 1);
  assert.equal(getReactiveQueryStoreDiagnosticsForTests().activeEntryCount, 1);

  await act(async () => {
    pending.resolve("ready");
    await pending.promise;
  });
  assert.equal(snapshots.at(-1)?.data, "ready");
  assert.equal(snapshots.at(-1)?.status, "ready");

  await act(async () => root?.unmount());
});

test("relevant invalidation retains stale data and performs one shared refresh", async () => {
  resetReactiveQueryStore();
  const refresh = deferred<string>();
  let loads = 0;
  const query = createReactiveQueryDefinition<{ budgetId: string }, string>({
    id: "refresh",
    key: ({ budgetId }) => budgetId,
    interest: ({ budgetId }) => ({ budgetId, domains: ["transactions"] }),
    load: async () => {
      loads += 1;
      return loads === 1 ? "initial" : refresh.promise;
    },
  });
  let latest: ReactiveQuerySnapshot<string> | undefined;

  function Consumer() {
    latest = useReactiveQuery(query, provider, { budgetId: "budget-refresh" });
    return null;
  }

  let root: ReturnType<typeof create> | undefined;
  await act(async () => {
    root = create(createElement(Consumer));
  });
  assert.equal(latest?.data, "initial");
  assert.equal(loads, 1);

  await act(async () => {
    publishPersistenceChange({
      source: "local",
      scope: { budgetId: "budget-refresh", domains: ["transactions"] },
    });
    flushPersistenceChanges();
  });
  assert.equal(loads, 2);
  assert.equal(latest?.data, "initial");
  assert.equal(latest?.status, "refreshing");

  await act(async () => {
    refresh.resolve("refreshed");
    await refresh.promise;
  });
  assert.equal(latest?.data, "refreshed");
  assert.equal(latest?.status, "ready");
  await act(async () => root?.unmount());
});

test("a read racing a newer revision is discarded and retried", async () => {
  resetReactiveQueryStore();
  const first = deferred<string>();
  let loads = 0;
  const query = createReactiveQueryDefinition<{ budgetId: string }, string>({
    id: "race",
    key: ({ budgetId }) => budgetId,
    interest: ({ budgetId }) => ({ budgetId, domains: ["budget"] }),
    load: async () => {
      loads += 1;
      return loads === 1 ? first.promise : "newer";
    },
  });
  let latest: ReactiveQuerySnapshot<string> | undefined;

  function Consumer() {
    latest = useReactiveQuery(query, provider, { budgetId: "budget-race" });
    return null;
  }

  let root: ReturnType<typeof create> | undefined;
  await act(async () => {
    root = create(createElement(Consumer));
  });
  assert.equal(loads, 1);

  await act(async () => {
    publishPersistenceChange({
      source: "local",
      scope: { budgetId: "budget-race", domains: ["budget"] },
    });
    flushPersistenceChanges();
    first.resolve("stale");
    await first.promise;
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.equal(loads, 2);
  assert.equal(latest?.data, "newer");
  assert.notEqual(latest?.data, "stale");
  await act(async () => root?.unmount());
});

test("exact revision seeding satisfies subscribers without a duplicate read", async () => {
  resetReactiveQueryStore();
  let loads = 0;
  const query = createReactiveQueryDefinition<{ budgetId: string }, string>({
    id: "seed",
    key: ({ budgetId }) => budgetId,
    interest: ({ budgetId }) => ({ budgetId, domains: ["budget"] }),
    load: async () => {
      loads += 1;
      return "queried";
    },
  });
  const revision = publishPersistenceChange({
    source: "local",
    scope: { budgetId: "budget-seed", domains: ["budget"] },
  });
  flushPersistenceChanges();
  seedReactiveQuery(query, provider, { budgetId: "budget-seed" }, "seeded", revision);

  let latest: ReactiveQuerySnapshot<string> | undefined;
  function Consumer() {
    latest = useReactiveQuery(query, provider, { budgetId: "budget-seed" });
    return null;
  }

  let root: ReturnType<typeof create> | undefined;
  await act(async () => {
    root = create(createElement(Consumer));
  });
  assert.equal(latest?.data, "seeded");
  assert.equal(latest?.dataRevision, revision);
  assert.equal(loads, 0);
  await act(async () => root?.unmount());
});

test("inactive reactive query cache is hard bounded", async () => {
  resetReactiveQueryStore();
  const query = createReactiveQueryDefinition<{ budgetId: string }, string>({
    id: "bounded",
    key: ({ budgetId }) => budgetId,
    interest: ({ budgetId }) => ({ budgetId, domains: ["budget"] }),
    load: async (_provider, { budgetId }) => budgetId,
  });

  for (let index = 0; index < MAX_REACTIVE_QUERY_CACHE_ENTRIES + 50; index += 1) {
    await prefetchReactiveQuery(query, provider, { budgetId: `budget-${index}` });
    assert.ok(
      getReactiveQueryStoreDiagnosticsForTests().entryCount <=
        MAX_REACTIVE_QUERY_CACHE_ENTRIES,
    );
  }
  assert.equal(
    getReactiveQueryStoreDiagnosticsForTests().entryCount,
    MAX_REACTIVE_QUERY_CACHE_ENTRIES,
  );
});


test("refresh errors retain the last authoritative data", async () => {
  resetReactiveQueryStore();
  let loads = 0;
  const query = createReactiveQueryDefinition<{ budgetId: string }, string>({
    id: "refresh-error",
    key: ({ budgetId }) => budgetId,
    interest: ({ budgetId }) => ({ budgetId, domains: ["transactions"] }),
    load: async () => {
      loads += 1;
      if (loads === 1) return "stable";
      throw new Error("refresh failed");
    },
  });
  let latest: ReactiveQuerySnapshot<string> | undefined;

  function Consumer() {
    latest = useReactiveQuery(query, provider, { budgetId: "budget-refresh-error" });
    return null;
  }

  let root: ReturnType<typeof create> | undefined;
  await act(async () => {
    root = create(createElement(Consumer));
  });
  assert.equal(latest?.data, "stable");

  await act(async () => {
    publishPersistenceChange({
      source: "local",
      scope: { budgetId: "budget-refresh-error", domains: ["transactions"] },
    });
    flushPersistenceChanges();
    await Promise.resolve();
    await Promise.resolve();
  });
  assert.equal(latest?.data, "stable");
  assert.equal(latest?.status, "error");
  assert.equal(latest?.error, "refresh failed");
  assert.equal(loads, 2, "the failed revision is not retried in a loop");
  await act(async () => root?.unmount());
});

test("configuring a new persistence provider clears cached query data", async () => {
  resetReactiveQueryStore();
  const query = createReactiveQueryDefinition<{ budgetId: string }, string>({
    id: "provider-reset",
    key: ({ budgetId }) => budgetId,
    interest: ({ budgetId }) => ({ budgetId, domains: ["budget"] }),
    load: async () => "cached",
  });
  await prefetchReactiveQuery(query, provider, { budgetId: "budget-provider-reset" });
  assert.equal(getReactiveQueryStoreDiagnosticsForTests().entryCount, 1);

  configureBudgetPersistenceProvider({
    metadata: {
      kind: "local-database",
      label: "test",
      description: "test",
      isProductionPersistence: false,
    },
  } as BudgetPersistenceProvider);

  assert.equal(getReactiveQueryStoreDiagnosticsForTests().entryCount, 0);
});


test("an exact committed seed wins the queued invalidation refresh", async () => {
  resetReactiveQueryStore();
  let loads = 0;
  const query = createReactiveQueryDefinition<{ budgetId: string }, string>({
    id: "seed-race",
    key: ({ budgetId }) => budgetId,
    interest: ({ budgetId }) => ({ budgetId, domains: ["budget"] }),
    load: async () => {
      loads += 1;
      return "initial";
    },
  });
  let latest: ReactiveQuerySnapshot<string> | undefined;

  function Consumer() {
    latest = useReactiveQuery(query, provider, { budgetId: "budget-seed-race" });
    return null;
  }

  let root: ReturnType<typeof create> | undefined;
  await act(async () => {
    root = create(createElement(Consumer));
  });
  assert.equal(loads, 1);
  assert.equal(latest?.data, "initial");

  await act(async () => {
    const revision = publishPersistenceChange({
      source: "local",
      scope: { budgetId: "budget-seed-race", domains: ["budget"] },
    });
    flushPersistenceChanges();
    seedReactiveQuery(
      query,
      provider,
      { budgetId: "budget-seed-race" },
      "committed",
      revision,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.equal(loads, 1, "the invalidation did not start a duplicate read");
  assert.equal(latest?.data, "committed");
  assert.equal(latest?.status, "ready");
  await act(async () => root?.unmount());
});


test("a late committed seed cannot overwrite a newer relevant revision", async () => {
  resetReactiveQueryStore();
  let loads = 0;
  const query = createReactiveQueryDefinition<{ budgetId: string }, string>({
    id: "late-seed",
    key: ({ budgetId }) => budgetId,
    interest: ({ budgetId }) => ({ budgetId, domains: ["budget"] }),
    load: async () => {
      loads += 1;
      return "fresh";
    },
  });

  const olderRevision = publishPersistenceChange({
    source: "local",
    scope: { budgetId: "budget-late-seed", domains: ["budget"] },
  });
  const newerRevision = publishPersistenceChange({
    source: "local",
    scope: { budgetId: "budget-late-seed", domains: ["budget"] },
  });
  flushPersistenceChanges();
  assert.ok(newerRevision > olderRevision);

  seedReactiveQuery(
    query,
    provider,
    { budgetId: "budget-late-seed" },
    "stale-seed",
    olderRevision,
  );

  let latest: ReactiveQuerySnapshot<string> | undefined;
  function Consumer() {
    latest = useReactiveQuery(query, provider, { budgetId: "budget-late-seed" });
    return null;
  }

  let root: ReturnType<typeof create> | undefined;
  await act(async () => {
    root = create(createElement(Consumer));
  });
  assert.equal(loads, 1);
  assert.equal(latest?.data, "fresh");
  assert.equal(latest?.dataRevision, newerRevision);
  await act(async () => root?.unmount());
});


test("an inactive failed query retries when a consumer mounts again", async () => {
  resetReactiveQueryStore();
  let loads = 0;
  const query = createReactiveQueryDefinition<{ budgetId: string }, string>({
    id: "remount-retry",
    key: ({ budgetId }) => budgetId,
    interest: ({ budgetId }) => ({ budgetId, domains: ["budget"] }),
    load: async () => {
      loads += 1;
      if (loads === 1) throw new Error("temporary");
      return "recovered";
    },
  });

  function Consumer() {
    useReactiveQuery(query, provider, { budgetId: "budget-remount-retry" });
    return null;
  }

  let firstRoot: ReturnType<typeof create> | undefined;
  await act(async () => {
    firstRoot = create(createElement(Consumer));
    await Promise.resolve();
  });
  assert.equal(loads, 1);
  await act(async () => firstRoot?.unmount());

  let latest: ReactiveQuerySnapshot<string> | undefined;
  function RecoveredConsumer() {
    latest = useReactiveQuery(query, provider, { budgetId: "budget-remount-retry" });
    return null;
  }

  let secondRoot: ReturnType<typeof create> | undefined;
  await act(async () => {
    secondRoot = create(createElement(RecoveredConsumer));
    await Promise.resolve();
  });
  assert.equal(loads, 2);
  assert.equal(latest?.data, "recovered");
  assert.equal(latest?.status, "ready");
  await act(async () => secondRoot?.unmount());
});
