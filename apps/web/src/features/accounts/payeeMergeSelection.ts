export type PayeeMergeSelection = {
  targetPayeeId: string;
  sourcePayeeIds: string[];
};

export type PayeeMergeCandidate = {
  readonly id: string;
  readonly name: string;
};

export function filterPayeeMergeCandidates<T extends PayeeMergeCandidate>(
  payees: readonly T[],
  targetPayeeId: string,
  search: string,
): T[] {
  const query = search.trim().toLocaleLowerCase();
  return payees.filter((payee) =>
    payee.id !== targetPayeeId &&
    payee.name.toLocaleLowerCase().includes(query),
  );
}

export function createPayeeMergeSelection(
  participantPayeeIds: readonly string[],
  targetPayeeId: string,
): PayeeMergeSelection {
  const uniqueParticipantIds = Array.from(new Set(participantPayeeIds));

  return {
    targetPayeeId,
    sourcePayeeIds: uniqueParticipantIds.filter((id) => id !== targetPayeeId),
  };
}

export function switchPayeeMergeTarget(
  sourcePayeeIds: readonly string[],
  currentTargetPayeeId: string,
  nextTargetPayeeId: string,
): PayeeMergeSelection {
  if (currentTargetPayeeId === nextTargetPayeeId) {
    return {
      targetPayeeId: nextTargetPayeeId,
      sourcePayeeIds: Array.from(
        new Set(sourcePayeeIds.filter((id) => id !== nextTargetPayeeId)),
      ),
    };
  }

  return {
    targetPayeeId: nextTargetPayeeId,
    sourcePayeeIds: Array.from(
      new Set([
        ...sourcePayeeIds.filter((id) => id !== nextTargetPayeeId),
        currentTargetPayeeId,
      ].filter((id) => id && id !== nextTargetPayeeId)),
    ),
  };
}

export function getPayeeMergeParticipantIds(
  sourcePayeeIds: readonly string[],
  targetPayeeId: string,
): string[] {
  return Array.from(
    new Set([targetPayeeId, ...sourcePayeeIds].filter(Boolean)),
  );
}
