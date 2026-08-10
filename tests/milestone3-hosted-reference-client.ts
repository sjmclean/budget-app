import assert from "node:assert/strict";
import { createHostedAccountRegisterQueryClient } from
  "../apps/web/src/features/persistence/hostedAccountRegisterQueryClient.ts";

const requests: Array<{ url: string; method: string; body?: string }> = [];
const account = {
  id: "account-1", name: "Everyday", type: "on-budget", participation: "budget",
  openingBalance: 12345, closedAt: null, currencyCode: "AUD",
  workingBalance: 12345, hasUncategorizedTransactions: false,
};
const payee = {
  id: "payee-1", name: "Shop", createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: "2026-01-01", useCount: 1, isArchived: false,
};
const view = {
  budgetId: "budget-1", budgetName: "Budget", monthLabel: "July 2026",
  currencyCode: "AUD", readyToAssign: 0, totalAssigned: 0,
  totalActivity: 0, totalAvailable: 0, categoryGroups: [],
};
const client = createHostedAccountRegisterQueryClient({
  apiBaseUrl: "https://budget.test",
  fetchImplementation: async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    if (url.includes("/payees")) return Response.json({ payees: [payee] });
    if (url.includes("/categories/merge-preview")) {
      return Response.json({ sourceCategoryId: "one", targetCategoryId: "two" });
    }
    if (url.endsWith("/categories")) return Response.json({ view });
    return Response.json({ accounts: [account], deleted: true });
  },
});

const accounts = await client.createAccount("budget-1", {
  name: "Everyday", type: "on-budget", startingBalance: 123.45,
});
assert.equal(accounts[0].startingBalance, 123.45);
assert.match(requests.at(-1)?.body ?? "", /"startingBalance":12345/);

await client.updateAccount("budget-1", {
  id: "account-1", name: "Daily", type: "on-budget",
});
assert.equal(requests.at(-1)?.method, "PATCH");
assert.equal((await client.deleteAccount("budget-1", "account-1")).deleted, true);

assert.equal((await client.listPayees("budget-1", false))[0].name, "Shop");
await client.createPayee("budget-1", "Inline Shop");
assert.equal(requests.at(-1)?.method, "POST");
assert.deepEqual(JSON.parse(requests.at(-1)?.body ?? "{}"), {
  name: "Inline Shop",
});
await client.updatePayee("budget-1", {
  id: "payee-1", name: "Shop", note: "", importRules: [],
});
await client.setPayeeArchived("budget-1", "payee-1", true);
await client.mergePayees("budget-1", {
  sourcePayeeId: "payee-1", targetPayeeId: "payee-2",
});

assert.equal(
  (await client.mutateCategory("budget-1", {
    operation: "rename", month: "2026-07", categoryId: "one", name: "Renamed",
  })).monthLabel,
  "July 2026",
);
assert.equal(
  (await client.getCategoryMergePreview({
    budgetId: "budget-1", month: "2026-07",
    sourceCategoryId: "one", targetCategoryId: "two",
  })).targetCategoryId,
  "two",
);

console.log("Milestone 3 hosted reference-data client passed.");
