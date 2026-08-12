import assert from "node:assert/strict";
import { createHostedAccountRegisterQueryClient } from "../apps/web/src/features/persistence/hostedAccountRegisterQueryClient.js";

const requests: Array<{ url: string; method: string; body?: string }> = [];
const client = createHostedAccountRegisterQueryClient({
  apiBaseUrl: "https://budget.test/",
  fetchImplementation: async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET", body: init?.body?.toString() });
    if (url.endsWith("/status")) {
      return Response.json({
        budgetId: "budget / one",
        generationId: "generation-1",
        state: "active",
        activatedAt: 1,
        capabilities: {
          accountRegisters: true,
          budgetMonths: true,
          analytics: true,
        },
      });
    }
    if (url.endsWith("/accounts")) {
      return Response.json({
        generationId: "generation-1",
        budgetId: "budget / one",
        accounts: [{
          id: "account?one",
          name: "Everyday",
          type: "checking",
          participation: "on-budget",
          openingBalance: 12_345,
          closedAt: null,
          currencyCode: "AUD",
          transactionCount: 28_167,
          workingBalance: 54_321,
          hasUncategorizedTransactions: true,
        }],
      });
    }
    if (url.includes("/register?")) {
      return Response.json({
        summary: {
          budgetId: "budget / one",
          accountId: "account?one",
          accountName: "Everyday",
          accountType: "checking",
          participation: "on-budget",
          currencyCode: "AUD",
          openingBalance: 12_345,
          clearedBalance: 40_000,
          unclearedBalance: 14_321,
          workingBalance: 54_321,
          transactionCount: 28_167,
        },
        page: {
          rows: [],
          hasMore: false,
          nextCursor: null,
          totalCount: 28_167,
        },
      });
    }
    if (url.includes("/months/")) {
      return Response.json({
        budgetId: "budget / one",
        budgetName: "Budget",
        monthLabel: "July 2026",
        currencyCode: "AUD",
        readyToAssign: 0,
        totalAssigned: 0,
        totalActivity: 0,
        totalAvailable: 0,
        categoryGroups: [{
          id: "essentials",
          name: "Essentials",
          previousAvailable: 0,
          assigned: 0,
          activity: 0,
          available: 0,
          note: "",
          categories: [{
            id: "groceries",
            name: "Groceries",
            previousAvailable: 0,
            assigned: 0,
            activity: 0,
            available: 0,
            isOverspent: false,
            isArchived: false,
            note: "",
          }, {
            id: "stale-hidden",
            name: "Old hidden category",
            previousAvailable: 0,
            assigned: 0,
            activity: 0,
            available: 0,
            isOverspent: false,
            isArchived: true,
            note: "",
          }],
        }],
      });
    }
    if (url.endsWith("/tags")) {
      return Response.json({
        generationId: "generation-1",
        tags: [{
          id: "review", name: "Review", colour: "blue",
          autoTagImportedTransactions: false, archived: false,
          createdAt: "2026-07-29T00:00:00.000Z",
          updatedAt: "2026-07-29T00:00:00.000Z",
        }],
      });
    }
    if (url.includes("/schedules")) {
      return Response.json({
        schedules: [{
          id: "rent", accountId: "account?one", nextDueDate: "2026-08-01",
          frequency: "monthly", recurrenceInterval: 1,
          recurrenceUnit: "month", recurrenceAnchorDate: "2026-08-01",
          endCondition: "never", occurrencesCompleted: 0,
          weekendPolicy: "same-day", payee: "Landlord",
          category: "Housing", memo: "", outflow: 100, inflow: 0,
          tagIds: [], splitLines: [],
          createdAt: "2026-07-29T00:00:00.000Z",
          updatedAt: "2026-07-29T00:00:00.000Z",
        }],
      });
    }
    return Response.json({
      generationId: "generation-1",
      rows: [],
      hasMore: false,
      nextCursor: null,
    });
  },
});

const status = await client.getBudgetStatus("budget / one");
assert.equal(status.state, "active");
assert.equal(status.capabilities.analytics, true);
assert.strictEqual(
  await client.getBudgetStatus("budget / one"),
  status,
  "Repeated capability checks should share the cached status result.",
);
assert.equal(
  requests.filter(({ url }) => url.endsWith("/status")).length,
  1,
  "Account navigation must not issue duplicate status requests.",
);
await client.queryTransactions({
  budgetId: "budget / one",
  accountId: "account?one",
  limit: 150,
  before: { date: "2025-01-01", id: "transaction&one" },
});

await client.queryTransactions({
  budgetId: "budget / one",
  accountId: "account?one",
  limit: 50,
  offset: 150,
  search: { query: "coffee & cake", scope: "payee" },
  categoryFilter: "uncategorised",
  sort: { column: "outflow", direction: "descending" },
});
const advancedTransactionUrl = new URL(requests.at(-1)?.url ?? "");
assert.equal(advancedTransactionUrl.searchParams.get("offset"), "150");
assert.equal(advancedTransactionUrl.searchParams.get("query"), "coffee & cake");
assert.equal(advancedTransactionUrl.searchParams.get("scope"), "payee");
assert.equal(
  advancedTransactionUrl.searchParams.get("categoryFilter"),
  "uncategorised",
);
assert.equal(advancedTransactionUrl.searchParams.get("sortColumn"), "outflow");
assert.equal(
  advancedTransactionUrl.searchParams.get("sortDirection"),
  "descending",
);

assert.equal(
  requests.find(({ url }) => url.endsWith("/status"))?.url,
  "https://budget.test/api/budget-engine/budgets/budget%20%2F%20one/status",
);
const cursorRequest = requests.find(({ url }) => url.includes("beforeDate="));
assert.ok(cursorRequest, "The cursor transaction request should be recorded.");
const transactionUrl = new URL(cursorRequest.url);
assert.equal(transactionUrl.searchParams.get("limit"), "150");
assert.equal(transactionUrl.searchParams.get("beforeDate"), "2025-01-01");
assert.equal(transactionUrl.searchParams.get("beforeId"), "transaction&one");
assert.ok(transactionUrl.pathname.includes("account%3Fone"));

const hostedAccounts = await client.listAccounts("budget / one");
assert.deepEqual(hostedAccounts, [{
  id: "account?one",
  name: "Everyday",
  type: "on-budget",
  startingBalance: 123.45,
  createdAt: new Date(0).toISOString(),
  closedAt: null,
}]);
const hostedNavigation = await client.listAccountNavigation("budget / one");
assert.equal(hostedNavigation[0].workingBalance, 543.21);
assert.equal(hostedNavigation[0].hasUncategorizedTransactions, true);
assert.equal(hostedNavigation[0].transactionCount, 28_167);
const registerInput = {
  budgetId: "budget / one",
  accountId: "account?one",
  limit: 150,
  offset: 0,
  categoryFilter: "all" as const,
  sort: { column: "date" as const, direction: "descending" as const },
};
client.prefetchAccountRegister(registerInput);
client.prefetchAccountRegister(registerInput);
const bootstrap = await client.getAccountRegisterBootstrap(registerInput);
assert.equal(bootstrap.summary.transactionCount, 28_167);
assert.equal(
  requests.filter(({ url }) => url.includes("/register?")).length,
  1,
  "Hover prefetch and register activation should share one bounded request.",
);
await client.setAccountClosed({
  budgetId: "budget / one",
  accountId: "account?one",
  closed: true,
});

await client.addTransaction({
  budgetId: "budget / one",
  accountId: "account?one",
  id: "new/transaction",
  date: "2025-02-01",
  amount: -125,
  tagIds: ["review"],
});
await client.updateTransaction("new/transaction", {
  budgetId: "budget / one",
  accountId: "account?one",
  date: "2025-02-02",
  amount: -150,
});
await client.toggleTransactionCleared("new/transaction", {
  budgetId: "budget / one",
  accountId: "account?one",
});
await client.deleteTransaction("new/transaction", {
  budgetId: "budget / one",
  accountId: "account?one",
});
const transactionMutationRequests = requests.filter(({ method, url }) =>
  method !== "GET" && url.includes("/transactions"),
);
assert.deepEqual(transactionMutationRequests.map(({ method }) => method), [
  "POST",
  "PATCH",
  "POST",
  "DELETE",
]);
assert.ok(transactionMutationRequests.every(
  ({ url }) => url.includes("new%2Ftransaction") || !url.includes("/new"),
));
assert.equal(JSON.parse(transactionMutationRequests[0].body ?? "{}").amount, -125);
assert.deepEqual(
  JSON.parse(transactionMutationRequests[0].body ?? "{}").tagIds,
  ["review"],
);

const tags = await client.listTransactionTags("budget / one");
assert.deepEqual(tags.map(({ id }) => id), ["review"]);
await client.replaceTransactionTags("budget / one", tags);
assert.equal(requests.at(-1)?.method, "PUT");
assert.deepEqual(JSON.parse(requests.at(-1)?.body ?? "{}").tags, tags);

const schedules = await client.listScheduledTransactions(
  "budget / one", "account?one",
);
assert.deepEqual(schedules.map(({ id }) => id), ["rent"]);
await client.createScheduledTransaction("budget / one", {
  accountId: "account?one",
  nextDueDate: "2026-08-01",
  frequency: "monthly",
  payee: "Landlord",
  category: "Housing",
  outflow: 100,
  inflow: 0,
});
assert.equal(requests.at(-1)?.method, "POST");
assert.ok(requests.at(-1)?.url.includes("/accounts/account%3Fone/schedules"));

const budgetMonthInput = { budgetId: "budget / one", month: "2026-07" };
client.prefetchBudgetMonthView(budgetMonthInput);
client.prefetchBudgetMonthView(budgetMonthInput);
await client.getBudgetMonthView(budgetMonthInput);
assert.equal(
  requests.filter(({ url }) => url.includes("/months/2026-07")).length,
  1,
  "Budget hover prefetch and page activation should share one month request.",
);

const categoryOptions = await client.getBudgetCategoryOptions({
  budgetId: "budget / one",
  month: "2026-07",
});
assert.deepEqual(categoryOptions.map((option) => ({
  id: option.id,
  archived: option.isArchived ?? false,
})), [
  { id: "__ready_to_assign__", archived: false },
  { id: "groceries", archived: false },
  { id: "stale-hidden", archived: true },
]);
const closeAccountRequest = requests.find(({ url }) =>
  url.endsWith("/accounts/account%3Fone/closed"),
);
assert.ok(closeAccountRequest, "The account lifecycle request should be recorded.");
assert.equal(closeAccountRequest.method, "PATCH");
assert.deepEqual(JSON.parse(closeAccountRequest.body ?? "{}"), { closed: true });

const failingClient = createHostedAccountRegisterQueryClient({
  fetchImplementation: async () =>
    Response.json(
      { code: "SQLITE_BUDGET_NOT_ACTIVE", message: "Not active." },
      { status: 404 },
    ),
});
await assert.rejects(
  failingClient.getBudgetStatus("legacy"),
  (error: Error & { code?: string; status?: number }) =>
    error.code === "SQLITE_BUDGET_NOT_ACTIVE" && error.status === 404,
);

console.log("Milestone 3 hosted account query client passed.");
