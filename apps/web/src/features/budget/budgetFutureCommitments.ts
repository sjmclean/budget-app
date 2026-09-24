export interface FutureBudgetCommitment {
  readonly month: string;
  readonly assigned: number;
  readonly income?: number;
}

export interface FutureReadyToAssignPlan {
  readonly planningReadyToAssign: number;
  readonly futureAssigned: number;
  readonly futureOvercommitment: number;
}

/**
 * Future assignments reserve only the selected month's money that is actually
 * needed to keep every later month funded. Income arriving in a later month
 * may fund that month and months after it, but can never repair an earlier
 * shortfall.
 */
export function resolveFutureReadyToAssignPlan(
  readyToAssign: number,
  commitments: readonly FutureBudgetCommitment[],
): FutureReadyToAssignPlan {
  const ordered = [...commitments].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
  const futureAssigned = Math.max(
    0,
    ordered.reduce((total, commitment) => total + commitment.assigned, 0),
  );

  let cumulativeFundingRequirement = 0;
  let requiredFromSelectedMonth = 0;
  for (const commitment of ordered) {
    cumulativeFundingRequirement +=
      commitment.assigned - (commitment.income ?? 0);
    requiredFromSelectedMonth = Math.max(
      requiredFromSelectedMonth,
      cumulativeFundingRequirement,
    );
  }
  requiredFromSelectedMonth = Math.max(0, requiredFromSelectedMonth);

  const availableToReserve = Math.max(0, readyToAssign);
  const futureOvercommitment = Math.max(
    0,
    requiredFromSelectedMonth - availableToReserve,
  );
  const planningReadyToAssign = readyToAssign < 0
    ? readyToAssign
    : Math.max(0, readyToAssign - requiredFromSelectedMonth);

  return {
    planningReadyToAssign,
    futureAssigned,
    futureOvercommitment,
  };
}
