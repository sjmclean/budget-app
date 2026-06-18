import { randomUUID } from "crypto";
import { BudgetSettings } from "../../../types/src/BudgetSettings.js";

export function createBudgetSettings(
  budgetId: string,
  currency = "AUD",
  currencySymbol = "$",
): BudgetSettings {
  const now = new Date();

  return {
    id: randomUUID(),
    budgetId,
    currency,
    currencySymbol,
    decimalPlaces: 2,
    monthFormat: "MMMM yyyy",
    startMonth: null,
    maxFutureMonths: 12,
    backupLimit: 10,
    autoBackupOnClose: true,
    autoBackupBeforeImport: true,
    autoBackupBeforeRestore: true,
    autoBackupBeforeMigration: true,
    attachmentFolderName: "attachments",
    cloudStorageSettingId: null,
    createdAt: now,
    updatedAt: now,
  };
}
