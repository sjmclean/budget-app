export type Ynab4MonthlyBudgetMappingStatus =
  | "ready"
  | "needs-mapping"
  | "missing"
  | "blocked";

export type Ynab4MonthlyBudgetMappingItem = {
  ynab4Area: string;
  destination: string;
  status: Ynab4MonthlyBudgetMappingStatus;
  count: number;
  sampleFields: string[];
  notes: string[];
};

export type Ynab4MonthlyBudgetMappingAudit = {
  isYnab4Package: boolean;
  budgetName: string | null;
  budgetDataPath: string | null;
  monthCount: number;
  categoryMonthCount: number;
  earliestMonth: string | null;
  latestMonth: string | null;
  items: Ynab4MonthlyBudgetMappingItem[];
  blockers: string[];
  warnings: string[];
};

export type Ynab4MonthlyBudgetPackageEntry = {
  path: string;
  text?: string;
  parsedData?: Record<string, unknown>;
};

type Ynab4PackageMetadata = {
  relativeDataFolderName?: unknown;
};

export function auditYnab4MonthlyBudgetMapping(
  entries: Ynab4MonthlyBudgetPackageEntry[],
): Ynab4MonthlyBudgetMappingAudit {
  const { data, budgetName, budgetDataPath, warnings } = readActiveBudgetData(entries);

  if (!data) {
    return {
      isYnab4Package: false,
      budgetName,
      budgetDataPath,
      monthCount: 0,
      categoryMonthCount: 0,
      earliestMonth: null,
      latestMonth: null,
      items: [],
      blockers: ["Could not read active YNAB4 budget data."],
      warnings,
    };
  }

  const monthlyBudgets = toRecords(data.monthlyBudgets);
  const categoryMonthRows = monthlyBudgets.flatMap((month) =>
    getMonthlySubCategoryBudgets(month),
  );
  const monthValues = monthlyBudgets
    .map((month) => firstString(month.month, month.monthName, month.date, month.budgetMonth))
    .filter((value): value is string => Boolean(value))
    .sort();
  const monthFieldNames = collectSampleFields(monthlyBudgets);
  const categoryMonthFieldNames = collectSampleFields(categoryMonthRows);
  const hasAssignedLikeField = categoryMonthRows.some((row) =>
    hasAnyField(row, ["budgeted", "budgetedAmount", "assigned", "amountBudgeted"]),
  );
  const hasActivityLikeField = categoryMonthRows.some((row) =>
    hasAnyField(row, ["activity", "outflows", "inflows", "cashOutflows", "cashInflows"]),
  );
  const hasAvailableLikeField = categoryMonthRows.some((row) =>
    hasAnyField(row, ["available", "balance", "endingBalance", "categoryBalance"]),
  );
  const hasPreviousAvailableLikeField = categoryMonthRows.some((row) =>
    hasAnyField(row, ["previousAvailable", "startingBalance", "beginningBalance", "carryover"]),
  );
  const hasIncomeLikeField = monthlyBudgets.some((row) =>
    hasAnyField(row, ["income", "incomeForMonth", "incomeForNextMonth", "budgetedIncome"]),
  );

  const items: Ynab4MonthlyBudgetMappingItem[] = [
    {
      ynab4Area: "monthlyBudgets",
      destination: "budget_months",
      status: monthlyBudgets.length > 0 ? "needs-mapping" : "missing",
      count: monthlyBudgets.length,
      sampleFields: monthFieldNames,
      notes: [
        "Each YNAB4 monthly budget should map to one budget_month row.",
        "Month identity, income, assigned totals, activity, and ready-to-budget semantics must be proven before import writes.",
        hasIncomeLikeField
          ? "Income-like fields are present and need explicit mapping."
          : "No obvious income field was detected in the sampled monthly budget rows; income may need to be derived from transactions or another structure.",
      ],
    },
    {
      ynab4Area: "monthlySubCategoryBudgets",
      destination: "category_months",
      status: categoryMonthRows.length > 0 ? "needs-mapping" : "missing",
      count: categoryMonthRows.length,
      sampleFields: categoryMonthFieldNames,
      notes: [
        "Each YNAB4 monthly subcategory budget should map to one category_month row.",
        hasAssignedLikeField
          ? "Assigned/budgeted-like fields are present and need milliunit normalization."
          : "No obvious assigned/budgeted field detected in sampled rows.",
        hasActivityLikeField
          ? "Activity-like fields are present and need sign/meaning validation."
          : "No obvious activity field detected in sampled rows; activity may be recomputed from transactions.",
        hasAvailableLikeField
          ? "Available/balance-like fields are present and should be used for validation, not blindly trusted."
          : "No obvious available/balance field detected in sampled rows; available may need to be calculated.",
      ],
    },
    {
      ynab4Area: "previous-available/carry-forward",
      destination: "category_months.previous_available",
      status: hasPreviousAvailableLikeField ? "needs-mapping" : "blocked",
      count: categoryMonthRows.length,
      sampleFields: categoryMonthFieldNames,
      notes: [
        "The app has previous_available, but YNAB4 carry-forward semantics must be proven across month boundaries.",
        hasPreviousAvailableLikeField
          ? "A previous/carry-forward-like field exists in sampled rows."
          : "No direct previous/carry-forward field was found in sampled rows; it may need to be derived from prior month available values.",
      ],
    },
    {
      ynab4Area: "overspending-and-ready-to-budget",
      destination: "budget_months.ready_to_budget and category_months.available",
      status: "blocked",
      count: monthlyBudgets.length,
      sampleFields: monthFieldNames,
      notes: [
        "YNAB4 overspending and Income for Month/Next Month behaviour must be reconciled with the app's explicit overspending decision model.",
        "Do not write historical month rows until this validation is proven against a real YNAB4 budget.",
      ],
    },
  ];

  const blockers = items
    .filter((item) => item.status === "blocked" || item.status === "missing")
    .map((item) => `${item.ynab4Area}: ${item.notes[0]}`);

  return {
    isYnab4Package: true,
    budgetName,
    budgetDataPath,
    monthCount: monthlyBudgets.length,
    categoryMonthCount: categoryMonthRows.length,
    earliestMonth: monthValues[0] ?? null,
    latestMonth: monthValues[monthValues.length - 1] ?? null,
    items,
    blockers,
    warnings,
  };
}

function getMonthlySubCategoryBudgets(month: Record<string, unknown>): Record<string, unknown>[] {
  return [
    ...toRecords(month.monthlySubCategoryBudgets),
    ...toRecords(month.subCategoryBudgets),
    ...toRecords(month.categoryBudgets),
  ];
}

function readActiveBudgetData(entries: Ynab4MonthlyBudgetPackageEntry[]): {
  data: Record<string, unknown> | null;
  budgetName: string | null;
  budgetDataPath: string | null;
  warnings: string[];
} {
  const normalisedEntries = entries.map((entry) => ({
    path: normalisePath(entry.path),
    text: entry.text,
    parsedData: entry.parsedData,
  }));
  const metadataEntry = normalisedEntries.find(
    (entry) => entry.path.endsWith("/Budget.ymeta") || entry.path === "Budget.ymeta",
  );

  if (!metadataEntry) {
    return { data: null, budgetName: null, budgetDataPath: null, warnings: ["Budget.ymeta was not found."] };
  }

  const packageRoot = inferPackageRoot(metadataEntry.path);
  const budgetName = inferBudgetName(packageRoot);
  let metadata: Ynab4PackageMetadata;
  try {
    metadata = JSON.parse(metadataEntry.text) as Ynab4PackageMetadata;
  } catch {
    return { data: null, budgetName, budgetDataPath: null, warnings: ["Budget.ymeta is not valid JSON."] };
  }

  const relativeDataFolderName = typeof metadata.relativeDataFolderName === "string" ? metadata.relativeDataFolderName : null;
  if (!relativeDataFolderName) {
    return { data: null, budgetName, budgetDataPath: null, warnings: ["Budget.ymeta does not contain a relativeDataFolderName value."] };
  }

  const activeDataFolderPath = packageRoot ? `${packageRoot}/${relativeDataFolderName}` : relativeDataFolderName;
  const budgetDataEntry = findActiveBudgetDataEntry(normalisedEntries, activeDataFolderPath);
  if (!budgetDataEntry) {
    return {
      data: null,
      budgetName,
      budgetDataPath: null,
      warnings: [`No Budget.yfull or Budget.json file was found under ${activeDataFolderPath}.`],
    };
  }

  try {
    const parsed = budgetDataEntry.parsedData ?? JSON.parse(budgetDataEntry.text ?? "");
    return {
      data: isRecord(parsed) ? parsed : null,
      budgetName,
      budgetDataPath: budgetDataEntry.path,
      warnings: isRecord(parsed) ? [] : ["The active YNAB4 budget data root is not an object."],
    };
  } catch {
    return { data: null, budgetName, budgetDataPath: budgetDataEntry.path, warnings: ["The active YNAB4 budget data file is not valid JSON."] };
  }
}

function findActiveBudgetDataEntry(
  entries: Ynab4MonthlyBudgetPackageEntry[],
  activeDataFolderPath: string,
): Ynab4MonthlyBudgetPackageEntry | undefined {
  const activePrefix = `${activeDataFolderPath}/`;
  const activeEntries = entries.filter((entry) => entry.path.startsWith(activePrefix));
  return (
    activeEntries.find((entry) => entry.path.endsWith("/Budget.yfull")) ??
    activeEntries.find((entry) => entry.path.endsWith("/Budget.json"))
  );
}

function collectSampleFields(records: Record<string, unknown>[]): string[] {
  const fields = new Set<string>();
  for (const record of records.slice(0, 5)) {
    for (const key of Object.keys(record)) {
      fields.add(key);
    }
  }
  return Array.from(fields).sort();
}

function hasAnyField(record: Record<string, unknown>, names: string[]): boolean {
  return names.some((name) => record[name] !== undefined && record[name] !== null);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function toRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalisePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function inferPackageRoot(path: string): string | null {
  const parts = normalisePath(path).split("/");
  if (parts.length <= 1) {
    return null;
  }
  return parts[0] || null;
}

function inferBudgetName(packageRoot: string | null): string | null {
  if (!packageRoot) {
    return null;
  }
  const withoutExtension = packageRoot.replace(/\.ynab4$/i, "");
  return withoutExtension.split("~")[0]?.trim() || withoutExtension;
}
