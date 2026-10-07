import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const E2E_EMAIL = "e2e-admin@example.test";
const E2E_PASSWORD = "E2E-only-password-2026!";

async function ensureE2eAuthenticated(page: Page) {
  const status = await page.request.get("/api/auth/status");
  expect(status.ok()).toBe(true);
  const body = await status.json() as { needsSetup: boolean; authenticated: boolean };
  if (body.authenticated) return;

  const response = body.needsSetup
    ? await page.request.post("/api/auth/setup", {
        data: { email: E2E_EMAIL, password: E2E_PASSWORD },
      })
    : await page.request.post("/api/auth/login", {
        data: { email: E2E_EMAIL, password: E2E_PASSWORD },
      });
  expect(response.ok()).toBe(true);
}

test("Actual backend import reports stage timings on a representative synthetic budget", async ({ page }) => {
  test.setTimeout(120_000);
  await ensureE2eAuthenticated(page);
  await page.goto("/");

  const report = await page.evaluate(async () => {
    const { createActualBudgetLauncherImportWithBackend } = await import(
      "/src/features/budget/actualBudgetLauncherImport.ts"
    );
    const { getActiveKeyValueStorage } = await import(
      "/src/features/persistence/activeKeyValueStorage.ts"
    );
    const { createLocalFirstRelayTransport } = await import(
      "/src/features/persistence/localFirst/relayTransport.ts"
    );

    const transactionCount = 2_000;
    const categoryCount = 24;
    const payeeCount = 120;
    const months = Array.from({ length: 24 }, (_, index) => {
      const date = new Date(Date.UTC(2025, index, 1));
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    });

    const categories = Array.from({ length: categoryCount }, (_, index) => ({
      id: `category-${index}`,
      name: `Category ${index}`,
      groupId: `group-${Math.floor(index / 6)}`,
      groupName: `Group ${Math.floor(index / 6)}`,
      hidden: false,
      isIncome: false,
    }));

    const payees = Array.from({ length: payeeCount }, (_, index) => ({
      id: `payee-${index}`,
      name: `Synthetic Payee ${index}`,
    }));

    const transactions = Array.from({ length: transactionCount }, (_, index) => {
      const month = months[index % months.length]!;
      const day = String((index % 28) + 1).padStart(2, "0");
      const income = index % 20 === 0;
      return {
        id: `transaction-${index}`,
        accountId: `account-${index % 4}`,
        accountName: `Account ${index % 4}`,
        date: `${month}-${day}`,
        amount: income ? 250_000 : -(500 + (index % 8_000)),
        payeeId: `payee-${index % payeeCount}`,
        payeeName: `Synthetic Payee ${index % payeeCount}`,
        categoryId: income ? "income-category" : `category-${index % categoryCount}`,
        categoryName: income ? "Income" : `Category ${index % categoryCount}`,
        memo: null,
        cleared: true,
        transferId: null,
        isTransfer: false,
      };
    });

    const budgetMonths = months.flatMap((month) =>
      categories.map((category, categoryIndex) => ({
        id: `${month}-${category.id}`,
        month,
        categoryId: category.id,
        assigned: 10_000 + (categoryIndex % 5) * 1_000,
        carryover: 0,
      })),
    );

    const samples: Array<{ stage: string; elapsedMs: number }> = [];
    const storage = getActiveKeyValueStorage();
    const result = await createActualBudgetLauncherImportWithBackend(storage, {
      now: new Date("2026-12-31T00:00:00.000Z"),
      sourceFileName: "synthetic-performance.zip",
      onPerformanceSample: (sample) => samples.push(sample),
      preview: {
        format: "actual-budget",
        providerId: "actual-budget",
        providerLabel: "Actual Budget",
        sourceBudgetName: "Synthetic Performance Budget",
        entityCounts: [],
        issues: [],
        metadata: { currency: "AUD" },
        accounts: Array.from({ length: 4 }, (_, index) => ({
          id: `account-${index}`,
          name: `Account ${index}`,
          type: "checking",
          closed: false,
          offBudget: false,
        })),
        categoryGroups: [
          { id: "income-group", name: "Income", hidden: false, isIncome: true },
          ...Array.from({ length: 4 }, (_, index) => ({
            id: `group-${index}`,
            name: `Group ${index}`,
            hidden: false,
            isIncome: false,
          })),
        ],
        categories: [
          {
            id: "income-category",
            name: "Income",
            groupId: "income-group",
            groupName: "Income",
            hidden: false,
            isIncome: true,
          },
          ...categories,
        ],
        payees,
        transactions,
        budgetMonths,
        transferCount: 0,
        canCommit: true,
      },
    });

    await createLocalFirstRelayTransport().deleteBudget(result.budget.id).catch(() => undefined);

    return {
      schemaVersion: 1,
      dataset: {
        transactions: transactionCount,
        categories: categoryCount,
        payees: payeeCount,
        months: months.length,
      },
      samples,
    };
  });

  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/actual-import-performance.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2),
  );

  const stages = new Map(report.samples.map((sample) => [sample.stage, sample.elapsedMs]));
  for (const stage of [
    "map",
    "provision",
    "begin-staged-import",
    "begin-sqlite-runtime",
    "begin-capacity-reserve",
    "begin-remove-stage-file",
    "begin-open-database",
    "begin-initialise-schema",
    "begin-defer-indexes",
    "begin-metadata",
    "begin-manifest",
    "entities",
    "transactions",
    "budget-months",
    "commit",
    "publish-baseline",
    "restore-point",
    "restore-module-import",
    "restore-quick-check",
    "restore-manifest",
    "restore-export-prepare",
    "restore-store-capture",
    "restore-store-catalogue",
    "restore-store-source-read",
    "restore-store-chunk-hash",
    "restore-store-existing-chunk-verify",
    "restore-store-temporary-write",
    "restore-store-temporary-verify",
    "restore-store-final-write",
    "restore-store-final-verify",
    "restore-store-manifest-write",
    "restore-store-cleanup",
    "restore-store-total-store",
    "finalize-storage",
    "total",
  ]) {
    expect(stages.has(stage), `missing timing for ${stage}`).toBe(true);
  }
  expect(stages.get("total")).toBeGreaterThan(0);
});
