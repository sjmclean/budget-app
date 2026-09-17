import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import type {
  LocalBudgetMutation,
  LocalBudgetOperationGroup,
  LocalFirstStoredConflict,
} from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { persistenceScopeForMutations } from "../mutationEvents";
import type {
  LocalAccountRecord,
  LocalPayeeRecord,
  LocalTransactionAttachmentMutationPayload,
  LocalTransactionRecord,
} from "../registerSchema";

type CreateMutation = (
  budgetId: string,
  domain: LocalBudgetMutation["domain"],
  entityId: string,
  operation: LocalBudgetMutation["operation"],
  payload: unknown,
  operationGroupId?: string,
  operationGroup?: LocalBudgetOperationGroup,
) => LocalBudgetMutation;

export interface ConflictCommandDependencies {
  readonly synchronise: (budgetId: string) => Promise<void>;
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: CreateMutation;
  readonly recordCommittedChange: (
    budgetId: string,
    change: Omit<PersistenceChangeScope, "budgetId">,
  ) => void;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function memberKey(input: { domain: string; entityId: string }): string {
  return `${input.domain}:${input.entityId}`;
}

function groupedConflictsByMember(
  selected: LocalBudgetMutation,
  operationGroupId: string,
  operationGroup: LocalBudgetOperationGroup,
  unresolvedConflicts: readonly LocalFirstStoredConflict[],
): Map<string, LocalFirstStoredConflict> {
  const operationGroupJson = JSON.stringify(operationGroup);
  const result = new Map<string, LocalFirstStoredConflict>();
  for (const conflict of unresolvedConflicts) {
    const losing = conflict.losingMutation;
    if (losing.operationGroupId !== operationGroupId) continue;
    const member = operationGroup.members.find(
      (candidate) =>
        candidate.domain === losing.domain &&
        candidate.entityId === losing.entityId &&
        candidate.operation === losing.operation,
    );
    const key = member ? memberKey(member) : "";
    if (
      !member ||
      losing.budgetId !== selected.budgetId ||
      losing.syncEpoch !== selected.syncEpoch ||
      losing.deviceId !== selected.deviceId ||
      !losing.operationGroup ||
      JSON.stringify(losing.operationGroup) !== operationGroupJson ||
      result.has(key)
    ) {
      throw new Error(
        "Grouped conflicts do not describe one consistent local operation.",
      );
    }
    result.set(key, conflict);
  }
  return result;
}

async function replayGroupedTransferConflicts(
  local: LocalBudgetDatabaseClient,
  selectedConflict: LocalFirstStoredConflict,
  unresolvedConflicts: readonly LocalFirstStoredConflict[],
  createMutation: CreateMutation,
): Promise<readonly LocalBudgetMutation[]> {
  const selected = selectedConflict.losingMutation;
  const operationGroupId = selected.operationGroupId;
  const operationGroup = selected.operationGroup;
  if (!operationGroupId || !operationGroup) {
    throw new Error(
      "This transfer conflict cannot be kept locally because it predates atomic transfer conflict grouping.",
    );
  }
  if (operationGroup.members.length !== 2) {
    throw new Error(
      "A complete transfer operation snapshot is required before keep-local can replay this operation.",
    );
  }
  const [first, second] = operationGroup.members;
  if (
    first.entityId === second.entityId ||
    first.domain !== "transactions" ||
    second.domain !== "transactions" ||
    first.operation !== second.operation ||
    selected.domain !== "transactions" ||
    selected.operation !== first.operation ||
    !operationGroup.members.some(
      (member) =>
        member.entityId === selected.entityId &&
        member.domain === selected.domain &&
        member.operation === selected.operation,
    )
  ) {
    throw new Error("The grouped transfer operation snapshot is inconsistent.");
  }

  const conflictByMember = groupedConflictsByMember(
    selected,
    operationGroupId,
    operationGroup,
    unresolvedConflicts,
  );
  if (!conflictByMember.has(memberKey(selected))) {
    throw new Error(
      "The selected transfer conflict is not part of its stored logical operation.",
    );
  }

  const replayOperationGroupId = createRuntimeUuid();
  const replayMutations = operationGroup.members.map((member) =>
    createMutation(
      selected.budgetId,
      member.domain,
      member.entityId,
      member.operation,
      member.payload,
      replayOperationGroupId,
      operationGroup,
    ));

  if (first.operation === "upsert") {
    const firstTransaction = first.payload as LocalTransactionRecord;
    const secondTransaction = second.payload as LocalTransactionRecord;
    if (
      firstTransaction.id !== first.entityId ||
      secondTransaction.id !== second.entityId ||
      firstTransaction.budgetId !== selected.budgetId ||
      secondTransaction.budgetId !== selected.budgetId ||
      firstTransaction.accountId === secondTransaction.accountId ||
      firstTransaction.transferTransactionId !== second.entityId ||
      secondTransaction.transferTransactionId !== first.entityId ||
      firstTransaction.transferAccountId !== secondTransaction.accountId ||
      secondTransaction.transferAccountId !== firstTransaction.accountId ||
      firstTransaction.amount !== -secondTransaction.amount
    ) {
      throw new Error(
        "The grouped transfer conflict pair has invalid reciprocal transfer data.",
      );
    }
    await local.writeTransactionBatch(
      operationGroup.members.map((member, index) => ({
        transaction: member.payload as LocalTransactionRecord,
        mutation: replayMutations[index]!,
        resolveConflictId: conflictByMember.get(memberKey(member))?.conflictId,
      })),
    );
    return replayMutations;
  }

  const firstDelete = first.payload as {
    accountId?: string;
    amount?: number;
    transferAccountId?: string | null;
    transferTransactionId?: string | null;
  } | null;
  const secondDelete = second.payload as typeof firstDelete;
  if (
    !firstDelete ||
    !secondDelete ||
    typeof firstDelete.accountId !== "string" ||
    typeof secondDelete.accountId !== "string" ||
    typeof firstDelete.amount !== "number" ||
    typeof secondDelete.amount !== "number" ||
    firstDelete.accountId === secondDelete.accountId ||
    firstDelete.transferTransactionId !== second.entityId ||
    secondDelete.transferTransactionId !== first.entityId ||
    firstDelete.transferAccountId !== secondDelete.accountId ||
    secondDelete.transferAccountId !== firstDelete.accountId ||
    firstDelete.amount !== -secondDelete.amount
  ) {
    throw new Error(
      "The grouped transfer delete conflict pair lacks a valid reciprocal financial snapshot.",
    );
  }
  await local.deleteTransactionBatch(
    operationGroup.members.map((member, index) => ({
      transactionId: member.entityId,
      mutation: replayMutations[index]!,
      resolveConflictId: conflictByMember.get(memberKey(member))?.conflictId,
    })),
  );
  return replayMutations;
}

async function replayGroupedCategoryMergeConflicts(
  local: LocalBudgetDatabaseClient,
  selectedConflict: LocalFirstStoredConflict,
  unresolvedConflicts: readonly LocalFirstStoredConflict[],
  createMutation: CreateMutation,
): Promise<readonly LocalBudgetMutation[]> {
  const selected = selectedConflict.losingMutation;
  const operationGroupId = selected.operationGroupId;
  const operationGroup = selected.operationGroup;
  if (!operationGroupId || !operationGroup || operationGroup.members.length !== 2) {
    throw new Error("A complete category-merge operation snapshot is required for keep-local replay.");
  }
  const categoryMember = operationGroup.members.find(
    (member) => member.domain === "categories" && member.operation === "delete",
  );
  const budgetMonthMember = operationGroup.members.find(
    (member) => member.domain === "budgetMonths" && member.operation === "upsert",
  );
  if (
    !categoryMember ||
    !budgetMonthMember ||
    !operationGroup.members.some(
      (member) =>
        member.domain === selected.domain &&
        member.entityId === selected.entityId &&
        member.operation === selected.operation,
    )
  ) {
    throw new Error("The grouped category-merge operation snapshot is inconsistent.");
  }
  const target = categoryMember.payload as {
    targetCategoryId?: string;
    targetCategoryName?: string;
  };
  if (!target.targetCategoryId) {
    throw new Error("The grouped category-merge target is missing.");
  }
  const conflictByMember = groupedConflictsByMember(
    selected,
    operationGroupId,
    operationGroup,
    unresolvedConflicts,
  );
  if (!conflictByMember.has(memberKey(selected))) {
    throw new Error(
      "The selected category-merge conflict is not part of its stored logical operation.",
    );
  }
  const replayOperationGroupId = createRuntimeUuid();
  const replayGroup: LocalBudgetOperationGroup = {
    members: operationGroup.members,
  };
  const categoryMutation = createMutation(
    selected.budgetId,
    categoryMember.domain,
    categoryMember.entityId,
    categoryMember.operation,
    categoryMember.payload,
    replayOperationGroupId,
    replayGroup,
  );
  const budgetMonthMutation = createMutation(
    selected.budgetId,
    budgetMonthMember.domain,
    budgetMonthMember.entityId,
    budgetMonthMember.operation,
    budgetMonthMember.payload,
    replayOperationGroupId,
    replayGroup,
  );
  await local.mergeCategories({
    budgetId: selected.budgetId,
    sourceCategoryId: categoryMember.entityId,
    targetCategoryId: target.targetCategoryId,
    targetCategoryName: target.targetCategoryName ?? "",
    mutation: categoryMutation,
    budgetMonthMutation,
    resolveConflictId: conflictByMember.get(memberKey(categoryMember))?.conflictId,
    budgetMonthResolveConflictId:
      conflictByMember.get(memberKey(budgetMonthMember))?.conflictId,
  });
  return [categoryMutation, budgetMonthMutation];
}

async function replayConflictMutation(
  local: LocalBudgetDatabaseClient,
  original: LocalBudgetMutation,
  conflictId: string,
  createMutation: CreateMutation,
): Promise<readonly LocalBudgetMutation[]> {
  const replay = createMutation(
    original.budgetId,
    original.domain,
    original.entityId,
    original.operation,
    original.payload,
  );
  if (
    original.domain === "transactions" &&
    original.entityId.startsWith("attachment:")
  ) {
    const payload = original.payload as LocalTransactionAttachmentMutationPayload;
    if (original.operation === "delete") {
      await local.deleteTransactionAttachment(payload.attachment.id, replay, conflictId);
    } else {
      if (!payload.contentBase64) throw new Error("Attachment conflict content is missing.");
      await local.writeTransactionAttachment(
        payload.attachment,
        decodeBase64(payload.contentBase64),
        replay,
        conflictId,
      );
    }
    return [replay];
  }
  if (original.domain === "transactions") {
    if (original.operation === "delete") {
      const payload = original.payload as {
        transferAccountId?: string | null;
        transferTransactionId?: string | null;
      } | null;
      if (payload?.transferAccountId || payload?.transferTransactionId) {
        throw new Error(
          "This transfer conflict cannot be kept locally one side at a time. Accept the remote version or resolve the transfer pair together.",
        );
      }
      await local.deleteTransaction(original.entityId, replay, conflictId);
    } else {
      const transaction = original.payload as LocalTransactionRecord;
      if (transaction.transferAccountId || transaction.transferTransactionId) {
        throw new Error(
          "This transfer conflict cannot be kept locally one side at a time. Accept the remote version or resolve the transfer pair together.",
        );
      }
      await local.writeTransaction(transaction, replay, conflictId);
    }
    return [replay];
  }
  if (original.domain === "accounts") {
    if (original.operation === "delete") {
      await local.deleteAccount(original.budgetId, original.entityId, replay, conflictId);
    } else {
      await local.writeAccount(original.payload as LocalAccountRecord, replay, conflictId);
    }
    return [replay];
  }
  if (original.domain === "payees" && original.operation === "upsert") {
    await local.writePayee(original.payload as LocalPayeeRecord, replay, conflictId);
    return [replay];
  }
  if (original.domain === "payees" && original.operation === "delete") {
    const target = original.payload as {
      targetPayeeId?: string;
      targetPayeeName?: string;
      sourcePayeeIds?: readonly string[];
    };
    if (target.targetPayeeId) {
      await local.mergePayees({
        budgetId: original.budgetId,
        sourcePayeeId: original.entityId,
        sourcePayeeIds: target.sourcePayeeIds,
        targetPayeeId: target.targetPayeeId,
        targetPayeeName: target.targetPayeeName ?? "",
        mutation: replay,
        resolveConflictId: conflictId,
      });
      return [replay];
    }
  }
  if (original.domain === "categories" && original.operation === "delete") {
    const target = original.payload as {
      targetCategoryId?: string;
      targetCategoryName?: string;
    };
    if (target.targetCategoryId) {
      await local.mergeCategories({
        budgetId: original.budgetId,
        sourceCategoryId: original.entityId,
        targetCategoryId: target.targetCategoryId,
        targetCategoryName: target.targetCategoryName ?? "",
        mutation: replay,
        resolveConflictId: conflictId,
      });
      return [replay];
    }
  }
  await local.mutate(replay, conflictId);
  return [replay];
}

export function createConflictCommands(dependencies: ConflictCommandDependencies) {
  return {
    async resolveSyncConflict(
      budgetId: string,
      conflictId: string,
      resolution: "keep-local" | "accept-remote",
    ): Promise<void> {
      await dependencies.synchronise(budgetId);
      const local = await dependencies.requireDatabase(budgetId);
      const unresolvedConflicts = await local.listSyncConflicts("unresolved", 500);
      const conflict = unresolvedConflicts.find((value) => value.conflictId === conflictId);
      if (!conflict) throw new Error("The synchronization conflict was not found.");
      if (resolution !== "keep-local") {
        await local.resolveSyncConflict(conflictId, resolution);
        return;
      }

      const losing = conflict.losingMutation;
      const group = losing.operationGroup;
      const isGroupedCategoryMerge = Boolean(
        losing.operationGroupId &&
        group?.members.some((member) =>
          member.domain === "categories" && member.operation === "delete") &&
        group?.members.some((member) =>
          member.domain === "budgetMonths" && member.operation === "upsert"),
      );
      const transferPayload =
        losing.domain === "transactions" &&
        !losing.entityId.startsWith("attachment:")
          ? losing.payload as {
              transferAccountId?: string | null;
              transferTransactionId?: string | null;
            } | null
          : null;
      const isLinkedTransfer = Boolean(
        transferPayload?.transferAccountId || transferPayload?.transferTransactionId,
      );

      const replayed = isGroupedCategoryMerge
        ? await replayGroupedCategoryMergeConflicts(
            local,
            conflict,
            unresolvedConflicts,
            dependencies.createMutation,
          )
        : isLinkedTransfer && losing.operationGroupId
          ? await replayGroupedTransferConflicts(
              local,
              conflict,
              unresolvedConflicts,
              dependencies.createMutation,
            )
          : await replayConflictMutation(
              local,
              losing,
              conflictId,
              dependencies.createMutation,
            );

      await dependencies.synchronise(budgetId);
      dependencies.recordCommittedChange(
        budgetId,
        persistenceScopeForMutations(budgetId, replayed),
      );
    },
  };
}
