export function validateAssignment(readyToAssign: number, amount: number): void {
  if (amount > readyToAssign) throw new Error("Insufficient Ready to Assign");
}
