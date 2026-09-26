import { expect, test, type Page } from "@playwright/test";

const adminEmail = "e2e-admin@example.test";
const adminPassword = "E2E-only-password-2026!";
const browserFailures = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  browserFailures.set(page, failures);
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console.error: ${message.text()}`);
  });
});

test.afterEach(async ({ page }) => {
  const failures = browserFailures.get(page) ?? [];
  expect(failures, failures.join("\n")).toEqual([]);
});

async function authenticate(page: Page) {
  await page.goto("/");
  const heading = page.getByRole("heading", {
    name: /Create the administrator account|Sign in/,
  });
  await expect(heading).toBeVisible();
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", {
    name: (await heading.textContent()) === "Create the administrator account"
      ? "Create account"
      : "Sign in",
  }).click();
  await expect(page.getByRole("heading", { name: "Budget Manager" })).toBeVisible();
}

async function createBudget(page: Page, name: string) {
  await page.getByRole("button", { name: "+ New Budget", exact: true }).click();
  await page.getByLabel("Budget name").fill(name);
  await page.getByRole("button", { name: "Create budget", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function createAccount(page: Page, name: string) {
  await page.getByRole("button", { name: "Add account" }).click();
  const dialog = page.getByRole("dialog", { name: "Add account" });
  await dialog.getByLabel("Account name").fill(name);
  await dialog.getByLabel("Starting balance").fill("300");
  await dialog.getByLabel("Starting balance").press("Enter");
  await dialog.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function createCategory(page: Page, name: string) {
  await page.getByRole("button", { name: "Add category" }).click();
  const dialog = page.getByRole("dialog", { name: "New category" });
  await dialog.getByPlaceholder("Category name").fill(name);
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

async function assign(page: Page, category: string, amount: string) {
  await page.getByRole("button", { name: new RegExp(`^Assigned for ${category}:`) }).click();
  const input = page.getByLabel(`Assigned for ${category}`);
  await input.fill(amount);
  await input.press("Enter");
  await expect(
    page.getByLabel(`Available for ${category}: $${Number(amount).toFixed(2)}`),
  ).toBeVisible();
  await page.waitForTimeout(750);
}

test("moves money from multiple categories and keeps effective history aligned with undo and redo", async ({ page }) => {
  const suffix = "Primary";
  const names = {
    budget: `Move Money E2E Budget ${suffix}`,
    account: `Move Money E2E Account ${suffix}`,
    target: `Move Target ${suffix}`,
    source20: `Move Source 20 ${suffix}`,
    source80: `Move Source 80 ${suffix}`,
  };

  await authenticate(page);
  await createBudget(page, names.budget);
  await createAccount(page, names.account);
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await createCategory(page, names.target);
  await createCategory(page, names.source20);
  await createCategory(page, names.source80);
  await assign(page, names.source20, "50");
  await assign(page, names.source80, "120");

  await page.getByRole("button", { name: names.target, exact: true }).click();
  const details = page.getByLabel(`Category details for ${names.target}`);
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Move Money", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Move Money" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Destination category")).toHaveValue(
    await dialog.getByLabel("Destination category").locator("option", { hasText: names.target }).getAttribute("value") ?? "",
  );

  const sourcePicker = dialog.getByLabel("Add source category");
  const source20Value = await sourcePicker.locator("option", { hasText: names.source20 }).getAttribute("value");
  const source80Value = await sourcePicker.locator("option", { hasText: names.source80 }).getAttribute("value");
  expect(source20Value).toBeTruthy();
  expect(source80Value).toBeTruthy();

  await sourcePicker.selectOption(source20Value!);
  await sourcePicker.selectOption(source80Value!);
  await dialog.getByLabel(`Amount from ${names.source20}`).fill("20");
  await dialog.getByLabel(`Amount from ${names.source20}`).press("Enter");
  await dialog.getByLabel(`Amount from ${names.source80}`).fill("80");
  await dialog.getByLabel(`Amount from ${names.source80}`).press("Enter");
  await dialog.getByRole("button", { name: "Move $100.00" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByLabel(`Available for ${names.target}: $100.00`)).toBeVisible();
  await expect(page.getByLabel(`Available for ${names.source20}: $30.00`)).toBeVisible();
  await expect(page.getByLabel(`Available for ${names.source80}: $40.00`)).toBeVisible();

  const movementRoute = `${names.source20} + ${names.source80} → ${names.target}`;
  const movementRow = details
    .locator(".budget-category-details-movement-row")
    .filter({ hasText: movementRoute });
  await expect(movementRow).toBeVisible();
  await expect(movementRow).toContainText("$100.00");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel(`Available for ${names.target}: $0.00`)).toBeVisible();
  await expect(page.getByLabel(`Available for ${names.source20}: $50.00`)).toBeVisible();
  await expect(page.getByLabel(`Available for ${names.source80}: $120.00`)).toBeVisible();
  await expect(
    details.getByText(/^No effective money movements in .+\.$/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel(`Available for ${names.target}: $100.00`)).toBeVisible();
  await expect(details.getByText(movementRoute, { exact: true })).toBeVisible();

  await assign(page, names.source20, "20");
  await assign(page, names.target, "110");

  const manualRoute = `${names.source20} → ${names.target}`;
  const manualMovementRow = details
    .locator(".budget-category-details-movement-row")
    .filter({ hasText: manualRoute });
  await expect(manualMovementRow).toBeVisible();
  await expect(manualMovementRow).toContainText("$10.00");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel(`Available for ${names.source20}: $30.00`)).toBeVisible();
  await expect(page.getByLabel(`Available for ${names.target}: $100.00`)).toBeVisible();
  await expect(manualMovementRow).toBeHidden();

  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel(`Available for ${names.source20}: $20.00`)).toBeVisible();
  await expect(page.getByLabel(`Available for ${names.target}: $110.00`)).toBeVisible();
  await expect(manualMovementRow).toBeVisible();
});
