import { expect, test } from "@playwright/test";

// Run explicitly with BUDGET_APP_RECONCILIATION_BENCHMARK=1.
// This test creates a disposable browser-local budget and never opens user budgets.
test("benchmark large account reconciliation using the real worker", async ({ page }) => {
  test.skip(process.env.BUDGET_APP_RECONCILIATION_BENCHMARK !== "1", "Opt-in performance benchmark.");
  test.setTimeout(1_800_000);
  await page.goto("/");
  const auth = page.getByRole("heading", { name: /Create the administrator account|Sign in/ });
  await expect(auth).toBeVisible();
  await page.getByLabel("Email").fill("benchmark-admin@example.test");
  await page.getByLabel("Password").fill("Benchmark-only-password-2026!");
  await page.getByRole("button", {
    name: (await auth.textContent()) === "Create the administrator account" ? "Create account" : "Sign in",
  }).click();
  await expect(page.getByRole("heading", { name: "Budget Manager" })).toBeVisible();
  await page.getByRole("button", { name: "+ New Budget", exact: true }).click();
  await page.getByLabel("Budget name").fill("Disposable Reconciliation Benchmark");
  await page.getByRole("button", { name: "Create budget", exact: true }).click();
  await page.getByRole("button", { name: "Add account" }).click();
  const dialog = page.getByRole("dialog", { name: "Add account" });
  await dialog.getByLabel("Account name").fill("Benchmark Checking");
  await dialog.getByRole("button", { name: "Add account" }).click();
  await page.getByRole("link", { name: /^Benchmark Checking/ }).click();
  const accountId = new URL(page.url()).pathname.split("/").at(-1)!;

  const result = await page.evaluate(async ({ accountId, count }) => {
    const { getBudgetPersistenceProvider } = await import("/src/features/persistence/budgetPersistenceProviderFactory.ts");
    const { useUIStore } = await import("/src/stores/uiStore.ts");
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("Local budget runtime unavailable.");

    // Seed in bounded batches; setup timings are kept separate from reconciliation.
    const seedStart = performance.now();
    const ids: string[] = [];
    const batchSize = 250;
    for (let offset = 0; offset < count; offset += batchSize) {
      const additions = Array.from({ length: Math.min(batchSize, count - offset) }, (_, i) => {
        const index = offset + i;
        const id = crypto.randomUUID();
        ids.push(id);
        return {
          id, budgetId, accountId, date: "2026-01-01", amount: -1,
          payeeName: "Benchmark Merchant", categoryId: null,
          memo: `Benchmark transaction ${index}`,
        };
      });
      await engine.commitTransactionBatch({
        budgetId, accountId, additions, updates: [], provenanceAssignments: [],
      });
    }
    for (let offset = 0; offset < ids.length; offset += batchSize) {
      await engine.setTransactionsCleared({
        budgetId, transactionIds: ids.slice(offset, offset + batchSize), cleared: true,
      });
    }
    const seedMs = Math.round(performance.now() - seedStart);
    const input = { budgetId, accountId, statementDate: "2026-12-31", statementBalanceMinor: -count };
    const start = performance.now();
    const checkpoint = await engine.completeReconciliation(input);
    const reconcileMs = Math.round(performance.now() - start);
    const checkpoints = await engine.listReconciliationCheckpoints({ budgetId, accountId });
    const preview = await engine.prepareReconciliation({
      budgetId, accountId, statementDate: input.statementDate,
    });
    return {
      count, seedMs, reconcileMs,
      reconciledCount: checkpoint.transactionIds.length,
      checkpointCount: checkpoints.length,
      checkpointIds: checkpoints[0]?.transactionIds.length,
      remaining: preview.transactions.length,
      clearedBalanceMinor: preview.clearedBalanceMinor,
    };
  }, { accountId, count: Number(process.env.BUDGET_APP_RECONCILIATION_BENCHMARK_COUNT || "15000") });

  console.log("RECONCILIATION_BENCHMARK " + JSON.stringify(result));
  expect(result.reconciledCount).toBe(result.count);
  expect(result.checkpointCount).toBe(1);
  expect(result.checkpointIds).toBe(result.count);
  expect(result.remaining).toBe(0);
  expect(result.clearedBalanceMinor).toBe(-result.count);
});
