import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { expect, test } from "@playwright/test";

test("measures real Register navigation, paging and interaction with 5000 transactions", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const authenticationHeading = page.getByRole("heading", {
    name: /Create the administrator account|Sign in/,
  });
  await expect(authenticationHeading).toBeVisible();
  await page.getByLabel("Email").fill("e2e-admin@example.test");
  await page.getByLabel("Password").fill("E2E-only-password-2026!");
  await page.getByRole("button", {
    name: (await authenticationHeading.textContent()) === "Create the administrator account"
      ? "Create account" : "Sign in",
  }).click();
  await expect(page.getByRole("heading", { name: "Budget Manager" })).toBeVisible();
  await page.getByRole("button", { name: "+ New Budget", exact: true }).click();
  await page.getByLabel("Budget name").fill("Large Register UI Performance");
  await page.getByRole("button", { name: "Create budget", exact: true }).click();
  await page.getByRole("button", { name: "Add account" }).click();
  const dialog = page.getByRole("dialog", { name: "Add account" });
  await dialog.getByLabel("Account name").fill("Large Checking");
  await dialog.getByRole("button", { name: "Add account" }).click();
  const accountLink = page.getByRole("link", { name: /^Large Checking/ });
  const href = await accountLink.getAttribute("href");
  expect(href).toMatch(/\/accounts\//);
  const accountId = href!.split("/").at(-1)!;

  const seedStartedAt = performance.now();
  await page.evaluate(async (id) => {
    const { getBudgetPersistenceProvider } = await import("/src/features/persistence/budgetPersistenceProviderFactory.ts");
    const { useUIStore } = await import("/src/stores/uiStore.ts");
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("Local engine unavailable");
    for (let offset = 0; offset < 5_000; offset += 250) {
      const additions = Array.from({ length: Math.min(250, 5_000 - offset) }, (_, index) => {
        const ordinal = offset + index;
        return {
          id: crypto.randomUUID(), budgetId, accountId: id,
          date: `2026-09-${String(ordinal % 28 + 1).padStart(2, "0")}`,
          amount: -100 - ordinal,
          payeeName: `Large Register Merchant ${ordinal}`,
        };
      });
      await engine.commitImportBatch({
        budgetId, accountId: id, additions, updates: [],
        provenanceAssignments: [], payeeCreations: [],
      });
    }
  }, accountId);
  const seedMs = Math.round((performance.now() - seedStartedAt) * 100) / 100;

  const startedAt = performance.now();
  await accountLink.click();
  await expect(page.getByText("Showing 1–", { exact: false })).toBeVisible({ timeout: 30_000 });
  const firstPageVisibleMs = Math.round((performance.now() - startedAt) * 100) / 100;
  const firstPage = await page.locator(".register-transaction-with-month").count();

  const paginationSamples: {
    nextPageMs: number;
    previousPageMs: number;
    fetchMs: number | null;
    stateToVisibleMs: number | null;
  }[] = [];
  for (let index = 0; index < 5; index += 1) {
    await page.evaluate(() => performance.clearMarks());
    const pageStartedAt = performance.now();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Page 2 of", { exact: false })).toBeVisible();
    const nextPageMs = Math.round((performance.now() - pageStartedAt) * 100) / 100;
    const stages = await page.evaluate(() => {
      const marks = performance.getEntriesByType("mark");
      const last = (name: string) => marks.filter((mark) =>
        mark.name === `budget-app:register-pagination:${name}`).at(-1)?.startTime;
      const fetchStart = last("fetch:start");
      const fetchEnd = last("fetch:end");
      const stateSet = last("state-set");
      return {
        fetchMs: fetchStart === undefined || fetchEnd === undefined
          ? null : Math.round((fetchEnd - fetchStart) * 100) / 100,
        stateToVisibleMs: stateSet === undefined
          ? null : Math.round((performance.now() - stateSet) * 100) / 100,
      };
    });
    const previousStartedAt = performance.now();
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.getByText("Page 1 of", { exact: false })).toBeVisible();
    const previousPageMs = Math.round((performance.now() - previousStartedAt) * 100) / 100;
    paginationSamples.push({ nextPageMs, previousPageMs, ...stages });
  }
  const nextPageMs = paginationSamples[0].nextPageMs;

  const interactionStartedAt = performance.now();
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  await expect(page.getByPlaceholder("Payee")).toBeVisible();
  const addTransactionOpenMs = Math.round((performance.now() - interactionStartedAt) * 100) / 100;

  const report = {
    generatedAt: new Date().toISOString(),
    transactionCount: 5_000,
    seedMs, firstPageVisibleMs, firstPage, nextPageMs, paginationSamples, addTransactionOpenMs,
  };
  for (const value of [firstPageVisibleMs, nextPageMs, addTransactionOpenMs]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  }
  expect(firstPage).toBeGreaterThan(0);
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/large-register-ui-performance.json",
    JSON.stringify(report, null, 2), "utf8");
});
