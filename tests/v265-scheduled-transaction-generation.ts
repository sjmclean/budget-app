import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { generateDueScheduledTransactions } from "../apps/web/src/features/accounts/scheduledTransactionGenerationService.js";
import type { AppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGateway.js";
import type { AccountRegisterView, NewRegisterTransactionInput } from "../apps/web/src/features/accounts/accountRegisterTypes.js";
import type { SidebarAccount } from "../apps/web/src/features/accounts/accountService.js";
import type { ScheduledTransactionView } from "../apps/web/src/features/accounts/scheduledTransactionService.js";

async function main() {
  await validatesAutomaticDueGeneration();
  await validatesDuplicateProtectionForExistingGeneratedOccurrence();
  await validatesDuplicateProtectionForExistingLegacyOccurrenceAndCatchup();
  validatesIntegrationAndMarker();

  console.log("v2.65 scheduled transaction generation checks passed");
}

async function validatesAutomaticDueGeneration() {
  const fixture = createFixture({
    schedules: [
      createSchedule({
        id: "salary",
        nextDueDate: "2026-07-22",
        frequency: "fortnightly",
        payee: "Department Of Education",
        inflow: 3621.05,
        splitLines: [
          {
            id: "salary-income",
            category: "Ready to Assign",
            categoryId: "__ready_to_assign__",
            inflow: 2291.18,
            outflow: 0,
          },
          {
            id: "salary-tax",
            category: "Tax",
            categoryId: "tax",
            inflow: 0,
            outflow: 1329.87,
          },
        ],
      }),
    ],
  });

  const result = await generateDueScheduledTransactions(fixture.gateway, {
    today: "2026-07-22",
  });

  assert.equal(result.createdTransactions.length, 1, "due schedule should generate one transaction");
  assert.equal(result.createdTransactions[0]?.scheduledTransactionId, "salary");
  const generated = fixture.registers.everyday.transactions[0];
  assert.equal(generated?.payee, "Department Of Education");
  assert.equal(generated?.date, "2026-07-22");
  assert.equal(generated?.generatedFromSchedule, true);
  assert.equal(generated?.scheduledTransactionId, "salary");
  assert.equal(generated?.scheduledOccurrenceDate, "2026-07-22");
  assert.equal(generated?.splitLines?.length, 2, "split lines should be preserved");
  assert.equal(fixture.schedules[0]?.nextDueDate, "2026-08-05", "fortnightly schedule should advance");
}

async function validatesDuplicateProtectionForExistingGeneratedOccurrence() {
  const fixture = createFixture({
    schedules: [
      createSchedule({
        id: "rent",
        nextDueDate: "2026-06-01",
        frequency: "monthly",
        payee: "Rent",
        outflow: 1800,
      }),
    ],
  });

  fixture.registers.everyday.transactions.push({
    id: "existing-rent",
    date: "2026-06-01",
    flag: null,
    attachmentCount: 0,
    attachments: [],
    payee: "Rent",
    category: "Rent",
    memo: "",
    outflow: 1800,
    inflow: 0,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
    generatedFromSchedule: true,
    scheduledTransactionId: "rent",
    scheduledOccurrenceDate: "2026-06-01",
  });

  const result = await generateDueScheduledTransactions(fixture.gateway, {
    today: "2026-06-01",
  });

  assert.equal(result.skippedDuplicateOccurrences.length, 1, "existing generated occurrence should be skipped");
  assert.equal(result.createdTransactions.length, 0, "existing generated occurrence should not be duplicated");
  assert.equal(fixture.schedules[0]?.nextDueDate, "2026-07-01");
}

async function validatesDuplicateProtectionForExistingLegacyOccurrenceAndCatchup() {
  const fixture = createFixture({
    schedules: [
      createSchedule({
        id: "rent",
        nextDueDate: "2026-06-01",
        frequency: "monthly",
        payee: "Rent",
        outflow: 1800,
      }),
    ],
  });

  fixture.registers.everyday.transactions.push({
    id: "existing-rent-without-scheduled-metadata",
    date: "2026-06-01",
    flag: null,
    attachmentCount: 0,
    attachments: [],
    payee: "Rent",
    category: "Rent",
    memo: "",
    outflow: 1800,
    inflow: 0,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
  });

  const result = await generateDueScheduledTransactions(fixture.gateway, {
    today: "2026-08-15",
  });

  assert.equal(result.skippedDuplicateOccurrences.length, 1, "legacy matching occurrence should be skipped");
  assert.equal(result.createdTransactions.length, 2, "missed July and August occurrences should be created");
  assert.deepEqual(
    fixture.registers.everyday.transactions
      .filter((transaction) =>
        transaction.payee === "Rent" &&
        transaction.date >= "2026-06-01" &&
        transaction.date <= "2026-08-01"
      )
      .map((transaction) => transaction.date)
      .sort(),
    ["2026-06-01", "2026-07-01", "2026-08-01"],
    "catch-up generation should not duplicate existing legacy occurrence",
  );
  assert.deepEqual(
    fixture.registers.everyday.transactions
      .filter((transaction) => transaction.scheduledTransactionId === "rent")
      .map((transaction) => transaction.scheduledOccurrenceDate)
      .sort(),
    ["2026-07-01", "2026-08-01"],
    "only newly generated occurrences should receive v2.65 provenance",
  );
  assert.equal(fixture.schedules[0]?.nextDueDate, "2026-09-01");
}


function validatesIntegrationAndMarker() {
  const useAccountRegister = readFileSync("apps/web/src/features/accounts/useAccountRegister.ts", "utf8");
  const transactionRow = readFileSync("apps/web/src/features/accounts/components/TransactionRow.tsx", "utf8");
  const accountTypes = readFileSync("apps/web/src/features/accounts/accountRegisterTypes.ts", "utf8");
  const packageJson = readFileSync("package.json", "utf8");

  assert.match(useAccountRegister, /generateDueScheduledTransactions/, "register loading should run the generation engine");
  assert.match(transactionRow, /register-scheduled-badge/, "generated transactions should have a visible scheduled badge");
  assert.match(accountTypes, /scheduledOccurrenceDate/, "register transactions should preserve scheduled occurrence provenance");
  assert.match(packageJson, /test:v265/, "package scripts should expose v2.65 validation");
}

function createFixture(input: { schedules: ScheduledTransactionView[] }) {
  const accounts: SidebarAccount[] = [
    {
      id: "everyday",
      name: "Everyday",
      type: "on-budget",
      startingBalance: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      closedAt: null,
    },
  ];
  const schedules = input.schedules.map((schedule) => ({ ...schedule }));
  const registers: Record<string, AccountRegisterView> = {
    everyday: createRegister("everyday", "Everyday"),
  };

  const gateway = {
    accounts: { async listAccounts() { return accounts; } },
    accountRegisters: {
      async getAccountRegisterView({ accountId }: { accountId: string }) {
        registers[accountId] ??= createRegister(accountId, accountId);
        return registers[accountId];
      },
      async addTransaction({ accountId, transaction }: { accountId: string; transaction: NewRegisterTransactionInput }) {
        registers[accountId] ??= createRegister(accountId, accountId);
        registers[accountId].transactions.unshift({
          id: `generated-${registers[accountId].transactions.length + 1}`,
          date: transaction.date,
          flag: transaction.flag ?? null,
          attachmentCount: 0,
          attachments: [],
          payee: transaction.payee,
          payeeId: transaction.payeeId,
          category: transaction.category,
          categoryId: transaction.categoryId,
          memo: transaction.memo,
          checkNumber: transaction.checkNumber,
          inflow: transaction.inflow,
          outflow: transaction.outflow,
          runningBalance: 0,
          cleared: false,
          reconciled: false,
          splitLines: transaction.splitLines?.map((line) => ({ ...line })),
          generatedFromSchedule: transaction.generatedFromSchedule,
          scheduledTransactionId: transaction.scheduledTransactionId,
          scheduledOccurrenceDate: transaction.scheduledOccurrenceDate,
        });
        return registers[accountId];
      },
    },
    scheduledTransactions: {
      async listByAccount(accountId: string) {
        return schedules
          .filter((schedule) => schedule.accountId === accountId)
          .sort((left, right) => left.nextDueDate.localeCompare(right.nextDueDate));
      },
      toRegisterInput(schedule: ScheduledTransactionView): NewRegisterTransactionInput {
        return {
          date: schedule.nextDueDate,
          flag: schedule.flag,
          payee: schedule.payee,
          payeeId: schedule.payeeId,
          category: schedule.category,
          memo: schedule.memo,
          outflow: schedule.outflow,
          inflow: schedule.inflow,
          splitLines: schedule.splitLines?.map((line) => ({ ...line })),
        };
      },
      async advanceAfterEnter(accountId: string, scheduledTransactionId: string) {
        const index = schedules.findIndex((schedule) => schedule.id === scheduledTransactionId);
        if (index === -1) return [];
        if (schedules[index].frequency === "once") {
          schedules.splice(index, 1);
          return schedules.filter((schedule) => schedule.accountId === accountId);
        }
        schedules[index] = {
          ...schedules[index],
          nextDueDate: advanceDate(schedules[index].nextDueDate, schedules[index].frequency),
          updatedAt: "2026-07-22T00:00:00.000Z",
        };
        return schedules.filter((schedule) => schedule.accountId === accountId);
      },
    },
  } as unknown as AppPersistenceGateway;

  return { gateway, accounts, schedules, registers };
}

function createSchedule(input: Partial<ScheduledTransactionView> & {
  id: string;
  nextDueDate: string;
  frequency: ScheduledTransactionView["frequency"];
  payee: string;
}): ScheduledTransactionView {
  return {
    id: input.id,
    accountId: input.accountId ?? "everyday",
    flag: input.flag ?? null,
    nextDueDate: input.nextDueDate,
    frequency: input.frequency,
    payee: input.payee,
    payeeId: input.payeeId,
    category: input.category ?? (input.splitLines ? "Split" : "Bills"),
    memo: input.memo ?? "",
    outflow: input.outflow ?? 0,
    inflow: input.inflow ?? 0,
    splitLines: input.splitLines,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createRegister(accountId: string, accountName: string): AccountRegisterView {
  return {
    accountId,
    accountName,
    accountType: "On budget",
    currencyCode: "AUD",
    clearedBalance: 0,
    unclearedBalance: 0,
    workingBalance: 0,
    transactions: [],
  };
}

function advanceDate(date: string, frequency: ScheduledTransactionView["frequency"]): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year, month - 1, day);

  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else if (frequency === "fortnightly") next.setDate(next.getDate() + 14);
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  else if (frequency === "yearly") next.setFullYear(next.getFullYear() + 1);

  return [
    String(next.getFullYear()).padStart(4, "0"),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-");
}

await main();
