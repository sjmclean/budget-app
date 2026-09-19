import { expect, test } from "@playwright/test";

test("register commands and history emit bounded committed worker deltas", async ({ page }) => {
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
  const transactionId = await page.evaluate(() => {
    const deltas = (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; afterRows?: { row: { id: string; payeeName: string } }[] }[] } }).__registerDeltaTraffic.deltas;
    return deltas.flatMap((delta) => delta.afterRows ?? []).find(({ row }) => row.payeeName === "Delta Merchant")?.row.id ?? null;
  });
  expect(transactionId).not.toBeNull();
  const accountId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.evaluate(async ({ accountId, transactionId }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    if (!budgetId || !transactionId) throw new Error("The register test budget or transaction is missing.");
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!engine) throw new Error("The local command engine is unavailable.");
    await engine.updateTransaction(transactionId, { budgetId, accountId, date: "2026-09-10", amount: -2468, payeeName: "Delta Merchant" });
  }, { accountId, transactionId });
  await expect(page.getByText("-$24.68", { exact: true }).first()).toBeVisible();
  const editTraffic = await page.evaluate(() => (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; beforeRows?: { row: { id: string; amount: number } }[]; afterRows?: { row: { id: string; amount: number; date: string } }[] }[] } }).__registerDeltaTraffic);
  expect(editTraffic.deltas.some((delta) => delta.mode === "patch" && delta.beforeRows?.some(({ row }) => row.id === transactionId && row.amount === -1234) && delta.afterRows?.some(({ row }) => row.id === transactionId && row.amount === -2468 && row.date === "2026-09-10"))).toBe(true);
  await page.evaluate(async ({ accountId, transactionId }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    if (!budgetId || !transactionId) throw new Error("The register test budget or transaction is missing.");
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!engine) throw new Error("The local command engine is unavailable.");
    await engine.deleteTransaction(transactionId, { budgetId, accountId });
  }, { accountId, transactionId });
  await expect(page.getByText("Delta Merchant", { exact: true })).toHaveCount(0);
  const deleteTraffic = await page.evaluate(() => (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; beforeRows?: { row: { id: string } }[]; afterRows?: { row: { id: string } }[] }[] } }).__registerDeltaTraffic);
  expect(deleteTraffic.deltas.some((delta) => delta.mode === "patch" && delta.beforeRows?.some(({ row }) => row.id === transactionId) && !delta.afterRows?.some(({ row }) => row.id === transactionId))).toBe(true);
  await page.getByRole("button", { name: "Add account" }).click();
  const transferAccountDialog = page.getByRole("dialog", { name: "Add account" });
  await transferAccountDialog.getByLabel("Account name").fill("Delta Savings");
  await transferAccountDialog.getByRole("button", { name: "Add account" }).click();
  const transferAccountHref = await page.getByRole("link", { name: /^Delta Savings/ }).getAttribute("href");
  expect(transferAccountHref).toMatch(/\/accounts\//);
  const targetAccountId = transferAccountHref!.split("/").at(-1)!;
  const transferId = await page.evaluate(async ({ accountId, targetAccountId }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    if (!budgetId) throw new Error("The register test budget is missing.");
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!engine) throw new Error("The local command engine is unavailable.");
    const id = crypto.randomUUID();
    await engine.addTransaction({ budgetId, accountId, id, date: "2026-09-11", amount: -500, payeeName: "Delta Transfer", transferAccountId: targetAccountId });
    return id;
  }, { accountId, targetAccountId });
  const transferEvidence = await page.evaluate(async ({ accountId, targetAccountId, transferId }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const queries = getBudgetPersistenceProvider().accountRegisterQueries;
    if (!budgetId || !queries) throw new Error("The local register queries are unavailable.");
    const [source, target] = await Promise.all([queries.queryLocalTransactions({ budgetId, accountId, limit: 150 }), queries.queryLocalTransactions({ budgetId, accountId: targetAccountId, limit: 150 })]);
    const deltas = (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; affectedAccountIds?: string[]; afterRows?: { accountId: string; row: { id: string; amount: number; transferTransactionId: string | null } }[] }[] } }).__registerDeltaTraffic.deltas;
    return { source: source.rows.find(({ id }) => id === transferId), target: target.rows.find(({ transferTransactionId }) => transferTransactionId === transferId), delta: deltas.findLast((candidate) => candidate.mode === "patch" && candidate.afterRows?.some(({ row }) => row.id === transferId)) };
  }, { accountId, targetAccountId, transferId });
  expect(transferEvidence.source?.amount).toBe(-500);
  expect(transferEvidence.target?.amount).toBe(500);
  expect(transferEvidence.delta?.affectedAccountIds).toEqual(expect.arrayContaining([accountId, targetAccountId]));
  expect(transferEvidence.delta?.afterRows?.map(({ row }) => row.id)).toEqual(expect.arrayContaining([transferId, transferEvidence.target!.id]));
  await page.evaluate(async ({ accountId, transferId }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("The local command engine is unavailable.");
    await engine.updateTransaction(transferId, { budgetId, accountId, date: "2026-09-12", amount: -700, payeeName: "Delta Transfer" });
  }, { accountId, transferId });
  const transferUpdate = await page.evaluate(() => (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; afterRows?: { accountId: string; row: { id: string; amount: number; date: string } }[] }[] } }).__registerDeltaTraffic.deltas.findLast((delta) => delta.mode === "patch" && delta.afterRows?.some(({ row }) => row.date === "2026-09-12")));
  expect(transferUpdate?.afterRows?.map(({ row }) => row.amount)).toEqual(expect.arrayContaining([-700, 700]));
  await page.evaluate(async ({ accountId, transferId }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("The local command engine is unavailable.");
    await engine.deleteTransaction(transferId, { budgetId, accountId });
  }, { accountId, transferId });
  const transferDelete = await page.evaluate((transferId) => (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; affectedAccountIds?: string[]; beforeRows?: { row: { id: string } }[]; afterRows?: { row: { id: string } }[] }[] } }).__registerDeltaTraffic.deltas.findLast((delta) => delta.mode === "patch" && delta.beforeRows?.some(({ row }) => row.id === transferId) && !delta.afterRows?.some(({ row }) => row.id === transferId)), transferId);
  expect(transferDelete?.affectedAccountIds).toEqual(expect.arrayContaining([accountId, targetAccountId]));
  expect(transferDelete?.beforeRows?.map(({ row }) => row.id)).toEqual(expect.arrayContaining([transferId, transferEvidence.target!.id]));
  expect(transferDelete?.afterRows).toEqual([]);
  const attachmentIds = await page.evaluate(async (accountId) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("The local command engine is unavailable.");
    const transactionId = crypto.randomUUID();
    const attachmentId = crypto.randomUUID();
    const content = new Uint8Array([1, 2, 3]);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", content));
    const contentHash = `sha256:${[...digest].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    await engine.addTransaction({ budgetId, accountId, id: transactionId, date: "2026-09-13", amount: -100, payeeName: "Attachment Merchant" });
    await engine.addTransactionAttachment({ budgetId, accountId, transactionId, attachment: { id: attachmentId, fileName: "receipt.bin", fileSize: content.byteLength, mimeType: "application/octet-stream", attachedAt: new Date().toISOString(), contentHash }, content });
    return { transactionId, attachmentId };
  }, accountId);
  const attachmentAdd = await page.evaluate(({ transactionId }) => (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; beforeRows?: { row: { id: string; attachmentCount?: number } }[]; afterRows?: { row: { id: string; attachmentCount?: number; attachments?: { id: string; content?: unknown }[] } }[] }[] } }).__registerDeltaTraffic.deltas.findLast((delta) => delta.mode === "patch" && delta.beforeRows?.some(({ row }) => row.id === transactionId && row.attachmentCount === 0) && delta.afterRows?.some(({ row }) => row.id === transactionId && row.attachmentCount === 1)), attachmentIds);
  expect(attachmentAdd?.afterRows?.find(({ row }) => row.id === attachmentIds.transactionId)?.row.attachments?.[0]?.id).toBe(attachmentIds.attachmentId);
  expect(attachmentAdd?.afterRows?.find(({ row }) => row.id === attachmentIds.transactionId)?.row.attachments?.[0]?.content).toBeUndefined();
  const failedAttachment = await page.evaluate(async ({ accountId, transactionId }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const provider = getBudgetPersistenceProvider();
    if (!budgetId || !provider.localBudgetEngine || !provider.accountRegisterQueries) throw new Error("The local register runtime is unavailable.");
    const deltas = (window as typeof window & { __registerDeltaTraffic: { deltas: unknown[] } }).__registerDeltaTraffic.deltas;
    const beforeCount = deltas.length;
    let failed = false;
    try {
      await provider.localBudgetEngine.addTransactionAttachment({ budgetId, accountId, transactionId,
        attachment: { id: crypto.randomUUID(), fileName: "invalid.bin", fileSize: 2, mimeType: "application/octet-stream", attachedAt: new Date().toISOString(), contentHash: `sha256:${"0".repeat(64)}` }, content: new Uint8Array([9]) });
    } catch { failed = true; }
    const page = await provider.accountRegisterQueries.queryLocalTransactions({ budgetId, accountId, limit: 250 });
    return { failed, emittedDelta: deltas.length !== beforeCount, attachmentCount: page.rows.find(({ id }) => id === transactionId)?.attachmentCount };
  }, { accountId, transactionId: attachmentIds.transactionId });
  expect(failedAttachment).toEqual({ failed: true, emittedDelta: false, attachmentCount: 1 });
  await page.evaluate(async ({ accountId, transactionId, attachmentId }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("The local command engine is unavailable.");
    await engine.removeTransactionAttachment({ budgetId, accountId, transactionId, attachmentId });
  }, { accountId, ...attachmentIds });
  const attachmentRemove = await page.evaluate(({ transactionId }) => (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; beforeRows?: { row: { id: string; attachmentCount?: number } }[]; afterRows?: { row: { id: string; attachmentCount?: number } }[] }[] } }).__registerDeltaTraffic.deltas.findLast((delta) => delta.mode === "patch" && delta.beforeRows?.some(({ row }) => row.id === transactionId && row.attachmentCount === 1) && delta.afterRows?.some(({ row }) => row.id === transactionId && row.attachmentCount === 0)), attachmentIds);
  expect(attachmentRemove).toBeDefined();
  const importId = await page.evaluate(async (accountId) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("The local command engine is unavailable.");
    const id = crypto.randomUUID();
    await engine.commitImportBatch({ budgetId, accountId, additions: [{ id, budgetId, accountId, date: "2026-09-14", amount: -201, payeeName: "Small Import" }], updates: [], provenanceAssignments: [], payeeCreations: [] });
    return id;
  }, accountId);
  const smallImportDelta = await page.evaluate((importId) => (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; afterRows?: { row: { id: string } }[] }[] } }).__registerDeltaTraffic.deltas.findLast((delta) => delta.mode === "patch" && delta.afterRows?.some(({ row }) => row.id === importId)), importId);
  expect(smallImportDelta).toBeDefined();
  await page.evaluate(async ({ accountId, importId }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("The local command engine is unavailable.");
    await engine.commitImportBatch({ budgetId, accountId, additions: [], updates: [{ id: importId, budgetId, accountId, date: "2026-09-14", amount: -202, payeeName: "Small Import Updated" }], provenanceAssignments: [], payeeCreations: [] });
  }, { accountId, importId });
  const matchedImportDelta = await page.evaluate((importId) => (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; beforeRows?: { row: { id: string; amount: number } }[]; afterRows?: { row: { id: string; amount: number } }[] }[] } }).__registerDeltaTraffic.deltas.findLast((delta) => delta.mode === "patch" && delta.beforeRows?.some(({ row }) => row.id === importId && row.amount === -201) && delta.afterRows?.some(({ row }) => row.id === importId && row.amount === -202)), importId);
  expect(matchedImportDelta).toBeDefined();
  await page.evaluate(async (accountId) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("The local command engine is unavailable.");
    const additions = Array.from({ length: 251 }, (_, index) => ({ id: crypto.randomUUID(), budgetId, accountId, date: "2026-09-15", amount: -1, payeeName: `Bulk Import ${index}` }));
    await engine.commitImportBatch({ budgetId, accountId, additions, updates: [], provenanceAssignments: [], payeeCreations: [] });
  }, accountId);
  const largeImportDelta = await page.evaluate(() => (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; reason?: string; affectedAccountIds?: string[]; afterRows?: unknown[] }[] } }).__registerDeltaTraffic.deltas.findLast((delta) => delta.mode === "refresh-required"));
  expect(largeImportDelta?.reason).toBe("delta-too-large");
  expect(largeImportDelta?.affectedAccountIds).toContain(accountId);
  expect(largeImportDelta?.afterRows).toBeUndefined();
  expect(JSON.stringify(largeImportDelta).length).toBeLessThan(5_000);
  const dateParity = await page.evaluate(async (accountId) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const reconciliationPath = "/src/features/accounts/registerDeltaReconciliation.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const { compareRegisterDateRows } = await import(reconciliationPath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const queries = getBudgetPersistenceProvider().accountRegisterQueries;
    if (!budgetId || !queries) throw new Error("The local register queries are unavailable.");
    const directions = ["ascending", "descending"] as const;
    return Promise.all(directions.map(async (direction) => {
      const page = await queries.queryLocalTransactions({ budgetId, accountId, limit: 250, sort: { column: "date", direction } });
      return page.rows.map(({ id }) => id).join("|") === [...page.rows].sort((left, right) => compareRegisterDateRows(left, right, direction)).map(({ id }) => id).join("|");
    }));
  }, accountId);
  expect(dateParity).toEqual([true, true]);
  const importHistory = await page.evaluate(async (accountId) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    const queries = getBudgetPersistenceProvider().accountRegisterQueries;
    if (!budgetId || !engine || !queries) throw new Error("The local register runtime is unavailable.");
    const transactionId = crypto.randomUUID();
    const payeeId = crypto.randomUUID();
    const content = new Uint8Array([4]);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", content));
    const contentHash = `sha256:${[...digest].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    const deltas = (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; beforeRows?: { row: { id: string } }[]; afterRows?: { row: { id: string; payeeId?: string | null; attachmentCount?: number; splitLines?: unknown[] } }[] }[] } }).__registerDeltaTraffic.deltas;
    const snapshots = await engine.commitImportBatchWithHistory({ budgetId, accountId,
      additions: [{ id: transactionId, budgetId, accountId, date: "2026-09-16", amount: -301, payeeId, payeeName: "History Import", splitLines: [{ id: crypto.randomUUID(), amount: -150 }, { id: crypto.randomUUID(), amount: -151 }] }],
      updates: [], provenanceAssignments: [], payeeCreations: [{ id: payeeId, name: "History Import" }],
      attachmentCreations: [{ transactionId, attachment: { id: crypto.randomUUID(), fileName: "import-receipt.bin", fileSize: 1, mimeType: "application/octet-stream", attachedAt: new Date().toISOString(), contentHash }, content }],
    });
    const commit = deltas.at(-1);
    await engine.replaceImportHistorySnapshot({ expected: snapshots.after, replacement: snapshots.before });
    const undo = deltas.at(-1);
    await engine.replaceImportHistorySnapshot({ expected: snapshots.before, replacement: snapshots.after });
    const redo = deltas.at(-1);
    const persisted = await queries.queryLocalTransactions({ budgetId, accountId, limit: 250 });
    return {
      committed: commit?.mode === "patch" && commit.afterRows?.some(({ row }) => row.id === transactionId),
      undone: undo?.mode === "patch" && undo.beforeRows?.some(({ row }) => row.id === transactionId) && !undo.afterRows?.some(({ row }) => row.id === transactionId),
      redone: redo?.mode === "patch" && redo.afterRows?.some(({ row }) => row.id === transactionId),
      persisted: persisted.rows.some(({ id }) => id === transactionId),
      richCommit: commit?.afterRows?.some(({ row }) => row.id === transactionId && row.payeeId === payeeId && row.attachmentCount === 1 && row.splitLines?.length === 2),
      richRedo: redo?.afterRows?.some(({ row }) => row.id === transactionId && row.payeeId === payeeId && row.attachmentCount === 1 && row.splitLines?.length === 2),
    };
  }, accountId);
  expect(importHistory).toEqual({ committed: true, undone: true, redone: true, persisted: true, richCommit: true, richRedo: true });
  const bulkClear = await page.evaluate(async ({ accountId, transactionIds }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const engine = getBudgetPersistenceProvider().localBudgetEngine;
    if (!budgetId || !engine) throw new Error("The local command engine is unavailable.");
    await engine.setTransactionsCleared({ budgetId, transactionIds, cleared: true });
    const deltas = (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; beforeRows?: { row: { id: string; clearedStatus: string } }[]; afterRows?: { row: { id: string; clearedStatus: string } }[] }[] } }).__registerDeltaTraffic.deltas;
    const delta = deltas.at(-1);
    return { mode: delta?.mode, before: delta?.beforeRows?.filter(({ row }) => transactionIds.includes(row.id)).map(({ row }) => row.clearedStatus), after: delta?.afterRows?.filter(({ row }) => transactionIds.includes(row.id)).map(({ row }) => row.clearedStatus) };
  }, { accountId, transactionIds: [attachmentIds.transactionId, importId] });
  expect(bulkClear.mode).toBe("patch");
  expect(bulkClear.before).toEqual(["uncleared", "uncleared"]);
  expect(bulkClear.after).toEqual(["cleared", "cleared"]);
  const moveEvidence = await page.evaluate(async ({ accountId, targetAccountId, transactionId }) => {
    const providerPath = "/src/features/persistence/budgetPersistenceProviderFactory.ts";
    const storePath = "/src/stores/uiStore.ts";
    const { getBudgetPersistenceProvider } = await import(providerPath);
    const { useUIStore } = await import(storePath);
    const budgetId = useUIStore.getState().selectedBudgetId;
    const provider = getBudgetPersistenceProvider();
    if (!budgetId || !provider.localBudgetEngine || !provider.accountRegisterQueries) throw new Error("The local register runtime is unavailable.");
    await provider.localBudgetEngine.moveTransactions({ budgetId, sourceAccountId: accountId, targetAccountId, transactionIds: [transactionId] });
    const deltas = (window as typeof window & { __registerDeltaTraffic: { deltas: { mode: string; beforeRows?: { accountId: string; row: { id: string } }[]; afterRows?: { accountId: string; row: { id: string } }[] }[] } }).__registerDeltaTraffic.deltas;
    const delta = deltas.at(-1);
    const [source, target] = await Promise.all([provider.accountRegisterQueries.queryLocalTransactions({ budgetId, accountId, limit: 250 }), provider.accountRegisterQueries.queryLocalTransactions({ budgetId, accountId: targetAccountId, limit: 250 })]);
    return { beforeAccountId: delta?.beforeRows?.find(({ row }) => row.id === transactionId)?.accountId, afterAccountId: delta?.afterRows?.find(({ row }) => row.id === transactionId)?.accountId, inSource: source.rows.some(({ id }) => id === transactionId), inTarget: target.rows.some(({ id }) => id === transactionId) };
  }, { accountId, targetAccountId, transactionId: attachmentIds.transactionId });
  expect(moveEvidence).toEqual({ beforeAccountId: accountId, afterAccountId: targetAccountId, inSource: false, inTarget: true });
});
