import { validateAssignment } from "../validators/validateAssignment.js";

export function assignMoney(readyToAssign: number, amount: number): number {
  validateAssignment(readyToAssign, amount);
  return readyToAssign - amount;
}
