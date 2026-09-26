import Database from "better-sqlite3";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import {
  projectBudget,
  type BudgetMonthProjection,
  type BudgetProjectionAccountFact,
  type BudgetProjectionAssignmentFact,
  type BudgetProjectionCategoryFact,
  type BudgetProjectionInput,
  type BudgetProjectionTransactionFact,
} from "../../packages/budget-engine/src/projection/projectBudget.js";

export interface ProjectionBenchmarkOptions {
  readonly monthCount: number;
  readonly categoryCount: number;
  readonly accountCount: number;
  readonly transactionCount: number;
  readonly iterations: number;
  readonly replayWindows: readonly number[];
  readonly outputPath?: string | null;
}

interface BenchmarkFixture {
  readonly budgetId: string;
  readonly months: readonly string[];
  readonly accounts: readonly BudgetProjectionAccountFact[];
  readonly categories: readonly BudgetProjectionCategoryFact[];
  readonly assignments: readonly BudgetProjectionAssignmentFact[];
  readonly transactions: readonly BudgetProjectionTransactionFact[];
}

interface TimingSummary {
  readonly samples: readonly number[];
  readonly min: number;
  readonly median: number;
  readonly max: number;
}

interface ReplayWindowReport {
  readonly replayMonths: number;
  readonly firstMonth: string;
  readonly targetMonth: string;
  readonly transactionFacts: number;
  readonly splitFacts: number;
  readonly timingsMs: {
    readonly extractFacts: TimingSummary;
    readonly extractionBreakdown: {
      readonly accounts: TimingSummary;
      readonly categories: TimingSummary;
      readonly assignments: TimingSummary;
      readonly transactionQuery: TimingSummary;
      readonly transactionHydration: TimingSummary;
    };
    readonly project: TimingSummary;
    readonly cacheWrite: TimingSummary;
    readonly cachedRead: TimingSummary;
    readonly totalColdPath: TimingSummary;
  };
  readonly correctness: {
    readonly matchesFullProjection: boolean;
  };
}

export interface ProjectionBenchmarkReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly configuration: ProjectionBenchmarkOptions;
  readonly dataset: {
    readonly months: number;
    readonly categories: number;
    readonly accounts: number;
    readonly transactions: number;
    readonly splits: number;
  };
  readonly fixtureBuildMs: number;
  readonly fullHistoryProjectionMs: number;
  readonly replayWindows: readonly ReplayWindowReport[];
  readonly memory: {
    readonly heapUsedBeforeBytes: number;
    readonly heapUsedAfterBytes: number;
    readonly heapDeltaBytes: number;
    readonly rssAfterBytes: number;
  };
}

interface ExtractionTiming {
  readonly accounts: number;
  readonly categories: number;
  readonly assignments: number;
  readonly transactionQuery: number;
  readonly transactionHydration: number;
}

interface ExtractedFacts {
  readonly accounts: readonly BudgetProjectionAccountFact[];
  readonly categories: readonly BudgetProjectionCategoryFact[];
  readonly assignments: readonly BudgetProjectionAssignmentFact[];
  readonly transactions: readonly BudgetProjectionTransactionFact[];
  readonly timingsMs: ExtractionTiming;
}

const round = (value: number) => Math.round(value * 100) / 100;

function elapsed(start: number): number {
  return round(performance.now() - start);
}

function canonicalProjection(projection: BudgetMonthProjection): unknown {
  return {
    ...projection,
    groups: [...projection.groups].sort((left, right) =>
      left.groupId.localeCompare(right.groupId)),
    categories: [...projection.categories].sort((left, right) =>
      left.categoryId.localeCompare(right.categoryId)),
  };
}

function projectionsEqual(
  left: BudgetMonthProjection,
  right: BudgetMonthProjection,
): boolean {
  return JSON.stringify(canonicalProjection(left)) ===
    JSON.stringify(canonicalProjection(right));
}

function timingSummary(samples: readonly number[]): TimingSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    samples: sorted,
    min: sorted[0] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    max: sorted.at(-1) ?? 0,
  };
}

function monthOffset(month: string, offset: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1 + offset;
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function enumerateMonths(throughMonth: string, count: number): string[] {
  const firstMonth = monthOffset(throughMonth, -(count - 1));
  return Array.from({ length: count }, (_, index) => monthOffset(firstMonth, index));
}

function nextMonthStart(month: string): string {
  return `${monthOffset(month, 1)}-01`;
}

function createFixture(options: ProjectionBenchmarkOptions): BenchmarkFixture {
  const budgetId = "p0-6-projection-benchmark";
  const months = enumerateMonths("2026-09", options.monthCount);
  const accounts = Array.from({ length: options.accountCount }, (_, index) => ({
    id: `account-${index.toString().padStart(2, "0")}`,
    participation: "on-budget" as const,
    type: index === options.accountCount - 1 ? "credit-card" as const : "cash" as const,
    openingBalance: index === options.accountCount - 1 ? -75_000 : 25_000,
  }));
  const creditCardAccount = accounts.at(-1)!;
  const paymentCategoryId = `credit-card-payment-${creditCardAccount.id}`;
  const categories = Array.from({ length: options.categoryCount }, (_, index) => ({
    id: index === options.categoryCount - 1
      ? paymentCategoryId
      : `category-${index.toString().padStart(3, "0")}`,
    groupId: index === options.categoryCount - 1
      ? "__credit_card_payments__"
      : `group-${Math.floor(index / 10).toString().padStart(2, "0")}`,
    overspendingPolicy: index % 11 === 0 ? "carry-category" as const : "reduce-next-month" as const,
  }));
  const spendingCategories = categories.filter(({ id }) => id !== paymentCategoryId);
  const assignments = months.flatMap((month, monthIndex) =>
    categories.map((category, categoryIndex) => ({
      month,
      categoryId: category.id,
      amount: 7_500 + ((monthIndex + categoryIndex) % 9) * 500,
    })),
  );

  const transactions: BudgetProjectionTransactionFact[] = [];
  for (let index = 0; index < options.transactionCount; index += 1) {
    const monthIndex = index % months.length;
    const month = months[monthIndex]!;
    const day = String((Math.floor(index / months.length) % 28) + 1).padStart(2, "0");
    const account = accounts[index % accounts.length]!;
    const id = `transaction-${index.toString().padStart(8, "0")}`;

    if (index % 20 === 0) {
      transactions.push({
        id,
        accountId: account.id,
        date: `${month}-${day}`,
        categoryId: null,
        incomeBudgetMonth: month,
        inflowClassification: "income",
        amount: 45_000 + (index % 7) * 1_000,
      });
      continue;
    }

    const category = spendingCategories[index % spendingCategories.length]!;
    const outflow = -(900 + (index % 37) * 25);
    if (index % 10 === 0 && categories.length >= 2) {
      const second = spendingCategories[(index + 1) % spendingCategories.length]!;
      const firstAmount = Math.trunc(outflow / 2);
      const secondAmount = outflow - firstAmount;
      transactions.push({
        id,
        accountId: account.id,
        date: `${month}-${day}`,
        categoryId: null,
        amount: outflow,
        splits: [
          { id: `${id}-a`, categoryId: category.id, amount: firstAmount },
          { id: `${id}-b`, categoryId: second.id, amount: secondAmount },
        ],
      });
      continue;
    }

    transactions.push({
      id,
      accountId: account.id,
      date: `${month}-${day}`,
      categoryId: category.id,
      amount: outflow,
    });
  }

  return { budgetId, months, accounts, categories, assignments, transactions };
}

function initialiseDatabase(database: Database.Database): void {
  database.exec(`
    PRAGMA journal_mode = MEMORY;
    PRAGMA synchronous = OFF;

    CREATE TABLE local_accounts (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      type TEXT NOT NULL,
      participation TEXT NOT NULL,
      opening_balance INTEGER NOT NULL
    );
    CREATE TABLE local_categories (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      overspending_policy TEXT NOT NULL
    );
    CREATE TABLE local_budget_assignments (
      budget_id TEXT NOT NULL,
      month TEXT NOT NULL,
      category_id TEXT NOT NULL,
      assigned INTEGER NOT NULL,
      PRIMARY KEY (budget_id, month, category_id)
    );
    CREATE TABLE local_transactions (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      date TEXT NOT NULL,
      category_id TEXT,
      transfer_account_id TEXT,
      income_budget_month TEXT,
      inflow_classification TEXT,
      amount INTEGER NOT NULL
    );
    CREATE INDEX local_transactions_register
      ON local_transactions(budget_id, account_id, date DESC, id DESC);
    CREATE INDEX local_transactions_budget_date
      ON local_transactions(budget_id, date, id);
    CREATE TABLE local_transaction_splits (
      transaction_id TEXT NOT NULL,
      id TEXT NOT NULL,
      category_id TEXT,
      transfer_account_id TEXT,
      income_budget_month TEXT,
      inflow_classification TEXT,
      amount INTEGER NOT NULL,
      PRIMARY KEY (transaction_id, id)
    );
    CREATE INDEX local_transaction_splits_transaction
      ON local_transaction_splits(transaction_id, id);
    CREATE TABLE local_budget_projection_cache (
      budget_id TEXT NOT NULL,
      month TEXT NOT NULL,
      engine_version INTEGER NOT NULL,
      projection_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (budget_id, month)
    );
  `);
}

function seedDatabase(database: Database.Database, fixture: BenchmarkFixture): void {
  const insertAccount = database.prepare(
    "INSERT INTO local_accounts(id,budget_id,type,participation,opening_balance) VALUES(?,?,?,?,?)",
  );
  const insertCategory = database.prepare(
    "INSERT INTO local_categories(id,budget_id,group_id,overspending_policy) VALUES(?,?,?,?)",
  );
  const insertAssignment = database.prepare(
    "INSERT INTO local_budget_assignments(budget_id,month,category_id,assigned) VALUES(?,?,?,?)",
  );
  const insertTransaction = database.prepare(
    "INSERT INTO local_transactions(id,budget_id,account_id,date,category_id,transfer_account_id,income_budget_month,inflow_classification,amount) VALUES(?,?,?,?,?,?,?,?,?)",
  );
  const insertSplit = database.prepare(
    "INSERT INTO local_transaction_splits(transaction_id,id,category_id,transfer_account_id,income_budget_month,inflow_classification,amount) VALUES(?,?,?,?,?,?,?)",
  );

  database.transaction(() => {
    for (const account of fixture.accounts) {
      insertAccount.run(
        account.id,
        fixture.budgetId,
        account.type ?? "cash",
        account.participation,
        account.openingBalance ?? 0,
      );
    }
    for (const category of fixture.categories) {
      insertCategory.run(
        category.id,
        fixture.budgetId,
        category.groupId,
        category.overspendingPolicy,
      );
    }
    for (const assignment of fixture.assignments) {
      insertAssignment.run(
        fixture.budgetId,
        assignment.month,
        assignment.categoryId,
        assignment.amount,
      );
    }
    for (const transaction of fixture.transactions) {
      insertTransaction.run(
        transaction.id,
        fixture.budgetId,
        transaction.accountId,
        transaction.date,
        transaction.categoryId,
        transaction.transferAccountId ?? null,
        transaction.incomeBudgetMonth ?? null,
        transaction.inflowClassification ?? null,
        transaction.amount,
      );
      for (const split of transaction.splits ?? []) {
        insertSplit.run(
          transaction.id,
          split.id,
          split.categoryId,
          split.transferAccountId ?? null,
          split.incomeBudgetMonth ?? null,
          split.inflowClassification ?? null,
          split.amount,
        );
      }
    }
  })();
}

function extractFacts(
  database: Database.Database,
  budgetId: string,
  firstMonth: string,
  targetMonth: string,
): ExtractedFacts {
  let started = performance.now();
  const accounts = database.prepare(
    `SELECT account.id, account.type, account.participation,
       account.opening_balance + COALESCE((
         SELECT SUM(transaction_row.amount)
         FROM local_transactions AS transaction_row
         WHERE transaction_row.budget_id = account.budget_id
           AND transaction_row.account_id = account.id
           AND transaction_row.date < ?
       ), 0) AS openingBalance
     FROM local_accounts AS account
     WHERE account.budget_id = ?
     ORDER BY account.id`,
  ).all(`${firstMonth}-01`, budgetId) as Array<{
    id: string;
    type: string;
    participation: string;
    openingBalance: number;
  }>;
  const accountsMs = elapsed(started);

  started = performance.now();
  const categories = database.prepare(
    "SELECT id, group_id AS groupId, overspending_policy AS overspendingPolicy FROM local_categories WHERE budget_id = ? ORDER BY group_id, id",
  ).all(budgetId) as Array<{
    id: string;
    groupId: string;
    overspendingPolicy: "reduce-next-month" | "carry-category";
  }>;
  const categoriesMs = elapsed(started);

  started = performance.now();
  const assignments = database.prepare(
    `SELECT month, category_id AS categoryId, assigned
     FROM local_budget_assignments
     WHERE budget_id = ? AND month >= ? AND month <= ?
     ORDER BY month, category_id`,
  ).all(budgetId, firstMonth, targetMonth) as Array<{
    month: string;
    categoryId: string;
    assigned: number;
  }>;
  const assignmentsMs = elapsed(started);

  started = performance.now();
  const transactionRows = database.prepare(
    `SELECT transaction_row.id,
       transaction_row.account_id AS accountId,
       transaction_row.date,
       transaction_row.category_id AS categoryId,
       transaction_row.transfer_account_id AS transferAccountId,
       transaction_row.income_budget_month AS incomeBudgetMonth,
       transaction_row.inflow_classification AS inflowClassification,
       transaction_row.amount,
       COALESCE((
         SELECT json_group_array(
           json_object(
             'id', ordered_split.id,
             'categoryId', ordered_split.category_id,
             'transferAccountId', ordered_split.transfer_account_id,
             'incomeBudgetMonth', ordered_split.income_budget_month,
             'inflowClassification', ordered_split.inflow_classification,
             'amount', ordered_split.amount
           )
         )
         FROM (
           SELECT id, category_id, transfer_account_id, income_budget_month, inflow_classification, amount
           FROM local_transaction_splits
           WHERE transaction_id = transaction_row.id
           ORDER BY id
         ) AS ordered_split
       ), '[]') AS splitsJson
     FROM local_transactions AS transaction_row
     WHERE transaction_row.budget_id = ? AND transaction_row.date >= ?
       AND transaction_row.date < ?
     ORDER BY transaction_row.date, transaction_row.id`,
  ).all(
    budgetId,
    `${firstMonth}-01`,
    nextMonthStart(targetMonth),
  ) as Array<{
    id: string;
    accountId: string;
    date: string;
    categoryId: string | null;
    transferAccountId: string | null;
    incomeBudgetMonth: string | null;
    inflowClassification: "income" | "category-inflow" | null;
    amount: number;
    splitsJson: string;
  }>;
  const transactionQueryMs = elapsed(started);

  started = performance.now();
  const transactions = transactionRows.map((transaction) => ({
    id: transaction.id,
    accountId: transaction.accountId,
    date: transaction.date,
    categoryId: transaction.categoryId,
    transferAccountId: transaction.transferAccountId,
    incomeBudgetMonth: transaction.incomeBudgetMonth,
    inflowClassification: transaction.inflowClassification,
    amount: transaction.amount,
    splits: JSON.parse(transaction.splitsJson) as Array<{
      id: string;
      categoryId: string | null;
      transferAccountId: string | null;
      incomeBudgetMonth: string | null;
      inflowClassification: "income" | "category-inflow" | null;
      amount: number;
    }>,
  }));
  const transactionHydrationMs = elapsed(started);

  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      type: account.type === "credit-card" ? "credit-card" as const : "cash" as const,
      participation: account.participation === "on-budget"
        ? "on-budget" as const
        : "off-budget" as const,
      openingBalance: account.openingBalance,
    })),
    categories,
    assignments: assignments.map((assignment) => ({
      month: assignment.month,
      categoryId: assignment.categoryId,
      amount: assignment.assigned,
    })),
    transactions,
    timingsMs: {
      accounts: accountsMs,
      categories: categoriesMs,
      assignments: assignmentsMs,
      transactionQuery: transactionQueryMs,
      transactionHydration: transactionHydrationMs,
    },
  };
}

function paymentCategoryMap(
  accounts: readonly BudgetProjectionAccountFact[],
  categories: readonly BudgetProjectionCategoryFact[],
): Readonly<Record<string, string>> {
  const categoryIds = new Set(categories.map(({ id }) => id));
  return Object.fromEntries(
    accounts.flatMap((account) => {
      if (account.type !== "credit-card") return [];
      const categoryId = `credit-card-payment-${account.id}`;
      return categoryIds.has(categoryId) ? [[account.id, categoryId]] : [];
    }),
  );
}

function openingForReplay(
  fullMonths: readonly BudgetMonthProjection[],
  firstMonthIndex: number,
): Pick<
  BudgetProjectionInput,
  "openingReadyToAssign" | "openingPreviousOverspending" | "openingAvailableByCategoryId"
> {
  if (firstMonthIndex === 0) {
    return {
      openingReadyToAssign: 0,
      openingPreviousOverspending: 0,
      openingAvailableByCategoryId: {},
    };
  }
  const prior = fullMonths[firstMonthIndex - 1]!;
  return {
    openingReadyToAssign: prior.readyToAssign,
    openingPreviousOverspending: prior.categories.reduce(
      (total, category) =>
        total + (
          category.available < 0 &&
          category.overspendingPolicy === "reduce-next-month"
            ? category.available
            : 0
        ),
      0,
    ),
    openingAvailableByCategoryId: Object.fromEntries(
      prior.categories.map((category) => [
        category.categoryId,
        category.available > 0 ||
        (category.available < 0 && category.overspendingPolicy === "carry-category")
          ? category.available
          : 0,
      ]),
    ),
  };
}

function writeProjectionCache(
  database: Database.Database,
  budgetId: string,
  projections: readonly BudgetMonthProjection[],
): void {
  const upsert = database.prepare(
    `INSERT INTO local_budget_projection_cache(
       budget_id, month, engine_version, projection_json, updated_at
     ) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(budget_id, month) DO UPDATE SET
       engine_version = excluded.engine_version,
       projection_json = excluded.projection_json,
       updated_at = excluded.updated_at`,
  );
  const updatedAt = new Date(0).toISOString();
  database.transaction(() => {
    for (const projection of projections) {
      upsert.run(budgetId, projection.month, JSON.stringify(projection), updatedAt);
    }
  })();
}

function cachedRead(
  database: Database.Database,
  budgetId: string,
  targetMonth: string,
): BudgetMonthProjection {
  const row = database.prepare(
    "SELECT projection_json AS projectionJson FROM local_budget_projection_cache WHERE budget_id = ? AND month = ? AND engine_version = 1",
  ).get(budgetId, targetMonth) as { projectionJson: string } | undefined;
  if (!row) throw new Error(`Missing cached projection for ${targetMonth}.`);
  return JSON.parse(row.projectionJson) as BudgetMonthProjection;
}

export async function runProjectionBenchmark(
  options: ProjectionBenchmarkOptions,
): Promise<ProjectionBenchmarkReport> {
  if (!Number.isSafeInteger(options.monthCount) || options.monthCount < 1) {
    throw new Error("monthCount must be a positive safe integer");
  }
  if (!Number.isSafeInteger(options.categoryCount) || options.categoryCount < 1) {
    throw new Error("categoryCount must be a positive safe integer");
  }
  if (!Number.isSafeInteger(options.accountCount) || options.accountCount < 1) {
    throw new Error("accountCount must be a positive safe integer");
  }
  if (!Number.isSafeInteger(options.transactionCount) || options.transactionCount < 1) {
    throw new Error("transactionCount must be a positive safe integer");
  }
  if (!Number.isSafeInteger(options.iterations) || options.iterations < 1) {
    throw new Error("iterations must be a positive safe integer");
  }

  const heapBefore = process.memoryUsage().heapUsed;
  const fixtureStarted = performance.now();
  const fixture = createFixture(options);
  const database = new Database(":memory:");
  initialiseDatabase(database);
  seedDatabase(database, fixture);
  const fixtureBuildMs = elapsed(fixtureStarted);

  const fullPaymentCategories = paymentCategoryMap(fixture.accounts, fixture.categories);
  const fullInput: BudgetProjectionInput = {
    budgetId: fixture.budgetId,
    fromMonth: fixture.months[0]!,
    throughMonth: fixture.months.at(-1)!,
    openingReadyToAssign: 0,
    openingPreviousOverspending: 0,
    openingAvailableByCategoryId: {},
    creditCardPolicy: Object.keys(fullPaymentCategories).length > 0
      ? "payment-funding"
      : "manual",
    paymentCategoryIdByAccountId: fullPaymentCategories,
    accounts: fixture.accounts,
    categories: fixture.categories,
    assignments: fixture.assignments,
    transactions: fixture.transactions,
  };

  const fullStarted = performance.now();
  const fullProjection = projectBudget(fullInput);
  const fullHistoryProjectionMs = elapsed(fullStarted);
  const targetMonth = fixture.months.at(-1)!;
  const expectedTarget = fullProjection.months.at(-1)!;
  const replayWindows: ReplayWindowReport[] = [];

  for (const requestedReplayMonths of options.replayWindows) {
    const replayMonths = Math.min(requestedReplayMonths, options.monthCount);
    const firstMonthIndex = options.monthCount - replayMonths;
    const firstMonth = fixture.months[firstMonthIndex]!;
    const extractSamples: number[] = [];
    const extractionBreakdownSamples = {
      accounts: [] as number[],
      categories: [] as number[],
      assignments: [] as number[],
      transactionQuery: [] as number[],
      transactionHydration: [] as number[],
    };
    const projectSamples: number[] = [];
    const cacheWriteSamples: number[] = [];
    const cachedReadSamples: number[] = [];
    const totalSamples: number[] = [];
    let lastFacts: ExtractedFacts | null = null;
    let matchesFullProjection = true;

    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      const coldStarted = performance.now();
      let started = performance.now();
      const facts = extractFacts(database, fixture.budgetId, firstMonth, targetMonth);
      extractSamples.push(elapsed(started));
      extractionBreakdownSamples.accounts.push(facts.timingsMs.accounts);
      extractionBreakdownSamples.categories.push(facts.timingsMs.categories);
      extractionBreakdownSamples.assignments.push(facts.timingsMs.assignments);
      extractionBreakdownSamples.transactionQuery.push(facts.timingsMs.transactionQuery);
      extractionBreakdownSamples.transactionHydration.push(facts.timingsMs.transactionHydration);
      lastFacts = facts;

      const opening = openingForReplay(fullProjection.months, firstMonthIndex);
      const replayPaymentCategories = paymentCategoryMap(facts.accounts, facts.categories);
      started = performance.now();
      const replay = projectBudget({
        budgetId: fixture.budgetId,
        fromMonth: firstMonth,
        throughMonth: targetMonth,
        creditCardPolicy: Object.keys(replayPaymentCategories).length > 0
          ? "payment-funding"
          : "manual",
        paymentCategoryIdByAccountId: replayPaymentCategories,
        ...opening,
        accounts: facts.accounts,
        categories: facts.categories,
        assignments: facts.assignments,
        transactions: facts.transactions,
      });
      projectSamples.push(elapsed(started));

      const replayTarget = replay.months.at(-1)!;
      matchesFullProjection =
        matchesFullProjection &&
        projectionsEqual(replayTarget, expectedTarget);

      database.prepare(
        "DELETE FROM local_budget_projection_cache WHERE budget_id = ? AND month >= ?",
      ).run(fixture.budgetId, firstMonth);
      started = performance.now();
      writeProjectionCache(database, fixture.budgetId, replay.months);
      cacheWriteSamples.push(elapsed(started));
      totalSamples.push(elapsed(coldStarted));

      started = performance.now();
      const cached = cachedRead(database, fixture.budgetId, targetMonth);
      cachedReadSamples.push(elapsed(started));
      if (!projectionsEqual(cached, expectedTarget)) {
        matchesFullProjection = false;
      }
    }

    if (!matchesFullProjection) {
      database.close();
      throw new Error(
        `Replay beginning at ${firstMonth} did not reproduce the full-history target projection.`,
      );
    }

    replayWindows.push({
      replayMonths,
      firstMonth,
      targetMonth,
      transactionFacts: lastFacts?.transactions.length ?? 0,
      splitFacts: lastFacts?.transactions.reduce(
        (total, transaction) => total + (transaction.splits?.length ?? 0),
        0,
      ) ?? 0,
      timingsMs: {
        extractFacts: timingSummary(extractSamples),
        extractionBreakdown: {
          accounts: timingSummary(extractionBreakdownSamples.accounts),
          categories: timingSummary(extractionBreakdownSamples.categories),
          assignments: timingSummary(extractionBreakdownSamples.assignments),
          transactionQuery: timingSummary(extractionBreakdownSamples.transactionQuery),
          transactionHydration: timingSummary(extractionBreakdownSamples.transactionHydration),
        },
        project: timingSummary(projectSamples),
        cacheWrite: timingSummary(cacheWriteSamples),
        cachedRead: timingSummary(cachedReadSamples),
        totalColdPath: timingSummary(totalSamples),
      },
      correctness: { matchesFullProjection },
    });
  }

  const memory = process.memoryUsage();
  const report: ProjectionBenchmarkReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    configuration: options,
    dataset: {
      months: fixture.months.length,
      categories: fixture.categories.length,
      accounts: fixture.accounts.length,
      transactions: fixture.transactions.length,
      splits: fixture.transactions.reduce(
        (total, transaction) => total + (transaction.splits?.length ?? 0),
        0,
      ),
    },
    fixtureBuildMs,
    fullHistoryProjectionMs,
    replayWindows,
    memory: {
      heapUsedBeforeBytes: heapBefore,
      heapUsedAfterBytes: memory.heapUsed,
      heapDeltaBytes: memory.heapUsed - heapBefore,
      rssAfterBytes: memory.rss,
    },
  };

  database.close();

  if (options.outputPath) {
    const outputPath = resolve(options.outputPath);
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  return report;
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value === undefined ? fallback : Number(value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const monthCount = readNumber("P0_6_BENCHMARK_MONTHS", 60);
  const report = await runProjectionBenchmark({
    monthCount,
    categoryCount: readNumber("P0_6_BENCHMARK_CATEGORIES", 80),
    accountCount: readNumber("P0_6_BENCHMARK_ACCOUNTS", 8),
    transactionCount: readNumber("P0_6_BENCHMARK_TRANSACTIONS", 50_000),
    iterations: readNumber("P0_6_BENCHMARK_ITERATIONS", 5),
    replayWindows: [1, 6, 12, 24, monthCount],
    outputPath: process.env.P0_6_BENCHMARK_OUTPUT ??
      "test-results/p0-6-projection-benchmark.json",
  });
  console.log(JSON.stringify(report, null, 2));
}
