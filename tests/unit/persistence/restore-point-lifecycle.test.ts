import assert from "node:assert/strict";
import test from "node:test";
import { startRestorePointLifecycle } from "../../../apps/web/src/features/budget/restorePointLifecycle";
import { restorePointCoordinator } from "../../../apps/web/src/features/budget/restorePointCoordinator";
import { notifyLocalFirstMutationCommitted } from "../../../apps/web/src/features/persistence/localFirst/mutationEvents";

test("bootstrap owns one mutation subscription, a modest heartbeat and disposable focus/visibility listeners", () => {
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const windowEvents = new EventTarget();
  const mutationEvents = new EventTarget();
  const documentEvents = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let subscriptions = 0;
  let evaluated = 0;
  const budgetId = "lifecycle-subscriber-fixture";
  Object.assign(globalThis, {
    window: windowEvents, document: documentEvents,
    addEventListener: (name: string, listener: EventListener) => { subscriptions++; mutationEvents.addEventListener(name, listener); },
    removeEventListener: (name: string, listener: EventListener) => { subscriptions--; mutationEvents.removeEventListener(name, listener); },
    dispatchEvent: (event: Event) => mutationEvents.dispatchEvent(event),
    setInterval: (callback: () => void, interval: number) => {
      assert.equal(interval, 30_000);
      timers.set(++timerId, callback);
      return timerId;
    },
    clearInterval: (id: number) => { timers.delete(id); },
  });
  const input = {
    activeBudgetId: () => { evaluated++; return budgetId; },
    capture: async () => { assert.fail("ten minutes have not elapsed"); return null; },
    onError: (error: unknown) => { throw error; },
  };
  let dispose: (() => void) | undefined;
  try {
    startRestorePointLifecycle(input);
    dispose = startRestorePointLifecycle(input);
    assert.equal(subscriptions, 1);
    assert.equal(timers.size, 1);
    const initialCount = restorePointCoordinator.count(budgetId);
    notifyLocalFirstMutationCommitted(budgetId);
    assert.equal(restorePointCoordinator.count(budgetId), initialCount + 1);
    windowEvents.dispatchEvent(new Event("focus"));
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    [...timers.values()][0]();
    assert.equal(evaluated, 3);
    documentEvents.visibilityState = "hidden";
    [...timers.values()][0]();
    assert.equal(evaluated, 3);
    dispose();
    assert.equal(subscriptions, 0);
    assert.equal(timers.size, 0);
    windowEvents.dispatchEvent(new Event("focus"));
    assert.equal(evaluated, 3);
  } finally {
    dispose?.();
    for (const key of ["window", "document", "addEventListener", "removeEventListener", "dispatchEvent", "setInterval", "clearInterval"]) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
