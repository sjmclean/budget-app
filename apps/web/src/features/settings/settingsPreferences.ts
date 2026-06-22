import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

export const SETTINGS_STORAGE_KEY = "budget-app.settings.v1";

export type DateFormatPreference = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
export type NumberFormatPreference = "1,234.56" | "1.234,56" | "1 234,56";
export type FirstDayOfWeekPreference = "monday" | "sunday" | "saturday";

export interface GeneralSettingsPreference {
  theme: "system" | "light" | "dark";
  dateFormat: DateFormatPreference;
  numberFormat: NumberFormatPreference;
  firstDayOfWeek: FirstDayOfWeekPreference;
  language: string;
}

export interface BudgetSettingsPreference {
  budgetName: string;
  currencyCode: string;
  currencySymbol: string;
  decimalPlaces: number;
  futureMonthLimit: number;
}

export interface SettingsPreferences {
  general: GeneralSettingsPreference;
  budget: BudgetSettingsPreference;
}

export const defaultSettingsPreferences: SettingsPreferences = {
  general: {
    theme: "system",
    dateFormat: "DD/MM/YYYY",
    numberFormat: "1,234.56",
    firstDayOfWeek: "monday",
    language: "English",
  },
  budget: {
    budgetName: "Household Budget",
    currencyCode: "AUD",
    currencySymbol: "$",
    decimalPlaces: 2,
    futureMonthLimit: 3,
  },
};

export const currencyOptions = [
  { code: "AUD", label: "AUD — Australian Dollar", symbol: "$" },
  { code: "NZD", label: "NZD — New Zealand Dollar", symbol: "$" },
  { code: "USD", label: "USD — US Dollar", symbol: "$" },
  { code: "GBP", label: "GBP — British Pound", symbol: "£" },
  { code: "EUR", label: "EUR — Euro", symbol: "€" },
] as const;

export const currencySymbolOptions = [
  { symbol: "$", label: "$ — Dollar ($)" },
  { symbol: "£", label: "£ — Pound (£)" },
  { symbol: "€", label: "€ — Euro (€)" },
  { symbol: "¥", label: "¥ — Yen/Yuan (¥)" },
  { symbol: "₹", label: "₹ — Rupee (₹)" },
  { symbol: "₩", label: "₩ — Won (₩)" },
  { symbol: "₿", label: "₿ — Bitcoin (₿)" },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalisePreferences(value: unknown): SettingsPreferences {
  const root = isRecord(value) ? value : {};
  const general = isRecord(root.general) ? root.general : {};
  const budget = isRecord(root.budget) ? root.budget : {};
  const defaults = defaultSettingsPreferences;

  return {
    general: {
      theme: ["system", "light", "dark"].includes(readString(general.theme, defaults.general.theme))
        ? (readString(general.theme, defaults.general.theme) as GeneralSettingsPreference["theme"])
        : defaults.general.theme,
      dateFormat: ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].includes(readString(general.dateFormat, defaults.general.dateFormat))
        ? (readString(general.dateFormat, defaults.general.dateFormat) as DateFormatPreference)
        : defaults.general.dateFormat,
      numberFormat: ["1,234.56", "1.234,56", "1 234,56"].includes(readString(general.numberFormat, defaults.general.numberFormat))
        ? (readString(general.numberFormat, defaults.general.numberFormat) as NumberFormatPreference)
        : defaults.general.numberFormat,
      firstDayOfWeek: ["monday", "sunday", "saturday"].includes(readString(general.firstDayOfWeek, defaults.general.firstDayOfWeek))
        ? (readString(general.firstDayOfWeek, defaults.general.firstDayOfWeek) as FirstDayOfWeekPreference)
        : defaults.general.firstDayOfWeek,
      language: readString(general.language, defaults.general.language),
    },
    budget: {
      budgetName: readString(budget.budgetName, defaults.budget.budgetName),
      currencyCode: readString(budget.currencyCode, defaults.budget.currencyCode).toUpperCase(),
      currencySymbol: readString(budget.currencySymbol, defaults.budget.currencySymbol),
      decimalPlaces: Math.max(0, Math.min(4, Math.round(readNumber(budget.decimalPlaces, defaults.budget.decimalPlaces)))),
      futureMonthLimit: Math.max(1, Math.min(12, Math.round(readNumber(budget.futureMonthLimit, defaults.budget.futureMonthLimit)))),
    },
  };
}

export function readSettingsPreferences(storage: KeyValueStoragePort): SettingsPreferences {
  const raw = storage.getItem(SETTINGS_STORAGE_KEY);

  if (!raw) {
    return defaultSettingsPreferences;
  }

  try {
    return normalisePreferences(JSON.parse(raw));
  } catch {
    return defaultSettingsPreferences;
  }
}

export function writeSettingsPreferences(
  storage: KeyValueStoragePort,
  preferences: SettingsPreferences,
): SettingsPreferences {
  const normalised = normalisePreferences(preferences);
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalised));
  return normalised;
}

export function updateSettingsPreferences(
  storage: KeyValueStoragePort,
  updater: (current: SettingsPreferences) => SettingsPreferences,
): SettingsPreferences {
  return writeSettingsPreferences(storage, updater(readSettingsPreferences(storage)));
}

export function getCurrencySymbol(currencyCode: string): string {
  return currencyOptions.find((option) => option.code === currencyCode)?.symbol ?? "$";
}
