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
  // The prompt closes before the asynchronous category command and budget
  // projection refresh necessarily finish. Wait for the actual category row,
  // which is the observable completion condition this helper needs.
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

async function assign(page: Page, category: string, amount: string) {
  await page.getByRole("button", { name: new RegExp(`^Assigned for ${category}:`) }).click();
  const input = page.getByLabel(`Assigned for ${category}`);
  await input.fill(amount);
  await input.press("Enter");
  await expect(page.getByLabel(`Available for ${category}: $${Number(amount).toFixed(2)}`)).toBeVisible();
  // Budget assignments are intentionally persisted through a short batching window.
  await page.waitForTimeout(750);
}

async function addExpense(
  page: Page,
  accountName: string,
  category: string,
  amount: string,
) {
  await page.getByRole("link", { name: new RegExp(`^${accountName}`) }).click();
  await expect(page).toHaveURL(/\/accounts\//);
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByPlaceholder("Payee").fill("Cover E2E Merchant");
  await page.getByPlaceholder("Category").fill(category);
  await page.getByRole("option", { name: category, exact: true }).click();
  await page.getByPlaceholder("Outflow").fill(amount);
  await page.getByPlaceholder("Outflow").press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Cover E2E Merchant", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
}

async function prepareOverspendingScenario(page: Page, suffix: string) {
  const names = {
    budget: `Cover E2E Budget ${suffix}`,
    account: `Cover E2E Account ${suffix}`,
    target: `Cover Target ${suffix}`,
    source20: `Cover Source 20 ${suffix}`,
    source80: `Cover Source 80 ${suffix}`,
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
  await addExpense(page, names.account, names.target, "100");
  await expect(page.getByRole("button", { name: `Cover overspending for ${names.target}` })).toContainText("-$100.00");

  return names;
}

async function addCoverSource(window: ReturnType<Page["getByRole"]>, name: string) {
  await window.getByRole("button", { name: "Add category" }).click();
  await window.getByRole("button", { name: new RegExp(`^${name}`) }).click();
}

test("covers $100 of overspending from two categories and persists every balance", async ({ page }) => {
  const names = await prepareOverspendingScenario(page, "Primary");
  await page.getByRole("button", { name: `Cover overspending for ${names.target}` }).click();
  const window = page.getByRole("menu", { name: `${names.target} category actions` });

  await addCoverSource(window, names.source20);
  await addCoverSource(window, names.source80);
  await window.getByLabel(`Amount from ${names.source20}`).fill("20");
  await window.getByLabel(`Amount from ${names.source20}`).press("Enter");
  await window.getByLabel(`Amount from ${names.source80}`).fill("80");
  await window.getByLabel(`Amount from ${names.source80}`).press("Enter");

  await expect(window.getByText("Needed", { exact: true }).locator("..")).toContainText("$100.00");
  await expect(window.getByText("Selected", { exact: true }).locator("..")).toContainText("$100.00");
  await expect(window.getByText("Remaining", { exact: true }).locator("..")).toContainText("$0.00");
  await window.getByRole("button", { name: "Cover $100.00" }).click();

  await expect(window).toBeHidden();
  await expect(page.getByLabel(`Available for ${names.target}: $0.00`)).toBeVisible();
  await expect(page.getByLabel(`Available for ${names.source20}: $30.00`)).toBeVisible();
  await expect(page.getByLabel(`Available for ${names.source80}: $40.00`)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel(`Available for ${names.target}: $0.00`)).toBeVisible();
  await expect(page.getByLabel(`Available for ${names.source20}: $30.00`)).toBeVisible();
  await expect(page.getByLabel(`Available for ${names.source80}: $40.00`)).toBeVisible();
});

test("keeps an in-progress Cover draft while switching through Category Settings", async ({ page }) => {
  const names = await prepareOverspendingScenario(page, "Draft");
  await page.getByRole("button", { name: `Cover overspending for ${names.target}` }).click();
  const window = page.getByRole("menu", { name: `${names.target} category actions` });

  await addCoverSource(window, names.source20);
  await addCoverSource(window, names.source80);
  await window.getByLabel(`Amount from ${names.source20}`).fill("20");
  await window.getByLabel(`Amount from ${names.source20}`).press("Enter");
  await window.getByLabel(`Amount from ${names.source80}`).fill("80");
  await window.getByLabel(`Amount from ${names.source80}`).press("Enter");

  await window.getByRole("tab", { name: "Category Settings" }).click();
  await window.getByRole("tab", { name: "Cover Overspending" }).click();

  await expect(window.getByLabel(`Amount from ${names.source20}`)).toHaveValue("20.00");
  await expect(window.getByLabel(`Amount from ${names.source80}`)).toHaveValue("80.00");
  await expect(window.getByText("Selected", { exact: true }).locator("..")).toContainText("$100.00");
  await expect(window.getByText("Remaining", { exact: true }).locator("..")).toContainText("$0.00");
});
