import { expect, test } from "@playwright/test";

test("ordinary register add applies committed worker delta without a full-page query", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const traffic: { requests: { type: string; query?: { accountId: string; limit: number; offset?: number } }[]; deltas: unknown[] } = { requests: [], deltas: [] };
    (window as typeof window & { __registerDeltaTraffic: typeof traffic }).__registerDeltaTraffic = traffic;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event) => {
          if (event.data?.registerDelta) traffic.deltas.push(event.data.registerDelta);
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[]) {
        const request = message as { type?: string; query?: { accountId: string; limit: number; offset?: number } };
        if (typeof request.type === "string") traffic.requests.push({ type: request.type, query: request.query });
        super.postMessage(message, transfer ?? []);
      }
    };
  });
  await page.goto("/");
  const authenticationHeading = page.getByRole("heading", { name: /Create the administrator account|Sign in/ });
  await expect(authenticationHeading).toBeVisible();
  await page.getByLabel("Email").fill("e2e-admin@example.test");
  await page.getByLabel("Password").fill("E2E-only-password-2026!");
  await page.getByRole("button", { name: (await authenticationHeading.textContent()) === "Create the administrator account" ? "Create account" : "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Budget Manager" })).toBeVisible();
  await page.getByRole("button", { name: "+ New Budget", exact: true }).click();
  await page.getByLabel("Budget name").fill("Register Delta E2E");
  await page.getByRole("button", { name: "Create budget", exact: true }).click();
  await page.getByRole("button", { name: "Add account" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Add account" });
  await accountDialog.getByLabel("Account name").fill("Delta Checking");
  await accountDialog.getByRole("button", { name: "Add account" }).click();
  await page.getByRole("link", { name: /^Delta Checking/ }).click();
  await expect(page).toHaveURL(/\/accounts\//);
  await page.evaluate(() => {
    const traffic = (window as typeof window & { __registerDeltaTraffic: { requests: unknown[]; deltas: unknown[] } }).__registerDeltaTraffic;
    traffic.requests.length = 0;
    traffic.deltas.length = 0;
  });
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByPlaceholder("Payee").fill("Delta Merchant");
  await page.getByPlaceholder("Outflow").fill("12.34");
  await page.getByPlaceholder("Outflow").press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Delta Merchant", { exact: true })).toBeVisible();
  const traffic = await page.evaluate(() => (window as typeof window & { __registerDeltaTraffic: { requests: { type: string; query?: { accountId: string; limit: number; offset?: number } }[]; deltas: { mode: string; afterRows?: { row: { payeeName: string } }[] }[] } }).__registerDeltaTraffic);
  const committedIndex = traffic.requests.findIndex(({ type }) => type === "writeTransactionBatch");
  expect(committedIndex).toBeGreaterThanOrEqual(0);
  const remoteApplyIndex = traffic.requests.findIndex(({ type }, index) => index > committedIndex && type === "applyRemoteMutations");
  const localBoundaryEnd = remoteApplyIndex < 0 ? traffic.requests.length : remoteApplyIndex;
  expect(traffic.requests.slice(committedIndex + 1, localBoundaryEnd).filter(({ type, query }) => type === "queryTransactions" && query?.limit === 150)).toEqual([]);
  expect(traffic.deltas.some((delta) => delta.mode === "patch" && delta.afterRows?.some(({ row }) => row.payeeName === "Delta Merchant"))).toBe(true);
  await page.getByRole("status").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Delta Merchant", { exact: true })).toHaveCount(0);
  const undoTraffic = await page.evaluate(() => (window as typeof window & { __registerDeltaTraffic: { requests: { type: string }[]; deltas: { mode: string; beforeRows?: { row: { payeeName: string } }[]; afterRows?: { row: { payeeName: string } }[] }[] } }).__registerDeltaTraffic);
  expect(undoTraffic.requests.some(({ type }) => type === "deleteTransactionHistorySnapshot")).toBe(true);
  expect(undoTraffic.deltas.some((delta) => delta.mode === "patch" && delta.beforeRows?.some(({ row }) => row.payeeName === "Delta Merchant") && !delta.afterRows?.some(({ row }) => row.payeeName === "Delta Merchant"))).toBe(true);
  await page.getByRole("button", { name: "Register options" }).first().click();
  await page.getByRole("menuitem", { name: /Redo/ }).click();
  await expect(page.getByText("Delta Merchant", { exact: true })).toBeVisible();
  const redoTraffic = await page.evaluate(() => (window as typeof window & { __registerDeltaTraffic: { requests: { type: string }[]; deltas: { mode: string; afterRows?: { row: { payeeName: string } }[] }[] } }).__registerDeltaTraffic);
  expect(redoTraffic.requests.some(({ type }) => type === "restoreTransactionHistorySnapshot")).toBe(true);
  expect(redoTraffic.deltas.some((delta) => delta.mode === "patch" && delta.afterRows?.some(({ row }) => row.payeeName === "Delta Merchant"))).toBe(true);
  await page.getByRole("button", { name: "Mark cleared", exact: true }).click();
  await expect(page.getByTitle("Cleared", { exact: true })).toBeVisible();
  const clearTraffic = await page.evaluate(() => (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; beforeRows?: { row: { clearedStatus: string; payeeName: string } }[]; afterRows?: { row: { clearedStatus: string; payeeName: string } }[] }[] } }).__registerDeltaTraffic);
  expect(clearTraffic.deltas.some((delta) => delta.mode === "patch" && delta.beforeRows?.some(({ row }) => row.payeeName === "Delta Merchant" && row.clearedStatus === "uncleared") && delta.afterRows?.some(({ row }) => row.payeeName === "Delta Merchant" && row.clearedStatus === "cleared"))).toBe(true);
});
