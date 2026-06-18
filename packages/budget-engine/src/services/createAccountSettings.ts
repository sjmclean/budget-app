import { randomUUID } from "crypto";
import { AccountSettings } from "../../../types/src/AccountSettings.js";

export function createAccountSettings(
  accountId: string,
  displayOrder = 0,
): AccountSettings {
  const now = new Date();

  return {
    id: randomUUID(),
    accountId,
    displayOrder,
    hidden: false,
    closed: false,
    startingBalanceDate: null,
    reconciliationReminder: false,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}
