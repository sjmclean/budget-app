export interface FutureBudgetCommitment {
  readonly month: string;
  readonly assigned: number;
}

export interface FutureReadyToAssignPlan {
  readonly planningReadyToAssign: number;
  readonly futureAssigned: number;
  readonly futureOvercommitment: number;
}

/**
 * Future assignments reserve money that is already available in the selected
 * month. Later-dated income never flows backward into this calculation.
 *
 * A future shortfall is reported separately instead of turning an otherwise
 * balanced selected month into an unexplained negative Ready to Assign value.
 */
export function resolveFutureReadyToAssignPlan(
  readyToAssign: number,
  commitments: readonly FutureBudgetCommitment[],
): FutureReadyToAssignPlan {
  const futureAssigned = Math.max(
    0,
    commitments.reduce((total, commitment) => total + commitment.assigned, 0),
  );
  const availableToReserve = Math.max(0, readyToAssign);
  const futureOvercommitment = Math.max(0, futureAssigned - availableToReserve);
  const planningReadyToAssign = readyToAssign < 0
    ? readyToAssign
    : Math.max(0, readyToAssign - futureAssigned);

  return {
    planningReadyToAssign,
    futureAssigned,
    futureOvercommitment,
  };
}
