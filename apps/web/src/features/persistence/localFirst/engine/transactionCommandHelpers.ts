import type { LocalBudgetRuntimeClient, TransactionWriteInput } from "../../accountRegisterQueryContracts";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import type { LocalTransactionRecord } from "../registerSchema";
import { requireCanonicalInflowSemantics } from "../../../accounts/incomeTransactionSemantics";

const READY_TO_ASSIGN_CATEGORY_ID = "__ready_to_assign__";
const BUDGET_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function normaliseIncomeBudgetMonth(input: {
  readonly categoryId: string | null;
  readonly amount: number;
  readonly transferAccountId: string | null;
  readonly transactionDate: string;
  readonly requested?: string | null;
  readonly existing?: string | null;
}): string | null {
  if (
    input.categoryId !== READY_TO_ASSIGN_CATEGORY_ID ||
    input.amount <= 0 ||
    input.transferAccountId
  ) {
    return null;
  }

  const value = input.requested ?? input.existing ?? null;
  if (value === null) return null;

  const transactionMonth = input.transactionDate.slice(0, 7);
  if (
    !BUDGET_MONTH_PATTERN.test(value) ||
    !BUDGET_MONTH_PATTERN.test(transactionMonth)
  ) {
    throw new Error("Income budget month must use YYYY-MM.");
  }
  if (value < transactionMonth) {
    throw new Error(
      `Income budget month ${value} cannot be earlier than transaction month ${transactionMonth}.`,
    );
  }
  return value;
}

function normaliseInflowMetadata(input: {
  readonly categoryId: string | null;
  readonly amount: number;
  readonly transferAccountId: string | null;
  readonly transactionDate: string;
  readonly requestedIncomeBudgetMonth?: string | null;
  readonly requestedClassification?: import("../../../accounts/incomeTransactionSemantics").InflowClassification | null;
  readonly existingIncomeBudgetMonth?: string | null;
  readonly existingClassification?: import("../../../accounts/incomeTransactionSemantics").InflowClassification | null;
}) {
  const hasRequestedCanonicalMetadata =
    input.requestedClassification !== undefined ||
    (
      input.categoryId === null &&
      input.requestedIncomeBudgetMonth !== undefined
    );
  const hasExistingCanonicalMetadata =
    input.existingClassification !== undefined &&
    input.existingClassification !== null;

  if (hasRequestedCanonicalMetadata || hasExistingCanonicalMetadata) {
    const requestedIncomeBudgetMonth =
      input.requestedIncomeBudgetMonth !== undefined
        ? input.requestedIncomeBudgetMonth
        : input.existingIncomeBudgetMonth ?? null;
    const requestedClassification =
      input.requestedClassification !== undefined
        ? input.requestedClassification
        : input.existingClassification ?? null;

    if (
      !hasRequestedCanonicalMetadata &&
      (input.amount <= 0 || input.transferAccountId)
    ) {
      return requireCanonicalInflowSemantics({
        date: input.transactionDate,
        amount: input.amount,
        categoryId: input.categoryId,
        transferAccountId: input.transferAccountId,
        incomeBudgetMonth: null,
        inflowClassification: null,
      });
    }

    return requireCanonicalInflowSemantics({
      date: input.transactionDate,
      amount: input.amount,
      categoryId: input.categoryId,
      transferAccountId: input.transferAccountId,
      incomeBudgetMonth: requestedIncomeBudgetMonth,
      inflowClassification: requestedClassification,
    });
  }

  return {
    incomeBudgetMonth: normaliseIncomeBudgetMonth({
      categoryId: input.categoryId,
      amount: input.amount,
      transferAccountId: input.transferAccountId,
      transactionDate: input.transactionDate,
      requested: input.requestedIncomeBudgetMonth,
      existing: input.existingIncomeBudgetMonth,
    }),
    inflowClassification: input.existingClassification ?? null,
  };
}

export type CreateTransactionMutation = (
  budgetId: string,
  domain: LocalBudgetMutation["domain"],
  entityId: string,
  operation: LocalBudgetMutation["operation"],
  payload: unknown,
  operationGroupId?: string,
  operationGroup?: LocalBudgetOperationGroup,
) => LocalBudgetMutation;

export async function transactionRecord(id: string, input: TransactionWriteInput, existing?: LocalTransactionRecord | null): Promise<LocalTransactionRecord> {
  const categoryId = input.categoryId ?? null;
  const transferAccountId =
    input.transferAccountId ?? existing?.transferAccountId ?? null;
  const inflowMetadata = normaliseInflowMetadata({
    categoryId,
    amount: input.amount,
    transferAccountId,
    transactionDate: input.date,
    requestedIncomeBudgetMonth: input.incomeBudgetMonth,
    requestedClassification: input.inflowClassification,
    existingIncomeBudgetMonth:
      existing?.categoryId === categoryId
        ? existing.incomeBudgetMonth
        : null,
    existingClassification:
      existing?.categoryId === categoryId
        ? existing.inflowClassification ?? null
        : null,
  });

  return {
    id, budgetId: input.budgetId, accountId: input.accountId, date: input.date, amount: input.amount,
    memo: input.memo ?? null, checkNumber: input.checkNumber ?? null,
    clearedStatus: existing?.clearedStatus ?? "uncleared", payeeId: input.payeeId ?? null,
    payeeName: input.payeeName ?? null, rawPayeeName: input.rawPayee ?? existing?.rawPayeeName ?? null,
    categoryId,
    categoryName: input.categoryName?.trim() || (existing?.categoryId === input.categoryId ? existing?.categoryName : null) || (input.transferAccountId ? "Transfer" : null),
    incomeBudgetMonth: inflowMetadata.incomeBudgetMonth,
    inflowClassification: inflowMetadata.inflowClassification,
    transferAccountId,
    transferTransactionId: existing?.transferTransactionId ?? null,
    generatedFromSchedule: input.generatedFromSchedule ?? existing?.generatedFromSchedule ?? false,
    scheduledTransactionId: input.scheduledTransactionId ?? existing?.scheduledTransactionId ?? null,
    scheduledOccurrenceDate: input.scheduledOccurrenceDate ?? existing?.scheduledOccurrenceDate ?? null,
    splitLines: (input.splitLines ?? []).map((split) => {
      const splitCategoryId = split.categoryId ?? null;
      const splitTransferAccountId = split.transferAccountId ?? null;
      const existingSplit = existing?.splitLines.find(
        (candidate) => candidate.id === split.id,
      );
      const sameSplitCategory = existingSplit?.categoryId === splitCategoryId;
      return {
        id: split.id,
        categoryId: splitCategoryId,
        categoryName: split.transferAccountId ? "Transfer" : split.categoryName?.trim() || null,
        ...normaliseInflowMetadata({
          categoryId: splitCategoryId,
          amount: split.amount,
          transferAccountId: splitTransferAccountId,
          transactionDate: input.date,
          requestedIncomeBudgetMonth: split.incomeBudgetMonth,
          requestedClassification: split.inflowClassification,
          existingIncomeBudgetMonth: sameSplitCategory
            ? existingSplit?.incomeBudgetMonth ?? null
            : null,
          existingClassification: sameSplitCategory
            ? existingSplit?.inflowClassification ?? null
            : null,
        }),
        transferAccountId: splitTransferAccountId,
        transferTransactionId: split.transferTransactionId ?? null,
        memo: split.memo ?? null,
        amount: split.amount,
      };
    }),
    tagIds: input.tagIds ?? [], importProvenance: existing?.importProvenance ?? [],
    updatedAt: new Date().toISOString(),
  };
}

export function requireMutableTransaction(transaction: LocalTransactionRecord): void {
  if (transaction.clearedStatus === "reconciled") throw new Error("Reconciled transactions are locked and cannot be changed.");
}

export async function requireTransferCounterpart(local: LocalBudgetDatabaseClient, transaction: LocalTransactionRecord): Promise<LocalTransactionRecord | null> {
  const hasAccount = Boolean(transaction.transferAccountId);
  const hasTransaction = Boolean(transaction.transferTransactionId);
  if (!hasAccount && !hasTransaction) return null;
  if (!transaction.transferAccountId || !transaction.transferTransactionId) throw new Error("The transfer linkage is incomplete. Repair the transfer before changing it.");
  const counterpart = await local.getTransaction(transaction.budgetId, transaction.transferTransactionId);
  if (!counterpart || counterpart.accountId !== transaction.transferAccountId || counterpart.transferAccountId !== transaction.accountId || counterpart.transferTransactionId !== transaction.id) {
    throw new Error("The other side of this transfer is missing or does not link back correctly.");
  }
  return counterpart;
}

export async function findReciprocalTransferCounterpartForDelete(local: LocalBudgetDatabaseClient, transaction: LocalTransactionRecord): Promise<LocalTransactionRecord | null> {
  if (!transaction.transferAccountId || !transaction.transferTransactionId) return null;
  const counterpart = await local.getTransaction(transaction.budgetId, transaction.transferTransactionId);
  return counterpart && counterpart.accountId === transaction.transferAccountId && counterpart.transferAccountId === transaction.accountId && counterpart.transferTransactionId === transaction.id ? counterpart : null;
}

async function accountParticipation(local: LocalBudgetDatabaseClient, budgetId: string, accountId: string): Promise<"on-budget" | "off-budget"> {
  const account = (await local.listAccountNavigation(budgetId)).find((candidate) => candidate.id === accountId);
  if (!account) throw new Error(`Transfer account ${accountId} was not found.`);
  return account.participation === "on-budget" ? "on-budget" : "off-budget";
}

async function applyTransferCategorySemantics(local: LocalBudgetDatabaseClient, source: LocalTransactionRecord, counterpart: LocalTransactionRecord): Promise<readonly [LocalTransactionRecord, LocalTransactionRecord]> {
  const [sourceParticipation, counterpartParticipation] = await Promise.all([
    accountParticipation(local, source.budgetId, source.accountId),
    accountParticipation(local, counterpart.budgetId, counterpart.accountId),
  ]);
  const internal = sourceParticipation === "on-budget" && counterpartParticipation === "on-budget";
  return [
    { ...source, categoryId: internal || sourceParticipation === "off-budget" ? null : source.categoryId, categoryName: internal || sourceParticipation === "off-budget" ? "Transfer" : source.categoryName },
    { ...counterpart, categoryId: internal || counterpartParticipation === "off-budget" ? null : counterpart.categoryId, categoryName: internal || counterpartParticipation === "off-budget" ? "Transfer" : counterpart.categoryName },
  ];
}

export async function buildTransferPair(local: LocalBudgetDatabaseClient, source: LocalTransactionRecord, targetAccountId: string, counterpartId = createRuntimeUuid()): Promise<readonly [LocalTransactionRecord, LocalTransactionRecord]> {
  if (targetAccountId === source.accountId) throw new Error("A transfer cannot use the same account on both sides.");
  const sourceRecord = { ...source, transferAccountId: targetAccountId, transferTransactionId: counterpartId };
  const counterpartRecord: LocalTransactionRecord = {
    ...sourceRecord, id: counterpartId, accountId: targetAccountId, amount: -sourceRecord.amount,
    clearedStatus: "uncleared", categoryId: sourceRecord.categoryId, categoryName: sourceRecord.categoryName,
    transferAccountId: sourceRecord.accountId, transferTransactionId: sourceRecord.id, importProvenance: [],
  };
  return applyTransferCategorySemantics(local, sourceRecord, counterpartRecord);
}

export async function buildNewTransactionRecords(local: LocalBudgetDatabaseClient, id: string, input: TransactionWriteInput): Promise<readonly LocalTransactionRecord[]> {
  const record = await transactionRecord(id, input);
  return input.transferAccountId ? buildTransferPair(local, record, input.transferAccountId) : [record];
}

export async function buildUpdatedTransactionRecords(local: LocalBudgetDatabaseClient, transactionId: string, input: TransactionWriteInput, existing: LocalTransactionRecord): Promise<readonly LocalTransactionRecord[]> {
  requireMutableTransaction(existing);
  const counterpart = await requireTransferCounterpart(local, existing);
  if (counterpart) requireMutableTransaction(counterpart);
  if (!counterpart) {
    const record = await transactionRecord(transactionId, input, existing);
    return input.transferAccountId ? buildTransferPair(local, record, input.transferAccountId) : [record];
  }
  if (input.accountId !== existing.accountId) throw new Error("This transfer cannot be moved by editing it. Move the transaction between accounts instead.");
  if (input.transferAccountId !== undefined && input.transferAccountId !== existing.transferAccountId) throw new Error("This transfer cannot be retargeted by editing it. Move the transaction between accounts instead.");
  const record = { ...(await transactionRecord(transactionId, input, existing)), transferAccountId: existing.transferAccountId, transferTransactionId: existing.transferTransactionId };
  const counterpartRecord = { ...counterpart, date: record.date, amount: -record.amount, memo: record.memo, checkNumber: record.checkNumber, transferAccountId: record.accountId, transferTransactionId: record.id, updatedAt: record.updatedAt };
  return applyTransferCategorySemantics(local, record, counterpartRecord);
}

export function transactionWrite(createMutation: CreateTransactionMutation, record: LocalTransactionRecord, operationGroupId?: string, operationGroup?: LocalBudgetOperationGroup) {
  return { transaction: record, mutation: createMutation(record.budgetId, "transactions", record.id, "upsert", record, operationGroupId, operationGroup) };
}

export function transactionWrites(createMutation: CreateTransactionMutation, records: readonly LocalTransactionRecord[]) {
  if (records.length === 2 && records[0].transferTransactionId === records[1].id && records[1].transferTransactionId === records[0].id) {
    const operationGroupId = createRuntimeUuid();
    const operationGroup: LocalBudgetOperationGroup = { members: records.map((record) => ({ domain: "transactions", entityId: record.id, operation: "upsert", payload: record })) };
    return records.map((record) => transactionWrite(createMutation, record, operationGroupId, operationGroup));
  }
  return records.map((record) => transactionWrite(createMutation, record));
}

export function transactionWritesAsSingleOperationGroup(createMutation: CreateTransactionMutation, records: readonly LocalTransactionRecord[]) {
  if (records.length === 0) return [];
  const operationGroupId = createRuntimeUuid();
  const operationGroup: LocalBudgetOperationGroup = { members: records.map((record) => ({ domain: "transactions", entityId: record.id, operation: "upsert", payload: record })) };
  return records.map((record) => transactionWrite(createMutation, record, operationGroupId, operationGroup));
}

export type TransactionBatchPreparationInput = Pick<
  Parameters<LocalBudgetRuntimeClient["commitImportBatch"]>[0],
  | "budgetId"
  | "accountId"
  | "additions"
  | "updates"
  | "provenanceAssignments"
>;

export async function prepareTransactionBatchWrites(
  createMutation: CreateTransactionMutation,
  local: LocalBudgetDatabaseClient,
  input: TransactionBatchPreparationInput,
): Promise<{
  readonly writes: {
    readonly transaction: LocalTransactionRecord;
    readonly mutation: LocalBudgetMutation;
  }[];
  readonly requireAbsentTransactionIds: string[];
}> {
  const writes: {
    transaction: LocalTransactionRecord;
    mutation: LocalBudgetMutation;
  }[] = [];
  const requireAbsentTransactionIds: string[] = [];
  const additionIds = new Set<string>();

  const provenanceByTransactionId = new Map<
    string,
    LocalTransactionRecord["importProvenance"][number][]
  >();

  for (const assignment of input.provenanceAssignments) {
    if (!assignment.transactionId.trim()) {
      throw new Error("Import provenance requires a transaction id.");
    }

    if (!assignment.identity.trim()) {
      throw new Error(
        `Import provenance for transaction ${assignment.transactionId} requires an identity.`,
      );
    }

    if (
      !Number.isInteger(assignment.occurrence) ||
      assignment.occurrence < 1
    ) {
      throw new Error(
        `Import provenance for transaction ${assignment.transactionId} has an invalid occurrence.`,
      );
    }

    const existingAssignments =
      provenanceByTransactionId.get(assignment.transactionId) ?? [];

    existingAssignments.push({
      fileType: assignment.fileType,
      identity: assignment.identity,
      occurrence: assignment.occurrence,
      importedAt: assignment.importedAt,
    });

    provenanceByTransactionId.set(
      assignment.transactionId,
      existingAssignments,
    );
  }

  const appendImportProvenance = (
    record: LocalTransactionRecord,
  ): LocalTransactionRecord => {
    const additions = provenanceByTransactionId.get(record.id);
    if (!additions || additions.length === 0) {
      return record;
    }

    const seen = new Set(
      record.importProvenance.map(
        (entry) =>
          `${entry.fileType}\u0000${entry.identity}\u0000${entry.occurrence}`,
      ),
    );

    const importProvenance = [...record.importProvenance];

    for (const entry of additions) {
      const key =
        `${entry.fileType}\u0000${entry.identity}\u0000${entry.occurrence}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      importProvenance.push(entry);
    }

    return {
      ...record,
      importProvenance,
    };
  };

  const provenanceAppliedTransactionIds = new Set<string>();

  for (const addition of input.additions) {
    if (additionIds.has(addition.id)) {
      throw new Error(
        `Transaction ${addition.id} appears more than once in the additions batch.`,
      );
    }

    additionIds.add(addition.id);

    const records = (
      await buildNewTransactionRecords(
        local,
        addition.id,
        addition,
      )
    ).map((record) => {
      const next = appendImportProvenance(record);

      if (next !== record) {
        provenanceAppliedTransactionIds.add(record.id);
      }

      return next;
    });

    requireAbsentTransactionIds.push(
      ...records.map((record) => record.id),
    );

    writes.push(...transactionWrites(createMutation, records));
  }

  for (const update of input.updates) {
    const existing = await local.getTransaction(
      input.budgetId,
      update.id,
    );

    if (!existing) {
      throw new Error("The local transaction was not found.");
    }

    const records = (
      await buildUpdatedTransactionRecords(
        local,
        update.id,
        update,
        existing,
      )
    ).map((record) => {
      const next = appendImportProvenance(record);

      if (next !== record) {
        provenanceAppliedTransactionIds.add(record.id);
      }

      return next;
    });

    writes.push(...transactionWrites(createMutation, records));
  }

  for (const [
    transactionId,
    assignments,
  ] of provenanceByTransactionId.entries()) {
    if (provenanceAppliedTransactionIds.has(transactionId)) {
      continue;
    }

    if (additionIds.has(transactionId)) {
      throw new Error(
        `Import provenance for new transaction ${transactionId} was not attached to its addition record.`,
      );
    }

    const existing = await local.getTransaction(
      input.budgetId,
      transactionId,
    );

    if (!existing) {
      throw new Error(
        `Import provenance targets missing transaction ${transactionId}.`,
      );
    }

    if (existing.accountId !== input.accountId) {
      throw new Error(
        `Import provenance targets transaction ${transactionId} outside the destination account.`,
      );
    }

    requireMutableTransaction(existing);

    const updated: LocalTransactionRecord =
      appendImportProvenance({
        ...existing,
        updatedAt: new Date().toISOString(),
      });

    if (
      updated.importProvenance.length ===
        existing.importProvenance.length &&
      assignments.length > 0
    ) {
      // Every requested provenance row was already represented. No write is
      // required, but the assignment is still valid and satisfied.
      provenanceAppliedTransactionIds.add(transactionId);
      continue;
    }

    provenanceAppliedTransactionIds.add(transactionId);
    writes.push(...transactionWrites(createMutation, [updated]));
  }

  for (const transactionId of provenanceByTransactionId.keys()) {
    if (!provenanceAppliedTransactionIds.has(transactionId)) {
      throw new Error(
        `Import provenance for transaction ${transactionId} was not applied.`,
      );
    }
  }

  return {
    writes,
    requireAbsentTransactionIds,
  };
}

