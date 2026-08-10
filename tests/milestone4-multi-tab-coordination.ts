import assert from "node:assert/strict";
import { createLocalFirstTabSyncCoordinator } from
  "../apps/web/src/features/persistence/localFirst/tabSyncCoordinator";

class LockHarness {
  readonly tails = new Map<string, Promise<unknown>>();
  active = 0;
  maximumActive = 0;

  async request<T>(
    name: string,
    _options: { mode: "exclusive" },
    callback: () => Promise<T>,
  ): Promise<T> {
    const previous = this.tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((resolve) => { release = resolve; });
    this.tails.set(name, previous.then(() => tail));
    await previous;
    this.active += 1;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    try {
      return await callback();
    } finally {
      this.active -= 1;
      release();
    }
  }
}

class ChannelHub {
  readonly channels = new Map<string, Set<ChannelHarness>>();

  create = (name: string) => {
    const channel = new ChannelHarness(name, this);
    const peers = this.channels.get(name) ?? new Set();
    peers.add(channel);
    this.channels.set(name, peers);
    return channel;
  };
}

class ChannelHarness {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(
    readonly name: string,
    readonly hub: ChannelHub,
  ) {}

  postMessage(message: unknown) {
    for (const peer of this.hub.channels.get(this.name) ?? []) {
      if (peer !== this) {
        peer.onmessage?.({ data: message } as MessageEvent<unknown>);
      }
    }
  }

  close() {
    this.hub.channels.get(this.name)?.delete(this);
  }
}

const locks = new LockHarness();
const channels = new ChannelHub();
const siblingNotifications: string[] = [];
const first = createLocalFirstTabSyncCoordinator({
  lockManager: locks,
  channelFactory: channels.create,
  dispatchCompletion: () => undefined,
});
const second = createLocalFirstTabSyncCoordinator({
  lockManager: locks,
  channelFactory: channels.create,
  dispatchCompletion: (budgetId) => siblingNotifications.push(budgetId),
});

let releaseFirst!: () => void;
const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
const firstRun = first.run("budget-a", async () => {
  await firstBlocked;
  return "first";
});
const secondRun = second.run("budget-a", async () => "second");
await Promise.resolve();
assert.equal(locks.maximumActive, 1);
releaseFirst();
assert.deepEqual(await Promise.all([firstRun, secondRun]), ["first", "second"]);
assert.equal(locks.maximumActive, 1, "only one tab may own budget sync leadership");

await first.run("budget-a", async () => "again");
assert.deepEqual(siblingNotifications, ["budget-a"]);

await assert.rejects(
  first.run("budget-a", async () => {
    throw new Error("injected failure");
  }),
  /injected failure/,
);
assert.equal(
  await second.run("budget-a", async () => "recovered"),
  "recovered",
  "a failed leader must release the operation-scoped lock",
);

let fallbackRan = false;
const fallback = createLocalFirstTabSyncCoordinator({
  lockManager: null,
  channelFactory: null,
  dispatchCompletion: null,
});
await fallback.run("budget-b", async () => {
  fallbackRan = true;
});
assert.equal(fallbackRan, true, "unsupported browsers retain automatic sync");

first.close();
second.close();
fallback.close();
console.log(
  "Milestone 4 multi-tab sync coordination passed: exclusive leadership, sibling notification, failure release, and compatibility fallback.",
);
