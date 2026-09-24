import { expect, test } from "@playwright/test";

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber!, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

test("Ready to Assign income uses its transaction month without exposing a Budget in selector", async ({ page }) => {
  await page.goto("/");

  const authenticationHeading = page.getByRole("heading", {
    name: /Create the administrator account|Sign in/,
  });
  await expect(authenticationHeading).toBeVisible();
  await page.getByLabel("Email").fill("e2e-admin@example.test");
  await page.getByLabel("Password").fill("E2E-only-password-2026!");
  await page.getByRole("button", {
    name:
      (await authenticationHeading.textContent()) ===
      "Create the administrator account"
        ? "Create account"
        : "Sign in",
  }).click();

  await expect(page.getByRole("heading", { name: "Budget Manager" })).toBeVisible();
  await page.getByRole("button", { name: "+ New Budget", exact: true }).click();
  await page.getByLabel("Budget name").fill("Income Month E2E");
  await page.getByRole("button", { name: "Create budget", exact: true }).click();

  await page.getByRole("button", { name: "Add account" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Add account" });
  await accountDialog.getByLabel("Account name").fill("Income Checking");
  await accountDialog.getByRole("button", { name: "Add account" }).click();
  await page.getByRole("link", { name: /^Income Checking/ }).click();
  await expect(page).toHaveURL(/\/accounts\//);

  const transactionMonth = await page.evaluate(() =>
    new Date().toISOString().slice(0, 7),
  );
  const futureMonth = nextMonth(transactionMonth);

  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByPlaceholder("Payee").fill("Future Employer");
  await page.getByPlaceholder("Inflow").fill("100.00");
  await page.getByPlaceholder("Inflow").press("Enter");

  await expect(page.getByLabel("Budget in month")).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Future Employer", { exact: true })).toBeVisible();

  const accountId = new URL(page.url()).pathname.split("/").at(-1)!;
  async function readEvidence() {
    return page.evaluate(
      async ({ accountId, transactionMonth, futureMonth }) => {
        const providerPath =
          "/src/features/persistence/budgetPersistenceProviderFactory.ts";
        const storePath = "/src/stores/uiStore.ts";
        const { getBudgetPersistenceProvider } = await import(providerPath);
        const { useUIStore } = await import(storePath);
        const budgetId = useUIStore.getState().selectedBudgetId;
        const provider = getBudgetPersistenceProvider();
        if (!budgetId || !provider.accountRegisterQueries) {
          throw new Error("The local budget runtime is unavailable.");
        }

        const [current, future, register] = await Promise.all([
          provider.budgetView.getBudgetMonthView({
            budgetId,
            month: transactionMonth,
          }),
          provider.budgetView.getBudgetMonthView({
            budgetId,
            month: futureMonth,
          }),
          provider.accountRegisterQueries.queryLocalTransactions({
            budgetId,
            accountId,
            limit: 150,
          }),
        ]);
        const row = register.rows.find(
          ({ payeeName }) => payeeName === "Future Employer",
        );

        return {
          currentIncome: current.incomeForMonth,
          futureIncome: future.incomeForMonth,
          futureReadyToAssign: future.readyToAssign,
          incomeBudgetMonth: row?.incomeBudgetMonth ?? null,
          transactionDate: row?.date ?? null,
        };
      },
      { accountId, transactionMonth, futureMonth },
    );
  }

  await expect.poll(readEvidence).toEqual({
    currentIncome: 100,
    futureIncome: 0,
    futureReadyToAssign: 100,
    incomeBudgetMonth: transactionMonth,
    transactionDate: expect.stringMatching(new RegExp(`^${transactionMonth}-`)),
  });

  await page
    .getByRole("status")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(page.getByText("Future Employer", { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await readEvidence()).currentIncome).toBe(0);

  await page.getByRole("button", { name: "Register options" }).first().click();
  await page.getByRole("menuitem", { name: /Redo/ }).click();
  await expect(page.getByText("Future Employer", { exact: true })).toBeVisible();
  await expect.poll(readEvidence).toEqual({
    currentIncome: 100,
    futureIncome: 0,
    futureReadyToAssign: 100,
    incomeBudgetMonth: transactionMonth,
    transactionDate: expect.stringMatching(new RegExp(`^${transactionMonth}-`)),
  });
});
