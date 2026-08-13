import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateDueScheduledTransactions,
} from "../../../apps/web/src/features/accounts/scheduledTransactionGenerationService.ts";
import type {
  RegisterTransactionView,
} from "../../../apps/web/src/features/accounts/accountRegisterTypes.ts";
import type {
  BudgetPersistenceProvider,
} from "../../../apps/web/src/features/persistence/budgetPersistenceProvider.ts";
import {
  createSchedule,
  createScheduledHarness,
} from "../../support/scheduledTransactionHarness.ts";

test("a partially persisted scheduled occurrence is retried before its schedule advances", async () => {
  const scheduledTransactions = createScheduledHarness();

  const schedule = await createSchedule(scheduledTransactions, {
    frequency: "weekly",
    nextDueDate: "2026-08-13",
    recurrenceAnchorDate: "2026-08-13",
    attachments: [
      {
        id: "attachment-a",
        fileName: "first.txt",
        fileSize: 1,
        mimeType: "text/plain",
        contentHash: "hash-a",
        contentBase64: "QQ==",
      },
      {
        id: "attachment-b",
        fileName: "second.txt",
        fileSize: 1,
        mimeType: "text/plain",
        contentHash: "hash-b",
        contentBase64: "Qg==",
      },
    ] as any,
  });

  const persistedTransactions: RegisterTransactionView[] = [];
  const persistedAttachmentIds = new Set<string>();

  let addCalls = 0;
  let repairCalls = 0;
  let failSecondAttachment = true;

  const gateway = {
    scheduledTransactions,
  } as unknown as BudgetPersistenceProvider;

  const hostedTransactions = {
    async listRecent() {
      return persistedTransactions;
    },

    async add(_accountId: string, transaction: any) {
      addCalls += 1;

      // The real hosted/local-first path persists the transaction first.
      if (
        !persistedTransactions.some(
          (existing) =>
            existing.scheduledTransactionId ===
              transaction.scheduledTransactionId &&
            existing.scheduledOccurrenceDate ===
              transaction.scheduledOccurrenceDate,
        )
      ) {
        persistedTransactions.push({
          id: `generated-${transaction.scheduledTransactionId}`,
          date: transaction.date,
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
          generatedFromSchedule: true,
          scheduledTransactionId: transaction.scheduledTransactionId,
          scheduledOccurrenceDate: transaction.scheduledOccurrenceDate,
          splitLines: transaction.splitLines ?? [],
          tagIds: transaction.tagIds ?? [],
        });
      }

      // Then scheduled attachments are persisted separately.
      const attachments = transaction.scheduledAttachments ?? [];

      for (const attachment of attachments) {
        if (attachment.id === "attachment-b" && failSecondAttachment) {
          failSecondAttachment = false;
          throw new Error("simulated attachment write failure");
        }

        persistedAttachmentIds.add(attachment.id);
      }
    },

    async repairExisting(
      _accountId: string,
      _existingTransaction: RegisterTransactionView,
      transaction: any,
    ) {
      repairCalls += 1;

      for (const attachment of transaction.scheduledAttachments ?? []) {
        persistedAttachmentIds.add(attachment.id);
      }
    },
  };

  await assert.rejects(
    generateDueScheduledTransactions(gateway, {
      today: "2026-08-13",
      force: true,
      scope: "attachment-retry-test",
      listAccounts: async () => [
        { id: "checking", name: "Checking" },
      ],
      hostedTransactions,
    }),
    /simulated attachment write failure/,
  );

  assert.equal(addCalls, 1);
  assert.equal(persistedTransactions.length, 1);
  assert.deepEqual(
    [...persistedAttachmentIds],
    ["attachment-a"],
  );

  // The failed run must not have advanced the schedule.
  let remaining = await scheduledTransactions.listByAccount("checking");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.nextDueDate, "2026-08-13");

  await generateDueScheduledTransactions(gateway, {
    today: "2026-08-13",
    force: true,
    scope: "attachment-retry-test",
    listAccounts: async () => [
      { id: "checking", name: "Checking" },
    ],
    hostedTransactions,
  });

  // Correct behaviour: the incomplete materialisation must be retried,
  // including attachment-b, before advancing the schedule.
  // The existing transaction itself must not be replayed, because doing so
  // could overwrite a user edit. Only incomplete generated materialisation
  // should be repaired.
  assert.equal(addCalls, 1);
  assert.equal(repairCalls, 1);
  assert.deepEqual(
    [...persistedAttachmentIds].sort(),
    ["attachment-a", "attachment-b"],
  );

  remaining = await scheduledTransactions.listByAccount("checking");
  assert.equal(remaining[0]?.nextDueDate, "2026-08-20");

  assert.equal(schedule.id, remaining[0]?.id);
});

test("a heuristic duplicate is not repaired as a generated occurrence", async () => {
  const scheduledTransactions = createScheduledHarness();

  const schedule = await createSchedule(scheduledTransactions, {
    frequency: "weekly",
    nextDueDate: "2026-08-13",
    recurrenceAnchorDate: "2026-08-13",
    payee: "Scheduled bill",
    outflow: 10,
    inflow: 0,
    attachments: [
      {
        id: "attachment-a",
        fileName: "first.txt",
        fileSize: 1,
        mimeType: "text/plain",
        contentHash: "hash-a",
        contentBase64: "QQ==",
      },
    ] as any,
  });

  let repairCalls = 0;

  const heuristicDuplicate: RegisterTransactionView = {
    id: "user-entered-transaction",
    date: "2026-08-13",
    attachmentCount: 0,
    attachments: [],
    payee: schedule.payee,
    category: schedule.category,
    inflow: schedule.inflow,
    outflow: schedule.outflow,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
    generatedFromSchedule: false,
    splitLines: schedule.splitLines ?? [],
    tagIds: [],
  };

  const gateway = {
    scheduledTransactions,
  } as unknown as BudgetPersistenceProvider;

  const result = await generateDueScheduledTransactions(gateway, {
    today: "2026-08-13",
    force: true,
    scope: "heuristic-duplicate-test",
    listAccounts: async () => [
      { id: "checking", name: "Checking" },
    ],
    hostedTransactions: {
      async listRecent() {
        return [heuristicDuplicate];
      },

      async add() {
        throw new Error("heuristic duplicate should not be materialised");
      },

      async repairExisting() {
        repairCalls += 1;
      },
    },
  });

  assert.equal(repairCalls, 0);
  assert.equal(result.createdTransactions.length, 0);
  assert.equal(result.skippedDuplicateOccurrences.length, 1);
  assert.equal(result.skippedDuplicateOccurrences[0]?.scheduledTransactionId, schedule.id);

  const remaining = await scheduledTransactions.listByAccount("checking");
  assert.equal(remaining[0]?.nextDueDate, "2026-08-20");
});
