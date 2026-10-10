import { expect, test } from "@playwright/test";

test("reconciliation completes atomically and a failed statement preserves statuses and checkpoints", async ({ page }) => {
  if (process.env.BUDGET_APP_E2E_ISOLATED_PORTS === "1") test.setTimeout(180_000);
  await page.goto("/");
  const authenticationHeading = page.getByRole("heading", { name: /Create the administrator account|Sign in/ });
  await expect(authenticationHeading).toBeVisible();
  await page.getByLabel("Email").fill("e2e-admin@example.test");
  await page.getByLabel("Password").fill("E2E-only-password-2026!");
  await page.getByRole("button", {
    name: (await authenticationHeading.textContent()) === "Create the administrator account" ? "Create account" : "Sign in",
  }).click();
  await expect(page.getByRole("heading", { name: "Budget Manager" })).toBeVisible();

  await page.getByRole("button", { name: "+ New Budget", exact: true }).click();
  await page.getByLabel("Budget name").fill("Reconciliation Atomic E2E");
  await page.getByRole("button", { name: "Create budget", exact: true }).click();
  await page.getByRole("button", { name: "Add account" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Add account" });
  await accountDialog.getByLabel("Account name").fill("Reconciliation Checking");
  await accountDialog.getByRole("button", { name: "Add account" }).click();
  await page.getByRole("link", { name: /^Reconciliation Checking/ }).click();
  await expect(page).toHaveURL(/\/accounts\//);

  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByPlaceholder("Payee").fill("Statement Merchant");
  await page.getByPlaceholder("Outflow").fill("12.34");
  await page.getByPlaceholder("Outflow").press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Statement Merchant", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark transaction cleared", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark transaction uncleared", exact: true })).toBeVisible();

  const accountId = new URL(page.url()).pathname.split("/").at(-1)!;
  const evidence = await page.evaluate(async (accountId) => {
    const { getBudgetPersistenceProvider } = await import("/src/features/persistence/budgetPersistenceProviderFactory.ts");
    const { useUIStore } = await import("/src/stores/uiStore.ts");
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("An active local budget engine is required.");

    const statementDate = "2026-12-31";
    const input = { budgetId, accountId, statementDate };
    const before = await engine.listReconciliationCheckpoints({ budgetId, accountId });
    let mismatchRejected = false;
    try {
      await engine.completeReconciliation({ ...input, statementBalanceMinor: 0 });
    } catch (error) {
      mismatchRejected = /balance|statement|match/i.test(String(error));
    }
    const afterMismatch = await engine.listReconciliationCheckpoints({ budgetId, accountId });
    const beforeSuccess = await engine.getAccountRegisterBootstrap({
      budgetId, accountId, limit: 150,
    });
    const success = await engine.completeReconciliation({ ...input, statementBalanceMinor: -1234 });
    const afterSuccess = await engine.listReconciliationCheckpoints({ budgetId, accountId });
    return {
      mismatchRejected,
      beforeCount: before.length,
      afterMismatchCount: afterMismatch.length,
      clearedBeforeCompletion: beforeSuccess.page.rows.some((row) => row.clearedStatus === "cleared"),
      success,
      afterSuccess,
    };
  }, accountId);

  expect(evidence.mismatchRejected).toBe(true);
  expect(evidence.beforeCount).toBe(0);
  expect(evidence.afterMismatchCount).toBe(0);
  expect(evidence.clearedBeforeCompletion).toBe(true);
  expect(evidence.success.transactionIds).toHaveLength(1);
  expect(evidence.afterSuccess).toHaveLength(1);
  expect(evidence.afterSuccess[0]?.transactionIds).toEqual(evidence.success.transactionIds);
  expect(evidence.afterSuccess[0]?.statementBalanceMinor).toBe(-1234);
  await expect(page.getByLabel("Transaction reconciled")).toBeVisible();
});
