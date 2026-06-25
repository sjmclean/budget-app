import { browserLocalStorageKeyValueStorage } from "../persistence/keyValueStoragePort";
import {
  defaultSettingsPreferences,
  readSettingsPreferences,
  type DateFormatPreference,
} from "./settingsPreferences";

export const SETTINGS_PREFERENCES_CHANGED_EVENT = "budget-app:settings-preferences-changed";

export type DisplayDateStyle = "long" | "short";

export function getStoredDateFormatPreference(): DateFormatPreference {
  try {
    return readSettingsPreferences(browserLocalStorageKeyValueStorage).general.dateFormat;
  } catch {
    return defaultSettingsPreferences.general.dateFormat;
  }
}

export function notifySettingsPreferencesChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(SETTINGS_PREFERENCES_CHANGED_EVENT));
}

export function formatDateForDisplay(
  value: string | Date,
  dateFormat: DateFormatPreference = getStoredDateFormatPreference(),
  style: DisplayDateStyle = "long",
): string {
  const date = parseDisplayDate(value);

  if (!date) {
    return typeof value === "string" ? value : "";
  }

  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  if (style === "short") {
    if (dateFormat === "MM/DD/YYYY") {
      return `${month}/${day}`;
    }

    if (dateFormat === "YYYY-MM-DD") {
      return `${year}-${month}-${day}`;
    }

    return `${day}/${month}`;
  }

  if (dateFormat === "MM/DD/YYYY") {
    return `${month}/${day}/${year}`;
  }

  if (dateFormat === "YYYY-MM-DD") {
    return `${year}-${month}-${day}`;
  }

  return `${day}/${month}/${year}`;
}

function parseDisplayDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (!value.trim()) {
    return null;
  }

  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoDate) {
    const [, year, month, day] = isoDate;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
