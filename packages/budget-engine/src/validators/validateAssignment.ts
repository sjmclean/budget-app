export function validateAssignment(readyToBudget: number, amount: number): void {
  if (amount > readyToBudget) throw new Error("Insufficient Ready To Budget");
}
