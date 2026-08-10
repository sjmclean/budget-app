import assert from "node:assert/strict";
import { createHostedAccountRegisterQueryClient } from
  "../apps/web/src/features/persistence/hostedAccountRegisterQueryClient.ts";

const requests: Array<{ url: string; init?: RequestInit }> = [];
const client = createHostedAccountRegisterQueryClient({
  apiBaseUrl: "https://budget.test/",
  fetchImplementation: async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).endsWith("/restore")) {
      return Response.json({
        restored: true,
        counts: {
          accounts: 2,
          payees: 3,
          categories: 4,
          transactions: 5,
          budgetMonths: 6,
        },
      });
    }
    return Response.json({ ok: true });
  },
});

assert.equal(
  client.getBudgetExportUrl("budget / one", "backup"),
  "https://budget.test/api/budget-engine/budgets/budget%20%2F%20one/export?kind=backup",
);

const file = new Blob(['{"recordType":"header"}\n'], {
  type: "application/x-ndjson",
});
const restored = await client.restoreBudget("budget / one", file);
assert.equal(restored.counts.transactions, 5);
assert.equal(requests.at(-1)?.init?.method, "POST");
assert.equal(requests.at(-1)?.init?.body, file);

await client.resetBudget("budget / one", "2026-07");
assert.equal(requests.at(-1)?.init?.method, "POST");
assert.equal(requests.at(-1)?.init?.body, '{"month":"2026-07"}');

await client.deleteBudget("budget / one");
assert.equal(requests.at(-1)?.init?.method, "DELETE");
assert.match(requests.at(-1)?.url ?? "", /budget%20%2F%20one$/);

console.log("Milestone 3 hosted lifecycle client passed.");

