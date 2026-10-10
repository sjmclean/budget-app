import { expect, test } from "@playwright/test";

test("reconciliation completes atomically and a failed statement preserves statuses and checkpoints", async ({ page, browser }) => {
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
  const accountId = new URL(page.url()).pathname.split("/").at(-1)!;
  const evidence = await page.evaluate(async (accountId) => {
    const { getBudgetPersistenceProvider } = await import("/src/features/persistence/budgetPersistenceProviderFactory.ts");
    const { useUIStore } = await import("/src/stores/uiStore.ts");
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("An active local budget engine is required.");

    const initial = await engine.getAccountRegisterBootstrap({ budgetId, accountId, limit: 150 });
    const merchant = initial.page.rows.find((row) => row.payeeName === "Statement Merchant");
    if (!merchant) throw new Error("The statement transaction was not saved.");
    await engine.setTransactionsCleared({ budgetId, transactionIds: [merchant.id], cleared: true });

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
    const afterFailure = await engine.getAccountRegisterBootstrap({ budgetId, accountId, limit: 150 });
    const stillCleared = afterFailure.page.rows.some((row) => row.clearedStatus === "cleared" && row.payeeName === "Statement Merchant");

    const beforeSuccess = await engine.getAccountRegisterBootstrap({
      budgetId, accountId, limit: 150,
    });
    const success = await engine.completeReconciliation({ ...input, statementBalanceMinor: -1234 });
    const afterSuccess = await engine.listReconciliationCheckpoints({ budgetId, accountId });
    let editingBlocked = false;
    let deletionBlocked = false;
    try {
      await engine.setTransactionsCleared({ budgetId, transactionIds: success.transactionIds, cleared: false });
    } catch (error) {
      editingBlocked = /reconciled|locked/i.test(String(error));
    }
    try {
      await engine.deleteTransaction(success.transactionIds[0]!, { budgetId, accountId });
    } catch (error) {
      deletionBlocked = /reconciled|locked/i.test(String(error));
    }
    const afterProtectedMutations = await engine.listReconciliationCheckpoints({ budgetId, accountId });

    return {
      mismatchRejected, stillCleared, editingBlocked, deletionBlocked,
      protectedCheckpointCount: afterProtectedMutations.length,
      beforeCount: before.length,
      afterMismatchCount: afterMismatch.length,
      clearedBeforeCompletion: beforeSuccess.page.rows.some((row) => row.clearedStatus === "cleared"),
      success,
      afterSuccess,
    };
  }, accountId);

  expect(evidence.mismatchRejected).toBe(true);
  expect(evidence.stillCleared).toBe(true);
  expect(evidence.editingBlocked).toBe(true);
  expect(evidence.deletionBlocked).toBe(true);
  expect(evidence.protectedCheckpointCount).toBe(1);
  expect(evidence.beforeCount).toBe(0);
  expect(evidence.afterMismatchCount).toBe(0);
  expect(evidence.clearedBeforeCompletion).toBe(true);
  expect(evidence.success.transactionIds).toHaveLength(1);
  expect(evidence.afterSuccess).toHaveLength(1);
  expect(evidence.afterSuccess[0]?.transactionIds).toEqual(evidence.success.transactionIds);
  expect(evidence.afterSuccess[0]?.statementBalanceMinor).toBe(-1234);
  await expect(page.getByLabel("Transaction reconciled")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Transaction reconciled")).toBeVisible();
  await page.getByRole("button", { name: "Register options" }).first().click();
  await page.getByRole("menuitem", { name: "Reconcile", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Reconcile account" })).toBeVisible();
  await page.getByLabel("Statement date").fill("2026-12-31");
  await page.getByLabel("Statement closing balance").fill("-12.34");
  await expect(page.getByText("Cleared balance at statement date:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish reconciliation" })).toBeEnabled();
  await page.getByLabel("Statement closing balance").fill("-10.00");
  await expect(page.getByRole("button", { name: "Finish reconciliation" })).toBeDisabled();
  await page.getByRole("button", { name: "Create balance adjustment…" }).click();
  await expect(page.getByText(/Confirm a deposit of/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm adjustment" }).click();
  await expect(page.getByRole("button", { name: "Finish reconciliation" })).toBeEnabled();
  const adjusted = await page.evaluate(async (accountId) => {
    const { getBudgetPersistenceProvider } = await import("/src/features/persistence/budgetPersistenceProviderFactory.ts");
    const { useUIStore } = await import("/src/stores/uiStore.ts");
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().accountRegisterQueries;
    if (!budgetId || !engine) throw new Error("Budget query client unavailable.");
    const result = await engine.getAccountRegisterBootstrap({ budgetId, accountId, limit: 150 });
    return result.page.rows.filter((row) => row.payeeName === "Balance Adjustment")
      .map(({ amount, clearedStatus, categoryId, incomeBudgetMonth, inflowClassification }) => ({ amount, clearedStatus, categoryId, incomeBudgetMonth, inflowClassification }));
  }, accountId);
  expect(adjusted).toEqual([{ amount: 234, clearedStatus: "cleared", categoryId: null, incomeBudgetMonth: "2026-12", inflowClassification: "reconciliation-adjustment" }]);
  await page.getByRole("button", { name: "Finish reconciliation" }).click();
  await expect(page.getByRole("button", { name: "Register options" }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Reconcile account" })).toHaveCount(0);


  const persisted = await page.evaluate(async (accountId) => {
    const { getBudgetPersistenceProvider } = await import("/src/features/persistence/budgetPersistenceProviderFactory.ts");
    const { useUIStore } = await import("/src/stores/uiStore.ts");
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("Budget must survive a page reload.");
    return engine.listReconciliationCheckpoints({ budgetId, accountId });
  }, accountId);
  expect(persisted).toHaveLength(2);
  const originalCheckpoint = persisted.find((checkpoint) => checkpoint.id === evidence.success.checkpointId);
  expect(originalCheckpoint?.transactionIds).toEqual(evidence.success.transactionIds);
  expect(originalCheckpoint?.statementBalanceMinor).toBe(-1234);
  const adjustmentCheckpoint = persisted.find((checkpoint) => checkpoint.id !== evidence.success.checkpointId);
  expect(adjustmentCheckpoint?.statementBalanceMinor).toBe(-1000);
  expect(adjustmentCheckpoint?.transactionIds).toHaveLength(1);
  expect(adjustmentCheckpoint?.transactionIds[0]).not.toBe(evidence.success.transactionIds[0]);

  // An isolated browser context has its own OPFS database and local-first device identity.
  // It must receive the reconciled transaction and checkpoint through the relay rather than
  // observing the first browser's local SQLite state.
  const otherDevice = await browser.newContext();
  try {
    const otherPage = await otherDevice.newPage();
    const auth = await otherPage.request.get("/api/auth/status");
    const status = await auth.json() as { needsSetup: boolean; authenticated: boolean };
    if (!status.authenticated) {
      const result = await otherPage.request.post(status.needsSetup ? "/api/auth/setup" : "/api/auth/login", {
        data: { email: "e2e-admin@example.test", password: "E2E-only-password-2026!" },
      });
      expect(result.ok()).toBe(true);
    }
    await otherPage.goto("/");
    await expect(otherPage.getByRole("heading", { name: "Budget Manager" })).toBeVisible();
    await otherPage.getByRole("button", { name: "Open Reconciliation Atomic E2E" }).click();
    await expect(otherPage).toHaveURL(/\/dashboard$/);
    await otherPage.getByRole("link", { name: /^Reconciliation Checking/ }).click();
    await expect(otherPage).toHaveURL(/\/accounts\//);

    await expect.poll(async () => otherPage.evaluate(async (accountId) => {
      const { getBudgetPersistenceProvider } = await import("/src/features/persistence/budgetPersistenceProviderFactory.ts");
      const { useUIStore } = await import("/src/stores/uiStore.ts");
      const budgetId = useUIStore.getState().selectedBudgetId;
      const provider = getBudgetPersistenceProvider();
      if (!budgetId || !provider.accountRegisterQueries) return null;
      const checkpoints = await provider.accountRegisterQueries.listReconciliationCheckpoints({ budgetId, accountId });
      const register = await provider.accountRegisterQueries.getAccountRegisterBootstrap({ budgetId, accountId, limit: 150 });
      return {
        checkpoints: checkpoints.map(({ id, statementBalanceMinor, transactionIds }) => ({ id, statementBalanceMinor, transactionIds })),
        reconciled: register.page.rows.filter((row) => row.clearedStatus === "reconciled")
          .map(({ id }) => id).sort(),
      };
    }, accountId), { timeout: 30000, intervals: [500, 1000, 2000] }).toEqual({
      checkpoints: expect.arrayContaining([
        expect.objectContaining({ id: evidence.success.checkpointId, statementBalanceMinor: -1234,
          transactionIds: evidence.success.transactionIds }),
        expect.objectContaining({ id: adjustmentCheckpoint!.id, statementBalanceMinor: -1000,
          transactionIds: adjustmentCheckpoint!.transactionIds }),
      ]),
      reconciled: [...evidence.success.transactionIds, ...adjustmentCheckpoint!.transactionIds].sort(),
    });
  } finally {
    await otherDevice.close();
  }
});
