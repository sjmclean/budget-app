import type {
  AccountRegisterQueryPort,
  AccountRegisterSummary,
  AccountTransactionPage,
  AccountTransactionQuery,
} from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import type {
  CreateAccountInput,
  DeleteAccountResult,
  SidebarAccount,
  UpdateAccountInput,
} from "../accounts/accountService";
import type {
  MergePayeesInput,
  PayeeView,
  UpdatePayeeInput,
} from "../accounts/payeeService";
import type {
  BudgetActivityDrilldown,
  BudgetMonthView,
  CategoryMergePreview,
} from "../budget/budgetViewTypes";
import type { BudgetCategoryOption } from "../budget/budgetViewTypes";
import type { RegisterTransactionView } from "../accounts/accountRegisterTypes";
import type { RegisterAttachmentView } from "../accounts/accountRegisterTypes";
import type { TransactionTagDefinition } from "../tags/transactionTagTypes";
import type {
  ScheduledTransactionView,
  UpsertScheduledTransactionInput,
} from "../accounts/scheduledTransactionService";
import type {
  AccountNavigation,
  AccountRegisterBootstrap,
  AccountRegisterQueryClient,
  BudgetEngineStatus,
  BudgetRestoreResult,
  CategoryMutation,
  FinancialOverview,
  SpendingCategoryRow,
  TransactionTarget,
  TransactionWriteInput,
} from "./accountRegisterQueryContracts";

interface HostedAccountRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly participation: string;
  readonly openingBalance: number;
  readonly closedAt: string | null;
  readonly currencyCode: string;
  readonly workingBalance: number;
  readonly hasUncategorizedTransactions: boolean;
  readonly transactionCount: number;
}

export function createHostedAccountRegisterQueryClient(options: {
  readonly apiBaseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
} = {}): AccountRegisterQueryClient {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const apiBaseUrl = (options.apiBaseUrl ?? "").replace(/\/+$/, "");
  const statusCache = new Map<string, {
    readonly expiresAt: number;
    readonly value: Promise<BudgetEngineStatus>;
  }>();
  const STATUS_CACHE_MS = 30_000;
  const REGISTER_BOOTSTRAP_CACHE_MS = 10_000;
  const BUDGET_MONTH_CACHE_MS = 10_000;
  const registerBootstrapCache = new Map<string, {
    readonly expiresAt: number;
    readonly value: Promise<AccountRegisterBootstrap>;
  }>();
  const budgetMonthCache = new Map<string, {
    readonly expiresAt: number;
    readonly value: Promise<BudgetMonthView>;
  }>();

  async function readJson<T>(path: string): Promise<T> {
    const response = await fetchImplementation(`${apiBaseUrl}${path}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const body = await response.json().catch(() => ({})) as {
      code?: string;
      message?: string;
    };
    if (!response.ok) {
      throw Object.assign(
        new Error(body.message ?? `Budget engine request failed with HTTP ${response.status}.`),
        { code: body.code, status: response.status },
      );
    }
    return body as unknown as T;
  }

  async function writeJson<T = void>(
    path: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<T> {
    const response = await fetchImplementation(`${apiBaseUrl}${path}`, {
      method,
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as {
      code?: string;
      message?: string;
    };
    if (!response.ok) {
      throw Object.assign(
        new Error(result.message ?? `Budget engine request failed with HTTP ${response.status}.`),
        { code: result.code, status: response.status },
      );
    }
    registerBootstrapCache.clear();
    budgetMonthCache.clear();
    return result as unknown as T;
  }

  function transactionPath(input: TransactionTarget, transactionId?: string) {
    const base = `/api/budget-engine/budgets/${encodeURIComponent(input.budgetId)}` +
      `/accounts/${encodeURIComponent(input.accountId)}/transactions`;
    return transactionId ? `${base}/${encodeURIComponent(transactionId)}` : base;
  }

  function transactionSearch(input: AccountTransactionQuery) {
    const search = new URLSearchParams({ limit: String(input.limit) });
    if (input.before) {
      search.set("beforeDate", input.before.date);
      search.set("beforeId", input.before.id);
    }
    if (input.offset !== undefined) search.set("offset", String(input.offset));
    if (input.search?.query) {
      search.set("query", input.search.query);
      search.set("scope", input.search.scope);
    }
    if (input.categoryFilter) search.set("categoryFilter", input.categoryFilter);
    if (input.sort) {
      search.set("sortColumn", input.sort.column);
      search.set("sortDirection", input.sort.direction);
    }
    return search;
  }

  function readAccountRegisterBootstrap(input: AccountTransactionQuery) {
    const search = transactionSearch(input);
    const key = `${input.budgetId}\u0000${input.accountId}\u0000${search}`;
    const cached = registerBootstrapCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = readJson<AccountRegisterBootstrap>(
      `/api/budget-engine/budgets/${encodeURIComponent(input.budgetId)}` +
        `/accounts/${encodeURIComponent(input.accountId)}/register?${search}`,
    );
    registerBootstrapCache.set(key, {
      expiresAt: Date.now() + REGISTER_BOOTSTRAP_CACHE_MS,
      value,
    });
    void value.catch(() => {
      if (registerBootstrapCache.get(key)?.value === value) {
        registerBootstrapCache.delete(key);
      }
    });
    return value;
  }

  function readBudgetMonth(input: { readonly budgetId: string; readonly month: string }) {
    const key = `${input.budgetId}\u0000${input.month}`;
    const cached = budgetMonthCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = readJson<BudgetMonthView>(
      `/api/budget-engine/budgets/${encodeURIComponent(input.budgetId)}` +
        `/months/${encodeURIComponent(input.month)}`,
    );
    budgetMonthCache.set(key, {
      expiresAt: Date.now() + BUDGET_MONTH_CACHE_MS,
      value,
    });
    void value.catch(() => {
      if (budgetMonthCache.get(key)?.value === value) budgetMonthCache.delete(key);
    });
    return value;
  }

  return {
    getBudgetStatus(budgetId) {
      const cached = statusCache.get(budgetId);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      const value = readJson<BudgetEngineStatus>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/status`,
      );
      statusCache.set(budgetId, {
        expiresAt: Date.now() + STATUS_CACHE_MS,
        value,
      });
      void value.catch(() => {
        if (statusCache.get(budgetId)?.value === value) {
          statusCache.delete(budgetId);
        }
      });
      return value;
    },
    getBudgetExportUrl(budgetId, kind) {
      return `${apiBaseUrl}/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
        `/export?kind=${encodeURIComponent(kind)}`;
    },
    getAccountRegisterBootstrap(input) {
      return readAccountRegisterBootstrap(input);
    },
    prefetchAccountRegister(input) {
      void readAccountRegisterBootstrap(input).catch(() => {});
    },
    async restoreBudget(budgetId, file) {
      const response = await fetchImplementation(
        `${apiBaseUrl}/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/restore`,
        {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/x-ndjson" },
          body: file,
        },
      );
      const result = await response.json().catch(() => ({})) as {
        code?: string;
        message?: string;
      };
      if (!response.ok) {
        throw Object.assign(
          new Error(result.message ?? `Budget restore failed with HTTP ${response.status}.`),
          { code: result.code, status: response.status },
        );
      }
      statusCache.delete(budgetId);
      registerBootstrapCache.clear();
      budgetMonthCache.clear();
      return result as BudgetRestoreResult;
    },
    async resetBudget(budgetId, month) {
      await writeJson(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/reset`,
        "POST",
        { month },
      );
    },
    async deleteBudget(budgetId) {
      await writeJson(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}`,
        "DELETE",
      );
      statusCache.delete(budgetId);
    },
    async createAccount(budgetId, input) {
      const result = await writeJson<{ accounts: readonly HostedAccountRow[] }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/accounts`,
        "POST",
        { ...input, startingBalance: Math.round(input.startingBalance * 100) },
      );
      return result.accounts.map(mapHostedAccount);
    },
    async updateAccount(budgetId, input) {
      const result = await writeJson<{ accounts: readonly HostedAccountRow[] }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/accounts/${encodeURIComponent(input.id)}`,
        "PATCH",
        { name: input.name, type: input.type },
      );
      return result.accounts.map(mapHostedAccount);
    },
    async deleteAccount(budgetId, accountId) {
      const result = await writeJson<{
        deleted: boolean;
        reason?: string;
        accounts: readonly HostedAccountRow[];
      }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/accounts/${encodeURIComponent(accountId)}`,
        "DELETE",
      );
      return {
        deleted: result.deleted,
        reason: result.reason,
        accounts: result.accounts.map(mapHostedAccount),
      };
    },
    async listPayees(budgetId, archived = false) {
      const result = await readJson<{ payees: readonly PayeeView[] }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/payees?archived=${archived}`,
      );
      return result.payees;
    },
    async createPayee(budgetId, name) {
      const result = await writeJson<{ payees: readonly PayeeView[] }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/payees`,
        "POST",
        { name },
      );
      return result.payees;
    },
    async updatePayee(budgetId, input) {
      const result = await writeJson<{ payees: readonly PayeeView[] }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/payees/${encodeURIComponent(input.id)}`,
        "PATCH",
        input,
      );
      return result.payees;
    },
    async setPayeeArchived(budgetId, payeeId, archived) {
      const result = await writeJson<{ payees: readonly PayeeView[] }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/payees/${encodeURIComponent(payeeId)}/${archived ? "archive" : "restore"}`,
        "POST",
      );
      return result.payees;
    },
    async mergePayees(budgetId, input) {
      const result = await writeJson<{ payees: readonly PayeeView[] }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/payees/${encodeURIComponent(input.sourcePayeeId)}/merge`,
        "POST",
        { targetPayeeId: input.targetPayeeId },
      );
      return result.payees;
    },
    async listTransactionTags(budgetId) {
      const result = await readJson<{
        tags: readonly TransactionTagDefinition[];
      }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/tags`,
      );
      return result.tags;
    },
    async replaceTransactionTags(budgetId, tags) {
      const result = await writeJson<{
        tags: readonly TransactionTagDefinition[];
      }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/tags`,
        "PUT",
        { tags },
      );
      return result.tags;
    },
    async listScheduledTransactions(budgetId, accountId) {
      const result = await readJson<{
        schedules: readonly ScheduledTransactionView[];
      }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/accounts/${encodeURIComponent(accountId)}/schedules`,
      );
      return result.schedules;
    },
    async createScheduledTransaction(budgetId, input) {
      const result = await writeJson<{
        schedules: readonly ScheduledTransactionView[];
      }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/accounts/${encodeURIComponent(input.accountId)}/schedules`,
        "POST",
        input,
      );
      return result.schedules;
    },
    async updateScheduledTransaction(budgetId, scheduleId, input) {
      const result = await writeJson<{
        schedules: readonly ScheduledTransactionView[];
      }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/accounts/${encodeURIComponent(input.accountId)}/schedules/` +
          encodeURIComponent(scheduleId),
        "PATCH",
        input,
      );
      return result.schedules;
    },
    async deleteScheduledTransaction(budgetId, accountId, scheduleId) {
      const result = await writeJson<{
        schedules: readonly ScheduledTransactionView[];
      }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/accounts/${encodeURIComponent(accountId)}/schedules/` +
          encodeURIComponent(scheduleId),
        "DELETE",
      );
      return result.schedules;
    },
    async advanceScheduledTransaction(budgetId, accountId, scheduleId) {
      const result = await writeJson<{
        schedules: readonly ScheduledTransactionView[];
      }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/accounts/${encodeURIComponent(accountId)}/schedules/` +
          `${encodeURIComponent(scheduleId)}/advance`,
        "POST",
      );
      return result.schedules;
    },
    async renameScheduledPayeeReferences(budgetId, input) {
      await writeJson(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          "/schedules/payees/rename",
        "PATCH",
        input,
      );
    },
    async reassignScheduledPayeeReferences(budgetId, input) {
      await writeJson(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          "/schedules/payees/reassign",
        "PATCH",
        input,
      );
    },
    async mutateCategory(budgetId, input) {
      const result = await writeJson<{ view: BudgetMonthView }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/categories`,
        "PATCH",
        input,
      );
      return result.view;
    },
    getCategoryMergePreview(input) {
      const search = new URLSearchParams({
        month: input.month,
        sourceCategoryId: input.sourceCategoryId,
        targetCategoryId: input.targetCategoryId,
      });
      return readJson<CategoryMergePreview>(
        `/api/budget-engine/budgets/${encodeURIComponent(input.budgetId)}` +
          `/categories/merge-preview?${search}`,
      );
    },

    async listAccounts(budgetId) {
      return (await readAccountNavigation(budgetId))
        .map((entry) => entry.account);
    },

    listAccountNavigation(budgetId) {
      return readAccountNavigation(budgetId);
    },

    setAccountClosed(input) {
      return writeJson(
        `/api/budget-engine/budgets/${encodeURIComponent(input.budgetId)}` +
          `/accounts/${encodeURIComponent(input.accountId)}/closed`,
        "PATCH",
        { closed: input.closed },
      );
    },

    getBudgetMonthView(input) {
      return readBudgetMonth(input);
    },

    prefetchBudgetMonthView(input) {
      void readBudgetMonth(input).catch(() => {});
    },

    setCategoryAssignedValues(input) {
      return writeJson<BudgetMonthView>(
        `/api/budget-engine/budgets/${encodeURIComponent(input.budgetId)}` +
          `/months/${encodeURIComponent(input.month)}`,
        "PATCH",
        { assignments: input.assignments },
      );
    },

    async getBudgetCategoryOptions(input) {
      const view = await this.getBudgetMonthView(input);
      return [
        {
          id: "__ready_to_assign__",
          name: "Ready to Assign",
          groupId: "__income__",
          groupName: "Income",
        },
        ...view.categoryGroups.flatMap((group) =>
          group.categories.map((category) => ({
            id: category.id,
            name: category.name,
            groupId: group.id,
            groupName: group.name,
            isArchived: category.isArchived,
          })),
        ),
      ];
    },

    getFinancialOverview(budgetId, month) {
      return readJson<FinancialOverview>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/dashboard/${encodeURIComponent(month)}`,
      );
    },

    async getMonthlySpending(budgetId, month) {
      const result = await readJson<{
        rows: readonly SpendingCategoryRow[];
      }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/reports/${encodeURIComponent(month)}/spending`,
      );
      return result.rows;
    },

    async getMonthlyCategoryTransactions(budgetId, month, categoryId) {
      const result = await readJson<{
        transactions: readonly RegisterTransactionView[];
      }>(
        `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}` +
          `/reports/${encodeURIComponent(month)}/spending/` +
          encodeURIComponent(categoryId),
      );
      return result.transactions;
    },

    async getCategoryActivityDrilldown(input) {
      const [view, transactions] = await Promise.all([
        this.getBudgetMonthView(input),
        this.getMonthlyCategoryTransactions(
          input.budgetId,
          input.month,
          input.categoryId,
        ),
      ]);
      const category = view.categoryGroups.flatMap(({ categories }) => categories)
        .find(({ id }) => id === input.categoryId);
      if (!category) throw new Error("Category not found.");
      const rows = transactions.map((transaction) => ({
        id: transaction.id,
        transactionId: transaction.id,
        accountId: "",
        accountName: "",
        date: transaction.date,
        payee: transaction.payee || "Unspecified payee",
        memo: transaction.memo ?? "",
        categoryId: input.categoryId,
        categoryName: category.name,
        inflow: transaction.inflow,
        outflow: transaction.outflow,
        amount: transaction.inflow - transaction.outflow,
        isSplit: false,
      }));
      const totalInflow = rows.reduce((sum, row) => sum + row.inflow, 0);
      const totalOutflow = rows.reduce((sum, row) => sum + row.outflow, 0);
      return {
        budgetId: input.budgetId,
        month: input.month,
        monthLabel: view.monthLabel,
        categoryId: input.categoryId,
        categoryName: category.name,
        currencyCode: view.currencyCode,
        rows,
        totalInflow,
        totalOutflow,
        netActivity: totalInflow - totalOutflow,
      };
    },

    getAccountSummary(input) {
      return readJson<AccountRegisterSummary>(
        `/api/budget-engine/budgets/${encodeURIComponent(input.budgetId)}` +
          `/accounts/${encodeURIComponent(input.accountId)}/summary`,
      );
    },

    queryTransactions(input: AccountTransactionQuery) {
      const search = transactionSearch(input);
      return readJson<AccountTransactionPage>(
        `/api/budget-engine/budgets/${encodeURIComponent(input.budgetId)}` +
          `/accounts/${encodeURIComponent(input.accountId)}/transactions?${search}`,
      );
    },

    addTransaction(input) {
      return writeJson(transactionPath(input), "POST", input);
    },

    commitTransactionBatch(input) {
      return writeJson(
        `${transactionPath(input)}/batch`,
        "POST",
        { additions: input.additions, updates: input.updates },
      );
    },

    moveTransactions(input) {
      return writeJson(
        transactionPath({
          budgetId: input.budgetId,
          accountId: input.sourceAccountId,
        }) + "/move",
        "POST",
        {
          targetAccountId: input.targetAccountId,
          transactionIds: input.transactionIds,
        },
      );
    },

    updateTransaction(transactionId, input) {
      return writeJson(transactionPath(input, transactionId), "PATCH", input);
    },

    toggleTransactionCleared(transactionId, input) {
      return writeJson(`${transactionPath(input, transactionId)}/toggle-cleared`, "POST");
    },

    deleteTransaction(transactionId, input) {
      return writeJson(transactionPath(input, transactionId), "DELETE");
    },

    async addTransactionAttachment() {
      throw new Error("Hosted attachment mutations are retired; use the local-first SQLite client.");
    },

    async removeTransactionAttachment() {
      throw new Error("Hosted attachment mutations are retired; use the local-first SQLite client.");
    },

    async readTransactionAttachment() {
      return null;
    },
  };

  async function readAccountNavigation(
    budgetId: string,
  ): Promise<readonly AccountNavigation[]> {
    const result = await readJson<{
      readonly accounts: readonly HostedAccountRow[];
    }>(
      `/api/budget-engine/budgets/${encodeURIComponent(budgetId)}/accounts`,
    );
    return result.accounts.map((account) => ({
      account: mapHostedAccount(account),
      currencyCode: account.currencyCode,
      workingBalance: account.workingBalance / 100,
      hasUncategorizedTransactions: account.hasUncategorizedTransactions,
      transactionCount: account.transactionCount,
    }));
  }
}

function mapHostedAccount(account: HostedAccountRow): SidebarAccount {
  return {
    id: account.id,
    name: account.name,
    type: mapHostedAccountType(account.type, account.participation),
    startingBalance: account.openingBalance / 100,
    createdAt: new Date(0).toISOString(),
    closedAt: account.closedAt,
  };
}

function mapHostedAccountType(
  accountType: string,
  participation: string,
): SidebarAccount["type"] {
  if (
    participation === "off-budget" ||
    participation === "tracking" ||
    accountType === "tracking"
  ) {
    return "tracking";
  }
  if (
    accountType === "credit-card" ||
    accountType === "creditCard" ||
    accountType === "credit"
  ) {
    return "credit-card";
  }
  return "on-budget";
}
