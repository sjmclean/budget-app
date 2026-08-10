import assert from "node:assert/strict";
import { createLocalFirstRelayEventBroker } from
  "../apps/server/src/localFirstRelayEvents.mjs";

function response() {
  return {
    destroyed: false,
    messages: [],
    write(value) {
      this.messages.push(value);
    },
  };
}

const broker = createLocalFirstRelayEventBroker({ heartbeatIntervalMs: 60_000 });
const budgetA = response();
const budgetB = response();
const unsubscribeA = broker.subscribe("budget-a", budgetA);
const unsubscribeB = broker.subscribe("budget-b", budgetB);

assert.equal(broker.subscriberCount("budget-a"), 1);
assert.equal(broker.publish("budget-a", {
  type: "mutations-available",
  budgetId: "budget-a",
  syncEpoch: "epoch-a",
  latestCursor: 7,
}), 1);
assert.equal(budgetA.messages.length, 1);
assert.match(budgetA.messages[0], /event: relay/);
assert.match(budgetA.messages[0], /"latestCursor":7/);
assert.equal(budgetB.messages.length, 0, "events must remain budget-scoped");

unsubscribeA();
unsubscribeB();
assert.equal(broker.subscriberCount("budget-a"), 0);
console.log("Milestone 4 local-first SSE broker passed.");
