import assert from "node:assert/strict";
import { provisionFreshLocalFirstBudget } from "../apps/web/src/features/persistence/localFirst/freshBudgetProvisioning";
import { createLocalFirstRelayTransport } from "../apps/web/src/features/persistence/localFirst/relayTransport";

const memberships = new Set<string>();
const epochs = new Map<string, string>();
const calls: string[] = [];

const fetchImplementation: typeof fetch = async (input, init = {}) => {
  const url = new URL(String(input), "https://budget.test");
  const budgetId = url.searchParams.get("budgetId") ?? "";
  const route = `${init.method ?? "GET"} ${url.pathname}`;
  calls.push(route);

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

  if (route === "POST /api/local-first/budget") {
    memberships.add(budgetId);
    return json(201, { budgetId, role: "owner", provisioned: true });
  }
  if (route === "DELETE /api/local-first/budget") {
    memberships.delete(budgetId);
    epochs.delete(budgetId);
    return json(200, { budgetId, deleted: true });
  }
  if (!memberships.has(budgetId)) {
    return json(403, { code: "BUDGET_ACCESS_DENIED", message: "Budget access denied." });
  }
  if (route === "POST /api/local-first/epoch/reset") {
    const syncEpoch = `epoch-${budgetId}`;
    epochs.set(budgetId, syncEpoch);
    return json(201, {
      budgetId,
      syncEpoch,
      previousSyncEpoch: null,
      schemaVersion: 1,
    });
  }
  if (route === "GET /api/local-first/bootstrap" && epochs.has(budgetId)) {
    return json(200, {
      protocolVersion: 2,
      budgetId,
      syncEpoch: epochs.get(budgetId),
      schemaVersion: 1,
      latestCursor: 0,
      baseline: null,
    });
  }
  return json(404, { message: "Not found." });
};

const fresh = await provisionFreshLocalFirstBudget("blank-budget", {
  apiBaseUrl: "https://budget.test",
  fetchImplementation,
});
assert.equal(memberships.has("blank-budget"), true);
assert.equal(fresh.syncEpoch, "epoch-blank-budget");
assert.equal(fresh.bootstrap.syncEpoch, fresh.syncEpoch);
assert.deepEqual(calls.slice(0, 3), [
  "POST /api/local-first/budget",
  "POST /api/local-first/epoch/reset",
  "GET /api/local-first/bootstrap",
]);

await fresh.relay.deleteBudget("blank-budget");
assert.equal(memberships.has("blank-budget"), false);

const ordinaryRelay = createLocalFirstRelayTransport({
  apiBaseUrl: "https://budget.test",
  fetchImplementation,
});
await assert.rejects(
  ordinaryRelay.resetEpoch("blank-budget", 1),
  (error: Error & { code?: string }) => error.code === "BUDGET_ACCESS_DENIED",
);
await assert.rejects(
  ordinaryRelay.getBootstrap("blank-budget"),
  (error: Error & { code?: string }) => error.code === "BUDGET_ACCESS_DENIED",
);
assert.equal(memberships.has("blank-budget"), false);
assert.equal(epochs.has("blank-budget"), false);

console.log("Milestone 4 fresh-budget provisioning passed: explicit ownership, epoch, bootstrap, and deleted-budget denial.");
