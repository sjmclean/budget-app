import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase } from "../packages/database/src/db.js";
import { importRuns } from "../packages/database/src/schema.js";
import {
  executeYnab4PackageImportToNewBudget,
  type Ynab4ImportProgressEvent,
} from "../packages/ynab4-importer/src/executeYnab4PackageImport.js";

const tempDir = mkdtempSync(join(tmpdir(), "budget-app-v170-"));

try {
  const db = createDatabase(join(tempDir, "v170.sqlite"));
  const events: Ynab4ImportProgressEvent[] = [];

  const result = executeYnab4PackageImportToNewBudget(
    db,
    [
      {
        path: "Household.ynab4/Budget.ymeta",
        text: JSON.stringify({ relativeDataFolderName: "data1-AAAA" }),
      },
      {
        path: "Household.ynab4/data1-AAAA/budget-guid/Budget.yfull",
        text: JSON.stringify({
          accounts: [
            { entityId: "acct-cheque", accountName: "Cheque Account", accountType: "Checking", balance: 100000 },
            { entityId: "acct-visa", accountName: "Visa Card", accountType: "CreditCard", balance: -25000 },
          ],
          masterCategories: [
            {
              entityId: "group-everyday",
              name: "Everyday Expenses",
              subCategories: [{ entityId: "cat-groceries", name: "Groceries" }],
            },
          ],
          payees: [
            { entityId: "payee-coles", name: "Coles" },
            { entityId: "payee-transfer-visa", name: "Transfer : Visa Card", targetAccountId: "acct-visa" },
            { entityId: "payee-transfer-cheque", name: "Transfer : Cheque Account", targetAccountId: "acct-cheque" },
          ],
          transactions: [
            {
              entityId: "txn-payment-source",
              accountId: "acct-cheque",
              payeeId: "payee-transfer-visa",
              targetAccountId: "acct-visa",
              transferTransactionId: "txn-payment-target",
              amount: -25000,
              date: "2026-01-12",
            },
            {
              entityId: "txn-payment-target",
              accountId: "acct-visa",
              payeeId: "payee-transfer-cheque",
              targetAccountId: "acct-cheque",
              transferTransactionId: "txn-payment-source",
              amount: 25000,
              date: "2026-01-12",
            },
            {
              entityId: "txn-card-spend",
              accountId: "acct-visa",
              payeeId: "payee-coles",
              categoryId: "cat-groceries",
              amount: -4250,
              date: "2026-01-13",
            },
          ],
          scheduledTransactions: [
            {
              entityId: "sched-card-payment",
              accountId: "acct-cheque",
              payeeId: "payee-transfer-visa",
              targetAccountId: "acct-visa",
              amount: -10000,
              nextDueDate: "2026-02-01",
              frequency: "monthly",
            },
          ],
          monthlyBudgets: [
            {
              entityId: "MB/2026-01",
              month: "2026-01-01",
              monthlySubCategoryBudgets: [
                {
                  entityId: "MCB/2026-01/cat-groceries",
                  categoryId: "cat-groceries",
                  budgeted: 125,
                  activity: -42.5,
                  balance: 82.5,
                },
              ],
            },
          ],
        }),
      },
    ],
    {
      currency: "AUD",
      userId: "local-user",
      now: new Date("2026-01-20T00:00:00.000Z"),
      onProgress: (event) => events.push(event),
    },
  );

  assert.equal(result.status, "completed");
  assert.ok(events.length >= 20, "import should emit start/completed events for each stage");
  assert.equal(result.progress.totalEvents, events.length);
  assert.equal(events[0].stage, "discover-package");
  assert.equal(events[0].status, "started");
  assert.equal(events.at(-1)?.stage, "complete");
  assert.equal(events.at(-1)?.status, "completed");

  const completedStages = events.filter((event) => event.status === "completed").map((event) => event.stage);
  assert.deepEqual(completedStages, result.progress.completedStages);
  assert.ok(completedStages.includes("import-accounts"));
  assert.ok(completedStages.includes("import-categories"));
  assert.ok(completedStages.includes("import-payees"));
  assert.ok(completedStages.includes("import-transactions"));
  assert.ok(completedStages.includes("import-scheduled-transactions"));
  assert.ok(completedStages.includes("import-monthly-budgets"));
  assert.ok(completedStages.includes("write-import-run"));
  assert.ok(completedStages.includes("write-import-maps"));

  const accountComplete = events.find((event) => event.stage === "import-accounts" && event.status === "completed");
  assert.ok(accountComplete);
  assert.equal(accountComplete.total, 2);
  assert.equal(accountComplete.created, 2);

  const transactionComplete = events.find((event) => event.stage === "import-transactions" && event.status === "completed");
  assert.ok(transactionComplete);
  assert.equal(transactionComplete.total, 3);
  assert.equal(transactionComplete.created, 3);
  assert.equal(transactionComplete.skipped, 0);

  const importRun = db.select().from(importRuns).where(eq(importRuns.id, result.importRunId)).get();
  assert.ok(importRun);

  const summary = JSON.parse(importRun.summaryJson ?? "{}");
  assert.equal(summary.progress.totalEvents, 21);
  assert.ok(events.length >= summary.progress.totalEvents);
  assert.ok(events.length >= summary.progress.totalEvents);
  assert.ok(Array.isArray(summary.progress.completedStages));
  assert.ok(summary.progress.completedStages.includes("import-transactions"));

  console.log("v1.70 YNAB4 import progress reporting passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
