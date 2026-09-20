import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("warm OPFS SQLite opens and serves a bounded 10k register locally", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");

  const report = await page.evaluate(async () => {
    const { LocalBudgetDatabaseClient } = await import(
      "/src/features/persistence/localFirst/localBudgetClient.ts"
    );

    const budgetId = `perf-${Date.now()}`;
    const accountCount = 20;
    const accountId = "perf-account-0";
    const syncEpoch = "perf-epoch";
    const deviceId = "perf-device";
    const transactionCount = 10_000;
    const now = "2026-09-20T00:00:00.000Z";

    const seed = new LocalBudgetDatabaseClient();
    await seed.beginStagedImport({ budgetId, syncEpoch, deviceId });
    await seed.importRegisterBatch({
      accounts: Array.from({ length: accountCount }, (_, index) => ({
        id: `perf-account-${index}`,
        budgetId,
        name: `Performance Account ${index}`,
        type: "checking",
        participation: "on-budget",
        openingBalance: 0,
        currencyCode: "AUD",
        createdAt: now,
        closedAt: null,
      })),
    });

    for (let offset = 0; offset < transactionCount; offset += 1_000) {
      const transactions = Array.from(
        { length: Math.min(1_000, transactionCount - offset) },
        (_, localIndex) => {
          const index = offset + localIndex;
          const day = String((index % 28) + 1).padStart(2, "0");
          const month = String((Math.floor(index / 28) % 12) + 1).padStart(2, "0");
          return {
            id: `transaction-${index}`,
            budgetId,
            accountId: `perf-account-${index % accountCount}`,
            date: `2026-${month}-${day}`,
            amount: index % 2 === 0 ? -1234 : 2500,
            memo: `Performance transaction ${index}`,
            checkNumber: null,
            clearedStatus: "uncleared",
            payeeId: null,
            payeeName: "Performance Payee",
            rawPayeeName: null,
            categoryId: null,
            categoryName: null,
            transferAccountId: null,
            transferTransactionId: null,
            generatedFromSchedule: false,
            scheduledTransactionId: null,
            scheduledOccurrenceDate: null,
            splitLines: [],
            tagIds: [],
            importProvenance: [],
            updatedAt: now,
          };
        },
      );
      await seed.importRegisterBatch({ transactions });
    }

    await seed.commitStagedImport({
      accounts: accountCount,
      transactions: transactionCount,
      payees: 0,
      categories: 0,
      categoryGoals: 0,
      budgetMonths: 0,
      scheduledTransactions: 0,
      transactionTags: 0,
    });
    await seed.setSyncState(`sha256:${"0".repeat(64)}`, 0);
    await seed.close();

    const warm = new LocalBudgetDatabaseClient();
    const openStarted = performance.now();
    await warm.open({ budgetId, syncEpoch, deviceId });
    const warmOpenMs = performance.now() - openStarted;

    const identityStarted = performance.now();
    const accountIdentities = await warm.listAccounts(budgetId);
    const accountIdentityMs = performance.now() - identityStarted;

    const navigationStarted = performance.now();
    const accountNavigation = await warm.listAccountNavigation(budgetId);
    const accountNavigationMs = performance.now() - navigationStarted;

    const queryStarted = performance.now();
    const [summary, pageResult] = await Promise.all([
      warm.getAccountSummary({ budgetId, accountId }),
      warm.queryTransactions({
        budgetId,
        accountId,
        limit: 150,
        offset: 0,
        includeTotalCount: false,
        categoryFilter: "all",
        sort: { column: "date", direction: "descending" },
      }),
    ]);
    const registerBootstrapMs = performance.now() - queryStarted;

    const result = {
      transactionCount,
      accountCount,
      warmOpenMs,
      accountIdentityMs,
      accountNavigationMs,
      accountIdentityCount: accountIdentities.length,
      accountNavigationCount: accountNavigation.length,
      navigationTransactionCount: accountNavigation.reduce(
        (total, entry) => total + entry.transactionCount,
        0,
      ),
      registerBootstrapMs,
      returnedRows: pageResult.rows.length,
      summaryTransactionCount: summary.transactionCount,
    };

    await warm.deleteBudgetFile();
    await warm.close().catch(() => undefined);
    return result;
  });

  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/browser-local-sqlite-performance.json",
    JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), ...report }, null, 2),
  );

  expect(report.returnedRows).toBe(150);
  expect(report.accountIdentityCount).toBe(report.accountCount);
  expect(report.accountNavigationCount).toBe(report.accountCount);
  expect(report.navigationTransactionCount).toBe(report.transactionCount);
  expect(report.summaryTransactionCount).toBe(
    report.transactionCount / report.accountCount,
  );
  expect(report.warmOpenMs).toBeLessThan(2_000);
  expect(report.accountIdentityMs).toBeLessThan(500);
  expect(report.accountNavigationMs).toBeLessThan(1_500);
  expect(report.registerBootstrapMs).toBeLessThan(1_000);
});
