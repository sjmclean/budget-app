import { validateAssignment } from "../validators/validateAssignment.js";

export function assignMoney(readyToBudget: number, amount: number): number {
  validateAssignment(readyToBudget, amount);
  return readyToBudget - amount;
}
