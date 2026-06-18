export function validateSplitTransaction(
  parentAmount: number,
  lineAmounts: number[],
): void {
  const total = lineAmounts.reduce((sum, amount) => sum + amount, 0);

  if (total !== parentAmount) {
    throw new Error(
      `Split line total ${total} does not equal parent transaction amount ${parentAmount}`,
    );
  }
}
