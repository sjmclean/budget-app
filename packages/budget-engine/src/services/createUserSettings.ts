import { randomUUID } from "crypto";
import { UserSettings } from "../../../types/src/UserSettings.js";
import { DateFormat } from "../../../types/src/DateFormat.js";
import { LanguageCode } from "../../../types/src/LanguageCode.js";
import { NumberFormat } from "../../../types/src/NumberFormat.js";
import { ThemeMode } from "../../../types/src/ThemeMode.js";

export function createUserSettings(
  userId: string,
  currency = "AUD"
): UserSettings {
  const now = new Date();

  return {
    id: randomUUID(),
    userId,
    defaultBudgetId: null,
    theme: ThemeMode.System,
    language: LanguageCode.EnglishAustralia,
    dateFormat: DateFormat.DD_MM_YYYY,
    numberFormat: NumberFormat.EnAU,
    currency,
    firstDayOfWeek: 1,
    privacyMode: false,
    sidebarCollapsed: false,
    createdAt: now,
    updatedAt: now
  };
}
