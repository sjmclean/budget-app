import assert from "node:assert/strict";

import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

function storage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: key => void values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

function packageEntries(scheduledFrequency = "Every 6 Weeks"): Ynab4PackageEntry[] {
  const root = "Hardening.ynab4/data";
  const budget = (accountName: string) => JSON.stringify({
    budgetMetaData: { currencyISOSymbol: "GBP" },
    accounts: [{ entityId: "account", accountName, onBudget: true }],
    masterCategories: [],
    payees: [],
    transactions: [{ entityId: "transaction", accountId: "account", date: "2026-07-01", amount: 1 }],
    scheduledTransactions: [{
      entityId: "schedule",
      accountId: "account",
      date: "2026-07-01",
      amount: -1,
      frequency: scheduledFrequency,
    }],
    monthlyBudgets: [],
  });
  return [
    { path: "Hardening.ynab4/Budget.ymeta", text: JSON.stringify({ relativeDataFolderName: "data" }) },
    { path: `${root}/devices/old`, text: JSON.stringify({ hasFullKnowledge: true, deviceGUID: "OLD", knowledge: "a-2,b-3" }) },
    { path: `${root}/devices/new`, text: JSON.stringify({ hasFullKnowledge: true, deviceGUID: "NEW", knowledge: "a-5,b-9" }) },
    { path: `${root}/OLD/Budget.yfull`, text: budget("Stale account") },
    { path: `${root}/NEW/Budget.yfull`, text: budget("Current account") },
  ];
}

function testLatestCompleteDeviceCurrencyAndCustomSchedule(): void {
  const entries = packageEntries();
  const discovery = discoverYnab4Package(entries);
  assert.equal(discovery.budgetDataPath, "Hardening.ynab4/data/NEW/Budget.yfull");
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  const target = storage();
  const result = createYnab4LauncherBudgetImport(target, { discovery, preview, entries });

  assert.equal(result.budget.currency, "GBP");
  const accounts = JSON.parse(target.getItem(`budget-app.budgets.${result.budget.id}.budget-app.accounts.v1`)!);
  assert.equal(accounts[0].name, "Current account");
  const registers = JSON.parse(target.getItem(`budget-app.budgets.${result.budget.id}.budget-app.account-registers.v1`)!);
  assert.equal(registers[accounts[0].id].currencyCode, "GBP");
  const schedules = JSON.parse(target.getItem(`budget-app.budgets.${result.budget.id}.budget-app.scheduled-transactions.v1`)!);
  assert.equal(schedules[0].frequency, "custom");
  assert.equal(schedules[0].recurrenceInterval, 6);
  assert.equal(schedules[0].recurrenceUnit, "week");
}

function testUnsupportedScheduleDoesNotSilentlyBecomeMonthly(): void {
  const entries = packageEntries("Twice a Month");
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  assert.throws(
    () => createYnab4LauncherBudgetImport(storage(), { discovery, preview, entries }),
    /Unsupported YNAB4 scheduled frequency: Twice a Month/,
  );
}


function testLocaleCurrencyFallback(): void {
  const entries = packageEntries().map(entry => {
    if (!entry.path.endsWith("/Budget.yfull")) return entry;
    const data = JSON.parse(entry.text ?? "{}");
    data.budgetMetaData = {
      currencyISOSymbol: null,
      currencyLocale: "en_AU",
      dateLocale: "en_AU",
    };
    return { ...entry, text: JSON.stringify(data) };
  });
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  const result = createYnab4LauncherBudgetImport(storage(), { discovery, preview, entries });

  assert.equal(result.budget.currency, "AUD");
  assert.equal(
    result.record.warnings.some(warning => warning.includes("currency metadata")),
    false,
  );
}

testLatestCompleteDeviceCurrencyAndCustomSchedule();
testUnsupportedScheduleDoesNotSilentlyBecomeMonthly();
testLocaleCurrencyFallback();
console.log("v3.23.6 YNAB4 import hardening passed");
