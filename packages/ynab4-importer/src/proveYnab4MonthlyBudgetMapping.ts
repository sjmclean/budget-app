export type Ynab4MonthlyBudgetProofStatus =
  | "proved"
  | "derived"
  | "validation-only"
  | "blocked"
  | "missing";

export type Ynab4MonthlyBudgetPackageEntry = {
  path: string;
  text: string;
};

export type Ynab4BudgetMonthProof = {
  ynab4EntityId: string | null;
  ynab4Month: string;
  appMonth: string;
  destination: "budget_months";
  assignedFromCategories: number;
  categoryRowCount: number;
  mapping: {
    month: Ynab4MonthlyBudgetProofStatus;
    assigned: Ynab4MonthlyBudgetProofStatus;
    activity: Ynab4MonthlyBudgetProofStatus;
    income: Ynab4MonthlyBudgetProofStatus;
    readyToBudget: Ynab4MonthlyBudgetProofStatus;
  };
  notes: string[];
};

export type Ynab4CategoryMonthProof = {
  ynab4EntityId: string | null;
  ynab4ParentMonthlyBudgetId: string | null;
  ynab4CategoryId: string | null;
  appMonth: string | null;
  destination: "category_months";
  assigned: number | null;
  overspendingHandling: string | null;
  mapping: {
    categoryId: Ynab4MonthlyBudgetProofStatus;
    assigned: Ynab4MonthlyBudgetProofStatus;
    activity: Ynab4MonthlyBudgetProofStatus;
    previousAvailable: Ynab4MonthlyBudgetProofStatus;
    available: Ynab4MonthlyBudgetProofStatus;
    overspendingHandling: Ynab4MonthlyBudgetProofStatus;
  };
  notes: string[];
};

export type Ynab4MonthlyBudgetMappingProof = {
  isYnab4Package: boolean;
  budgetName: string | null;
  budgetDataPath: string | null;
  monthCount: number;
  categoryMonthCount: number;
  earliestMonth: string | null;
  latestMonth: string | null;
  budgetMonthProofs: Ynab4BudgetMonthProof[];
  categoryMonthProofSample: Ynab4CategoryMonthProof[];
  totals: {
    assignedByMonth: Array<{ appMonth: string; assigned: number; categoryRowCount: number }>;
    rowsWithBudgeted: number;
    rowsMissingBudgeted: number;
    rowsWithOverspendingHandling: number;
  };
  blockers: string[];
  warnings: string[];
};

type Ynab4PackageMetadata = {
  relativeDataFolderName?: unknown;
};

const CATEGORY_PROOF_SAMPLE_LIMIT = 25;

export function proveYnab4MonthlyBudgetMapping(
  entries: Ynab4MonthlyBudgetPackageEntry[],
): Ynab4MonthlyBudgetMappingProof {
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
      budgetMonthProofs: [],
      categoryMonthProofSample: [],
      totals: {
        assignedByMonth: [],
        rowsWithBudgeted: 0,
        rowsMissingBudgeted: 0,
        rowsWithOverspendingHandling: 0,
      },
      blockers: ["Could not read active YNAB4 budget data."],
      warnings,
    };
  }

  const monthlyBudgets = toRecords(data.monthlyBudgets);
  const categoryRowsByParent = new Map<string, Record<string, unknown>[]>();
  const parentMonthById = new Map<string, string>();
  const allCategoryRows: Record<string, unknown>[] = [];
  const budgetMonthProofs: Ynab4BudgetMonthProof[] = [];

  for (const month of monthlyBudgets) {
    const monthEntityId = firstString(month.entityId, month.id);
    const ynab4Month = firstString(month.month, month.monthName, month.date, month.budgetMonth);
    if (!ynab4Month) {
      warnings.push(
        `Monthly budget ${monthEntityId ?? "<unknown>"} has no month field and cannot be mapped safely.`,
      );
      continue;
    }

    const appMonth = normaliseYnab4Month(ynab4Month);
    const categoryRows = getMonthlySubCategoryBudgets(month);
    if (monthEntityId) {
      categoryRowsByParent.set(monthEntityId, categoryRows);
      parentMonthById.set(monthEntityId, appMonth);
    }
    allCategoryRows.push(...categoryRows);

    const assignedFromCategories = categoryRows.reduce(
      (total, row) => total + (toMinorUnits(row.budgeted) ?? 0),
      0,
    );

    budgetMonthProofs.push({
      ynab4EntityId: monthEntityId,
      ynab4Month,
      appMonth,
      destination: "budget_months",
      assignedFromCategories,
      categoryRowCount: categoryRows.length,
      mapping: {
        month: "proved",
        assigned: categoryRows.length > 0 ? "derived" : "missing",
        activity: "derived",
        income: "derived",
        readyToBudget: "blocked",
      },
      notes: [
        "YNAB4 monthlyBudget.month maps directly to budget_months.month after YYYY-MM normalization.",
        "budget_months.assigned should be derived from the sum of monthlySubCategoryBudgets.budgeted for the month.",
        "budget_months.activity should be derived from imported transactions for the same month, not copied from monthlyBudget rows.",
        "budget_months.income and ready_to_budget require a separate Income for Month / Income for Next Month proof before writes.",
      ],
    });
  }

  const categoryMonthProofSample = allCategoryRows
    .slice(0, CATEGORY_PROOF_SAMPLE_LIMIT)
    .map((row) => createCategoryMonthProof(row, parentMonthById));

  const rowsWithBudgeted = allCategoryRows.filter(
    (row) => toMinorUnits(row.budgeted) !== null,
  ).length;
  const rowsMissingBudgeted = allCategoryRows.length - rowsWithBudgeted;
  const rowsWithOverspendingHandling = allCategoryRows.filter((row) =>
    firstString(row.overspendingHandling),
  ).length;

  const assignedByMonth = budgetMonthProofs.map((proof) => ({
    appMonth: proof.appMonth,
    assigned: proof.assignedFromCategories,
    categoryRowCount: proof.categoryRowCount,
  }));

  const monthValues = budgetMonthProofs.map((proof) => proof.appMonth).sort();
  const blockers = [
    "budget_months.income and ready_to_budget still need Income for Month / Income for Next Month proof.",
    "category_months.activity must be derived from imported transaction activity and validated against monthly history.",
    "category_months.previous_available and available must be derived across month boundaries and validated before writes.",
  ];
  if (rowsWithOverspendingHandling > 0) {
    blockers.push(
      "YNAB4 monthlySubCategoryBudgets contain overspendingHandling values that must be reconciled with the app's explicit overspending decision model.",
    );
  }
  if (rowsMissingBudgeted > 0) {
    blockers.push(
      "Some monthlySubCategoryBudget rows do not contain a budgeted value and need fallback handling before import writes.",
    );
  }

  return {
    isYnab4Package: true,
    budgetName,
    budgetDataPath,
    monthCount: monthlyBudgets.length,
    categoryMonthCount: allCategoryRows.length,
    earliestMonth: monthValues[0] ?? null,
    latestMonth: monthValues[monthValues.length - 1] ?? null,
    budgetMonthProofs,
    categoryMonthProofSample,
    totals: {
      assignedByMonth,
      rowsWithBudgeted,
      rowsMissingBudgeted,
      rowsWithOverspendingHandling,
    },
    blockers,
    warnings,
  };
}

function createCategoryMonthProof(
  row: Record<string, unknown>,
  parentMonthById: Map<string, string>,
): Ynab4CategoryMonthProof {
  const parentId = firstString(row.parentMonthlyBudgetId, row.monthlyBudgetId);
  const appMonth = parentId ? parentMonthById.get(parentId) ?? null : null;
  const assigned = toMinorUnits(row.budgeted);
  const overspendingHandling = firstString(row.overspendingHandling);

  return {
    ynab4EntityId: firstString(row.entityId, row.id),
    ynab4ParentMonthlyBudgetId: parentId,
    ynab4CategoryId: firstString(row.categoryId, row.subCategoryId),
    appMonth,
    destination: "category_months",
    assigned,
    overspendingHandling,
    mapping: {
      categoryId: firstString(row.categoryId, row.subCategoryId) ? "proved" : "missing",
      assigned: assigned !== null ? "proved" : "missing",
      activity: "derived",
      previousAvailable: "derived",
      available: "validation-only",
      overspendingHandling: overspendingHandling ? "blocked" : "proved",
    },
    notes: [
      "YNAB4 categoryId maps to category_months.categoryId through the YNAB4 category import map.",
      "YNAB4 budgeted maps to category_months.assigned after normalising to app minor units.",
      "category_months.activity must be derived from imported transactions for the category and month.",
      "category_months.available should be recalculated and compared with any YNAB4 balance-like value if present.",
      overspendingHandling
        ? "This row has overspendingHandling and needs explicit YNAB4-to-app overspending semantics."
        : "No overspendingHandling value is present on this row.",
    ],
  };
}

function getMonthlySubCategoryBudgets(month: Record<string, unknown>): Record<string, unknown>[] {
  return [
    ...toRecords(month.monthlySubCategoryBudgets),
    ...toRecords(month.subCategoryBudgets),
    ...toRecords(month.categoryBudgets),
  ];
}

function toMinorUnits(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }
  return null;
}

function normaliseYnab4Month(value: string): string {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(trimmed);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return trimmed;
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
    const parsed = JSON.parse(budgetDataEntry.text);
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
