import { createCategory } from "./createCategory.js";

export function createCreditCardPaymentCategory(
  groupId: string,
  creditCardName: string,
  sortOrder = 0,
) {
  return createCategory(groupId, `Payment: ${creditCardName}`, sortOrder);
}
