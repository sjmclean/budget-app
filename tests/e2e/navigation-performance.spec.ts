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

  const startupStages = await page.evaluate(() => {
    const markEntries = performance.getEntriesByType("mark");
    const read = (name: string) => {
      const matches = markEntries.filter(
        (entry) => entry.name === `budget-app:${name}`,
      );
      return matches.at(-1)?.startTime ?? null;
    };
    const duration = (start: string, end: string) => {
      const starts = markEntries
        .filter((entry) => entry.name === `budget-app:${start}`)
        .map((entry) => entry.startTime);
      const ends = markEntries
        .filter((entry) => entry.name === `budget-app:${end}`)
        .map((entry) => entry.startTime);
      for (let index = starts.length - 1; index >= 0; index -= 1) {
        const startTime = starts[index];
        const endTime = ends.find((candidate) => candidate >= startTime);
        if (endTime !== undefined) {
          return Math.round((endTime - startTime) * 100) / 100;
        }
      }
      return null;
    };
    const startupStart = read("startup:start");
    const budgetMonthQueryEntries = performance
      .getEntriesByType("mark")
      .filter((entry) => entry.name.startsWith("budget-app:budget-month-query:"));
    const budgetMonthQueryTimings = Object.fromEntries(
      [...new Set(
        budgetMonthQueryEntries.map((entry) =>
          entry.name
            .replace("budget-app:budget-month-query:", "")
            .replace(/:(start|end)$/, ""),
        ),
      )].map((month) => [
        month,
        duration(
          `budget-month-query:${month}:start`,
          `budget-month-query:${month}:end`,
        ),
      ]),
    );
    return {
      browserStartupToBudgetReadyMs: startupStart === null
        ? null
        : Math.round((performance.now() - startupStart) * 100) / 100,
      authMs: duration("auth:start", "auth:end"),
      persistenceInitializeMs: duration(
        "persistence-initialize:start",
        "persistence-initialize:end",
      ),
      merchantPreloadMs: duration("merchant-preload:start", "merchant-preload:end"),
      appImportMs: duration("app-import:start", "app-import:end"),
      budgetActivationMs: duration("budget-activation:start", "budget-activation:end"),
      budgetPrimaryPrefetchMs: duration(
        "budget-primary-prefetch:start",
        "budget-primary-prefetch:end",
      ),
      accountIdentityPrefetchMs: duration(
        "account-identity-prefetch:start",
        "account-identity-prefetch:end",
      ),
      bootstrapToReactRenderMs: duration("startup:start", "react-render:start"),
      reactRenderToBudgetReadyMs: read("react-render:start") === null
        ? null
        : Math.round(
            (performance.now() - (read("react-render:start") ?? 0)) * 100,
          ) / 100,
      budgetMonthQueryTimings,
      budgetViewServiceTimings: Object.fromEntries(
        [...new Set(
          performance
            .getEntriesByType("mark")
            .filter((entry) => entry.name.startsWith("budget-app:budget-view-service:"))
            .map((entry) =>
              entry.name
                .replace("budget-app:budget-view-service:", "")
                .replace(/:(status|financial|goals|overlay):(start|end)$/, ""),
            ),
        )].map((month) => [
          month,
          {
            statusMs: duration(
              `budget-view-service:${month}:status:start`,
              `budget-view-service:${month}:status:end`,
            ),
            financialMs: duration(
              `budget-view-service:${month}:financial:start`,
              `budget-view-service:${month}:financial:end`,
            ),
            goalsMs: duration(
              `budget-view-service:${month}:goals:start`,
              `budget-view-service:${month}:goals:end`,
            ),
            overlayMs: duration(
              `budget-view-service:${month}:overlay:start`,
              `budget-view-service:${month}:overlay:end`,
            ),
          },
        ]),
      ),
      sidebarAccountIdentitiesMs: (() => {
        const start = performance.getEntriesByType("mark")
          .find((entry) => entry.name.startsWith("budget-app:sidebar-account-identities:") && entry.name.endsWith(":start"));
        if (!start) return null;
        const prefix = start.name.slice("budget-app:".length, -":start".length);
        return duration(`${prefix}:start`, `${prefix}:end`);
      })(),
      sidebarAccountNavigationMs: (() => {
        const start = performance.getEntriesByType("mark")
          .find((entry) => entry.name.startsWith("budget-app:sidebar-account-navigation:") && entry.name.endsWith(":start"));
        if (!start) return null;
        const prefix = start.name.slice("budget-app:".length, -":start".length);
        return duration(`${prefix}:start`, `${prefix}:end`);
      })(),
      runtimeBudgetMonthReadMs: (() => {
        const start = performance.getEntriesByType("mark")
          .find((entry) => entry.name.startsWith("budget-app:runtime-budget-month-read:") && entry.name.endsWith(":start"));
        if (!start) return null;
        const prefix = start.name.slice("budget-app:".length, -":start".length);
        return duration(`${prefix}:start`, `${prefix}:end`);
      })(),
      runtimeCategoryGoalsMs: (() => {
        const start = performance.getEntriesByType("mark")
          .find((entry) => entry.name.startsWith("budget-app:runtime-category-goals:") && entry.name.endsWith(":start"));
        if (!start) return null;
        const prefix = start.name.slice("budget-app:".length, -":start".length);
        return duration(`${prefix}:start`, `${prefix}:end`);
      })(),
      budgetMonthOwnershipWaitMs: duration(
        "ownership-admission:getBudgetMonthView:requested",
        "ownership-admission:getBudgetMonthView:admitted",
      ),
      budgetMonthOwnershipExecutionMs: duration(
        "ownership-admission:getBudgetMonthView:admitted",
        "ownership-admission:getBudgetMonthView:completed",
      ),
      categoryGoalsOwnershipWaitMs: duration(
        "ownership-admission:listCategoryGoals:requested",
        "ownership-admission:listCategoryGoals:admitted",
      ),
      categoryGoalsOwnershipExecutionMs: duration(
        "ownership-admission:listCategoryGoals:admitted",
        "ownership-admission:listCategoryGoals:completed",
      ),
      synchroniseOwnershipWaitMs: duration(
        "ownership-admission:synchroniseLocalBudget:requested",
        "ownership-admission:synchroniseLocalBudget:admitted",
      ),
      synchroniseOwnershipExecutionMs: duration(
        "ownership-admission:synchroniseLocalBudget:admitted",
        "ownership-admission:synchroniseLocalBudget:completed",
      ),
      readyDatabaseMs: (() => {
        const start = performance.getEntriesByType("mark")
          .find((entry) => entry.name.startsWith("budget-app:ready-database:") && entry.name.endsWith(":start"));
        if (!start) return null;
        const prefix = start.name.slice("budget-app:".length, -":start".length);
        return {
          totalMs: duration(`${prefix}:start`, `${prefix}:end`),
          localOpenMs: duration(`${prefix}:local-open:start`, `${prefix}:local-open:end`),
          syncStateMs: duration(`${prefix}:sync-state:start`, `${prefix}:sync-state:end`),
          relayBootstrapMs: duration(`${prefix}:relay-bootstrap:start`, `${prefix}:relay-bootstrap:end`),
          restoreRecoverMs: duration(`${prefix}:restore-recover:start`, `${prefix}:restore-recover:end`),
        };
      })(),
      budgetEngineDiagnosticMs: (() => {
        const start = performance.getEntriesByType("mark")
          .find((entry) => entry.name.startsWith("budget-app:budget-engine-diagnostic:") && entry.name.endsWith(":start"));
        if (!start) return null;
        const prefix = start.name.slice("budget-app:".length, -":start".length);
        return duration(`${prefix}:start`, `${prefix}:end`);
      })(),
      ownershipAdmissionEvents: performance
        .getEntriesByType("mark")
        .filter((entry) => entry.name.startsWith("budget-app:ownership-admission:"))
        .map((entry) => ({
          name: entry.name,
          atMs: Math.round(entry.startTime * 100) / 100,
        })),
      replicationTriggerEvents: performance
        .getEntriesByType("mark")
        .filter((entry) => entry.name.startsWith("budget-app:replication-trigger:"))
        .map((entry) => ({
          name: entry.name,
          atMs: Math.round(entry.startTime * 100) / 100,
        })),
      persistenceReactivationEvents: performance
        .getEntriesByType("mark")
        .filter((entry) => entry.name.startsWith("budget-app:persistence-reactivation:"))
        .map((entry) => ({
          name: entry.name,
          atMs: Math.round(entry.startTime * 100) / 100,
        })),
    };
  });

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
    startupStages,
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
