import { expect, test, type Page } from "@playwright/test";

const budgetName = "E2E Smoke Budget";
const accountName = "E2E Durable Account";

function failOnBrowserErrors(page: Page) {
  const failures: string[] = [];

  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console.error: ${message.text()}`);
  });

  return () => expect(failures, failures.join("\n")).toEqual([]);
}

async function openSettingsDestination(page: Page, name: string) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

test("real authentication, OPFS budget lifecycle, routing, and SQLite mutation survive reload", async ({ page }) => {
  const assertNoBrowserErrors = failOnBrowserErrors(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create the administrator account" })).toBeVisible();
  await page.getByLabel("Email").fill("e2e-admin@example.test");
  await page.getByLabel("Password").fill("E2E-only-password-2026!");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Budget Manager" })).toBeVisible();
  await expect(page.evaluate(() => globalThis.crossOriginIsolated)).resolves.toBe(true);
  await expect(page.evaluate(() => "getDirectory" in navigator.storage)).resolves.toBe(true);

  await page.getByRole("button", { name: "New Budget", exact: true }).click();
  await page.getByLabel("Budget name").fill(budgetName);
  await page.getByRole("button", { name: "Create budget", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: budgetName })).toBeVisible();

  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(page.getByRole("heading", { name: "My Budget" })).toBeVisible();

  await page.goto("/accounts");
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

  await openSettingsDestination(page, "Settings");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", exact: true }).first()).toBeVisible();

  await openSettingsDestination(page, "Switch budget");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: budgetName })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Budget Manager" })).toBeVisible();
  await expect(page.getByRole("heading", { name: budgetName })).toBeVisible();
  await page.getByRole("button", { name: `Open ${budgetName}` }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("dialog", { name: "Add account" })).toBeVisible();
  await page.getByLabel("Account name").fill(accountName);
  await page.getByRole("dialog", { name: "Add account" }).getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText(accountName, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: budgetName })).toBeVisible();
  await expect(page.getByText(accountName, { exact: true })).toBeVisible();

  assertNoBrowserErrors();
});
