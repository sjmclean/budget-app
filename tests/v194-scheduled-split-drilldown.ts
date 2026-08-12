import assert from "node:assert/strict";
import { createScheduledHarness } from "./support/scheduledTransactionHarness.ts";

function createService() {
  return createScheduledHarness();
}

async function testScheduledSplitLinesReachListAndRegisterInput() {
  const service = createService();

  const transactions = await service.create({
    accountId: "account-1",
    flag: null,
    nextDueDate: "2026-07-07",
    frequency: "fortnightly",
    payee: "Department Of Education",
    category: "Split",
    memo: "Imported scheduled income allocation",
    outflow: 0,
    inflow: 3621.05,
    splitLines: [
      {
        id: "split-income-a",
        category: "Income Allocation A",
        memo: "Base pay",
        outflow: 0,
        inflow: 2000,
      },
      {
        id: "split-income-b",
        category: "Income Allocation B",
        memo: "Allowance",
        outflow: 0,
        inflow: 1621.05,
      },
    ],
  });

  assert.equal(transactions.length, 1);
  assert.equal(transactions[0]?.category, "Split");
  assert.equal(transactions[0]?.splitLines?.length, 2);
  assert.equal(transactions[0]?.splitLines?.[0]?.category, "Income Allocation A");
  assert.equal(transactions[0]?.splitLines?.[0]?.memo, "Base pay");
  assert.equal(transactions[0]?.splitLines?.[1]?.inflow, 1621.05);

  const registerInput = service.toRegisterInput(transactions[0]!);
  assert.equal(registerInput.splitLines?.length, 2);
  assert.equal(registerInput.splitLines?.[0]?.category, "Income Allocation A");
  assert.notEqual(registerInput.splitLines, transactions[0]?.splitLines, "Split lines should be cloned for register entry");
}

async function testEditingScheduledTransactionPreservesImportedSplitLines() {
  const service = createService();

  const [created] = await service.create({
    accountId: "account-1",
    flag: null,
    nextDueDate: "2026-07-07",
    frequency: "fortnightly",
    payee: "Department Of Education",
    category: "Split",
    memo: "Original memo",
    outflow: 0,
    inflow: 3621.05,
    splitLines: [
      {
        id: "split-income-a",
        category: "Income Allocation A",
        outflow: 0,
        inflow: 2000,
      },
      {
        id: "split-income-b",
        category: "Income Allocation B",
        outflow: 0,
        inflow: 1621.05,
      },
    ],
  });

  assert.ok(created);

  const [updated] = await service.update({
    id: created.id,
    accountId: "account-1",
    flag: "green",
    nextDueDate: "2026-07-08",
    frequency: "monthly",
    payee: "Department Of Education",
    category: "Split",
    memo: "Edited memo",
    outflow: 0,
    inflow: 3621.05,
  });

  assert.ok(updated);
  assert.equal(updated.memo, "Edited memo");
  assert.equal(updated.flag, "green");
  assert.equal(updated.nextDueDate, "2026-07-08");
  assert.equal(updated.splitLines?.length, 2);
  assert.equal(updated.splitLines?.[0]?.category, "Income Allocation A");
  assert.equal(updated.splitLines?.[1]?.inflow, 1621.05);
}

await testScheduledSplitLinesReachListAndRegisterInput();
await testEditingScheduledTransactionPreservesImportedSplitLines();

console.log("v1.94 scheduled split drill-down passed");
