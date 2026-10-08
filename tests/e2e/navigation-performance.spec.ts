import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

const E2E_EMAIL = "e2e-admin@example.test";
const E2E_PASSWORD = "E2E-only-password-2026!";
const BUDGET_NAME = "E2E Navigation Performance Budget";
const ACCOUNT_A = "Navigation Performance A";
const ACCOUNT_B = "Navigation Performance B";

async function ensureAuthenticated(page: Page) {
  const status = await page.request.get("/api/auth/status");
  expect(status.ok()).toBe(true);
  const body = await status.json() as {
    needsSetup: boolean;
    authenticated: boolean;
  };
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

async function createAccount(page: Page, name: string) {
  await page.getByRole("button", { name: "Add account" }).click();
  const dialog = page.getByRole("dialog", { name: "Add account" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Account name").fill(name);
  await dialog.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function measure(
  action: () => Promise<unknown>,
  ready: Locator,
): Promise<number> {
  const startedAt = performance.now();
  await action();
  await expect(ready).toBeVisible({ timeout: 30_000 });
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

test("measures startup and warm workspace navigation", async ({ page }) => {
  await ensureAuthenticated(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Budget Manager" })).toBeVisible();

  await page.getByRole("button", { name: "+ New Budget", exact: true }).click();
  await page.getByLabel("Budget name").fill(BUDGET_NAME);
  await page.getByRole("button", { name: "Create budget", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: BUDGET_NAME })).toBeVisible();

  await createAccount(page, ACCOUNT_A);
  await createAccount(page, ACCOUNT_B);

  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(page.getByRole("heading", { name: /\w+ \d{4}/ }).first()).toBeVisible();

  const startupBudgetReloadMs = await measure(
    () => page.goto("/budget", { waitUntil: "domcontentloaded" }),
    page.getByRole("heading", { name: /\w+ \d{4}/ }).first(),
  );

  const budgetToRegisterMs = await measure(
    () => page.getByRole("link", { name: new RegExp("^" + ACCOUNT_A) }).click(),
    page.getByRole("heading", { name: ACCOUNT_A, exact: true }),
  );
  await expect(page).toHaveURL(/\/accounts\//);

  const registerToRegisterMs = await measure(
    () => page.getByRole("link", { name: new RegExp("^" + ACCOUNT_B) }).click(),
    page.getByRole("heading", { name: ACCOUNT_B, exact: true }),
  );
  await expect(page).toHaveURL(/\/accounts\//);

  const registerToBudgetMs = await measure(
    () => page.getByRole("link", { name: "Budget", exact: true }).click(),
    page.getByRole("heading", { name: /\w+ \d{4}/ }).first(),
  );
  await expect(page).toHaveURL(/\/budget$/);

  const budgetBackToRegisterMs = await measure(
    () => page.getByRole("link", { name: new RegExp("^" + ACCOUNT_A) }).click(),
    page.getByRole("heading", { name: ACCOUNT_A, exact: true }),
  );
  await expect(page).toHaveURL(/\/accounts\//);

  const report = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    scenario: {
      accountCount: 2,
      navigationKind: "real-ui-local-first",
    },
    startupBudgetReloadMs,
    budgetToRegisterMs,
    registerToRegisterMs,
    registerToBudgetMs,
    budgetBackToRegisterMs,
  };

  for (const value of [
    startupBudgetReloadMs,
    budgetToRegisterMs,
    registerToRegisterMs,
    registerToBudgetMs,
    budgetBackToRegisterMs,
  ]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  }

  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/navigation-performance.json",
    JSON.stringify(report, null, 2),
    "utf8",
  );
});
