import assert from "node:assert/strict";
import test from "node:test";
import {
  budgetIdFromLocalFirstDatabaseLeaseScope,
  createLocalFirstDatabaseTabCoordinator,
  LOCAL_FIRST_EXCLUSIVE_DATABASE_LEASE_SCOPE,
} from "../../../apps/web/src/features/persistence/localFirst/databaseTabCoordinator";

test("exclusive physical leases are never exposed as active budget identity", () => {
  assert.equal(
    budgetIdFromLocalFirstDatabaseLeaseScope(
      LOCAL_FIRST_EXCLUSIVE_DATABASE_LEASE_SCOPE,
    ),
    null,
  );
  assert.equal(
    budgetIdFromLocalFirstDatabaseLeaseScope("budget-a"),
    "budget-a",
  );
  assert.equal(budgetIdFromLocalFirstDatabaseLeaseScope(null), null);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

class LockHub {
  private tails = new Map<string, Promise<void>>();

  request<T>(
    name: string,
    _options: { mode: "exclusive" },
    callback: () => Promise<T>,
  ): Promise<T> {
    const previous = this.tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((done) => { release = done; });
    this.tails.set(name, previous.then(() => current));
    return previous.then(callback).finally(() => release());
  }
}

class ChannelHub {
  private channels = new Map<string, Set<FakeChannel>>();

  create = (name: string) => {
    const channel = new FakeChannel(name, this);
    const set = this.channels.get(name) ?? new Set<FakeChannel>();
    set.add(channel);
    this.channels.set(name, set);
    return channel;
  };

  broadcast(sender: FakeChannel, message: unknown) {
    for (const channel of this.channels.get(sender.name) ?? []) {
      if (channel !== sender) channel.onmessage?.({ data: message } as MessageEvent);
    }
  }

  remove(channel: FakeChannel) {
    this.channels.get(channel.name)?.delete(channel);
  }
}

class FakeChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  constructor(readonly name: string, private readonly hub: ChannelHub) {}
  postMessage(message: unknown) { this.hub.broadcast(this, message); }
  close() { this.hub.remove(this); }
}

test("second tab acquires only after the first tab drains and releases SQLite", async () => {
  const locks = new LockHub();
  const channels = new ChannelHub();
  const first = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });
  const second = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });

  const releaseStarted = deferred();
  const allowRelease = deferred();
  const events: string[] = [];

  await first.acquire("budget-a", async () => {
    events.push("first-release-start");
    releaseStarted.resolve();
    await allowRelease.promise;
    events.push("first-release-done");
  });

  const secondAcquire = second.acquire("budget-a", async () => {
    events.push("second-release");
  }).then(() => events.push("second-acquired"));

  await releaseStarted.promise;
  assert.deepEqual(events, ["first-release-start"]);
  assert.equal(second.owns("budget-a"), false);

  allowRelease.resolve();
  await secondAcquire;
  assert.deepEqual(events, [
    "first-release-start",
    "first-release-done",
    "second-acquired",
  ]);
  assert.equal(first.owns("budget-a"), false);
  assert.equal(second.owns("budget-a"), true);

  await second.release();
  await first.close();
  await second.close();
});

test("releasing ownership is not usable and same-budget reacquisition waits for a fresh lease", async () => {
  const locks = new LockHub();
  const channels = new ChannelHub();
  const coordinator = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });
  const releaseStarted = deferred();
  const allowRelease = deferred();
  let releases = 0;

  await coordinator.acquire("budget-a", async () => {
    releases += 1;
    releaseStarted.resolve();
    await allowRelease.promise;
  });

  const releasing = coordinator.release();
  await releaseStarted.promise;
  assert.equal(coordinator.owns("budget-a"), false);
  assert.equal(coordinator.budgetId(), null);

  let reacquired = false;
  const reacquire = coordinator.acquire("budget-a", async () => {
    releases += 10;
  }).then(() => { reacquired = true; });

  await Promise.resolve();
  assert.equal(reacquired, false);

  allowRelease.resolve();
  await releasing;
  await reacquire;
  assert.equal(coordinator.owns("budget-a"), true);
  assert.equal(coordinator.budgetId(), "budget-a");
  assert.equal(releases, 1);

  await coordinator.release();
  assert.equal(releases, 11);
  await coordinator.close();
});

test("same-tab same-budget activation reuses one physical lease", async () => {
  const locks = new LockHub();
  const channels = new ChannelHub();
  const coordinator = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });
  let releases = 0;
  await coordinator.acquire("budget-a", async () => { releases += 1; });
  await coordinator.acquire("budget-a", async () => { releases += 10; });
  assert.equal(coordinator.owns("budget-a"), true);
  assert.equal(coordinator.budgetId(), "budget-a");
  assert.equal(releases, 0);
  await coordinator.release();
  assert.equal(coordinator.budgetId(), null);
  assert.equal(releases, 10);
  await coordinator.close();
});

test("failed database release retains the Web Lock and blocks takeover", async () => {
  const locks = new LockHub();
  const channels = new ChannelHub();
  const errors: unknown[] = [];
  const first = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
    onReleaseError: (error) => errors.push(error),
  });
  const second = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });

  await first.acquire("budget-a", async () => {
    throw new Error("close failed");
  });

  let acquired = false;
  void second.acquire("budget-a", async () => {}).then(() => { acquired = true; });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(acquired, false);
  assert.equal(first.owns("budget-a"), true);
  assert.equal(errors.length, 1);
});


test("different budgets still share one physical SQLite lease", async () => {
  const locks = new LockHub();
  const channels = new ChannelHub();
  const first = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });
  const second = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });
  const events: string[] = [];

  await first.acquire("budget-a", async () => {
    events.push("release-a");
  });
  await second.acquire("budget-b", async () => {
    events.push("release-b");
  });

  assert.deepEqual(events, ["release-a"]);
  assert.equal(first.owns("budget-a"), false);
  assert.equal(second.owns("budget-b"), true);
  await second.release();
  await first.close();
  await second.close();
});


test("release cancels a queued acquisition before it can publish ownership", async () => {
  const locks = new LockHub();
  const channels = new ChannelHub();
  const first = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });
  const second = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });

  await first.acquire("budget-a", async () => {});
  const queued = second.acquire("budget-b", async () => {});
  await Promise.resolve();
  await second.release();
  await first.release();
  await queued;

  assert.equal(second.budgetId(), null);
  assert.equal(second.owns("budget-b"), false);
  await first.close();
  await second.close();
});

test("a newer budget acquisition supersedes an older queued request", async () => {
  const locks = new LockHub();
  const channels = new ChannelHub();
  const first = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });
  const second = createLocalFirstDatabaseTabCoordinator({
    lockManager: locks,
    channelFactory: channels.create,
  });

  await first.acquire("budget-held", async () => {});
  const acquireA = second.acquire("budget-a", async () => {});
  await Promise.resolve();
  const acquireB = second.acquire("budget-b", async () => {});
  await first.release();
  await Promise.all([acquireA, acquireB]);

  assert.equal(second.budgetId(), "budget-b");
  assert.equal(second.owns("budget-a"), false);
  assert.equal(second.owns("budget-b"), true);
  await first.close();
  await second.close();
});
