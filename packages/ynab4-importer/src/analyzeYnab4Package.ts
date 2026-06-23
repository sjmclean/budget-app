import type { Ynab4JsonImportProgressStep } from "./analyzeYnab4Json.js";

export type Ynab4PackageEntry = {
  path: string;
  text: string;
};

export type Ynab4PackageCounts = {
  accounts: number;
  masterCategories: number;
  categories: number;
  payees: number;
  monthlyBudgets: number;
  transactions: number;
  scheduledTransactions: number;
  categoryNotes: number;
  categoryGroupNotes: number;
};

export type Ynab4PackageDiscoveryResult = {
  isYnab4Package: boolean;
  packageRoot: string | null;
  budgetName: string | null;
  metadataPath: string | null;
  relativeDataFolderName: string | null;
  activeDataFolderPath: string | null;
  budgetDataPath: string | null;
  budgetDataFormat: "yfull" | "json" | null;
  topLevelKeys: string[];
  counts: Ynab4PackageCounts;
  warnings: string[];
  progressSteps: Ynab4JsonImportProgressStep[];
};

type Ynab4PackageMetadata = {
  formatVersion?: unknown;
  relativeDataFolderName?: unknown;
  TED?: unknown;
};

const EMPTY_COUNTS: Ynab4PackageCounts = {
  accounts: 0,
  masterCategories: 0,
  categories: 0,
  payees: 0,
  monthlyBudgets: 0,
  transactions: 0,
  scheduledTransactions: 0,
  categoryNotes: 0,
  categoryGroupNotes: 0,
};

const DISCOVERY_PROGRESS_STEPS: Ynab4JsonImportProgressStep[] = [
  {
    phase: "read-file",
    label: "Reading YNAB4 package",
    detail: "Finding Budget.ymeta and the active YNAB4 data folder.",
  },
  {
    phase: "validate-json",
    label: "Validating YNAB4 metadata",
    detail: "Reading Budget.ymeta to locate the current Budget.yfull data file.",
  },
  {
    phase: "analyse-structure",
    label: "Analysing YNAB4 budget data",
    detail: "Counting accounts, categories, payees, transactions, schedules, and notes.",
  },
  {
    phase: "preview-migration",
    label: "Preparing migration preview",
    detail: "Preparing a summary before any budget data is created or replaced.",
  },
];

export function discoverYnab4Package(entries: Ynab4PackageEntry[]): Ynab4PackageDiscoveryResult {
  const warnings: string[] = [];
  const normalisedEntries = entries.map((entry) => ({
    path: normalisePath(entry.path),
    text: entry.text,
  }));

  const metadataEntry = normalisedEntries.find((entry) => entry.path.endsWith("/Budget.ymeta") || entry.path === "Budget.ymeta");

  if (!metadataEntry) {
    return createResult({
      warnings: ["Budget.ymeta was not found. YNAB4 package import expects the real .ynab4 package structure, not a CSV export."],
    });
  }

  const packageRoot = inferPackageRoot(metadataEntry.path);
  const budgetName = inferBudgetName(packageRoot);
  let metadata: Ynab4PackageMetadata;

  try {
    metadata = JSON.parse(metadataEntry.text) as Ynab4PackageMetadata;
  } catch {
    return createResult({
      packageRoot,
      budgetName,
      metadataPath: metadataEntry.path,
      warnings: ["Budget.ymeta is not valid JSON."],
    });
  }

  const relativeDataFolderName = typeof metadata.relativeDataFolderName === "string" ? metadata.relativeDataFolderName : null;

  if (!relativeDataFolderName) {
    return createResult({
      packageRoot,
      budgetName,
      metadataPath: metadataEntry.path,
      warnings: ["Budget.ymeta does not contain a relativeDataFolderName value."],
    });
  }

  const activeDataFolderPath = packageRoot ? `${packageRoot}/${relativeDataFolderName}` : relativeDataFolderName;
  const budgetDataEntry = findActiveBudgetDataEntry(normalisedEntries, activeDataFolderPath);

  if (!budgetDataEntry) {
    return createResult({
      packageRoot,
      budgetName,
      metadataPath: metadataEntry.path,
      relativeDataFolderName,
      activeDataFolderPath,
      warnings: [`No Budget.yfull or Budget.json file was found under ${activeDataFolderPath}.`],
    });
  }

  let budgetData: unknown;
  try {
    budgetData = JSON.parse(budgetDataEntry.text);
  } catch {
    return createResult({
      packageRoot,
      budgetName,
      metadataPath: metadataEntry.path,
      relativeDataFolderName,
      activeDataFolderPath,
      budgetDataPath: budgetDataEntry.path,
      budgetDataFormat: inferBudgetDataFormat(budgetDataEntry.path),
      warnings: ["The active YNAB4 budget data file is not valid JSON."],
    });
  }

  const budgetObject = isRecord(budgetData) ? budgetData : null;
  if (!budgetObject) {
    return createResult({
      packageRoot,
      budgetName,
      metadataPath: metadataEntry.path,
      relativeDataFolderName,
      activeDataFolderPath,
      budgetDataPath: budgetDataEntry.path,
      budgetDataFormat: inferBudgetDataFormat(budgetDataEntry.path),
      warnings: ["The active YNAB4 budget data root is not an object."],
    });
  }

  const counts = countYnab4BudgetData(budgetObject);
  const topLevelKeys = Object.keys(budgetObject).sort();

  if (counts.transactions === 0) {
    warnings.push("No transactions were detected in the active YNAB4 budget data file.");
  }

  return createResult({
    isYnab4Package: true,
    packageRoot,
    budgetName,
    metadataPath: metadataEntry.path,
    relativeDataFolderName,
    activeDataFolderPath,
    budgetDataPath: budgetDataEntry.path,
    budgetDataFormat: inferBudgetDataFormat(budgetDataEntry.path),
    topLevelKeys,
    counts,
    warnings,
  });
}

function createResult(overrides: Partial<Ynab4PackageDiscoveryResult> = {}): Ynab4PackageDiscoveryResult {
  return {
    isYnab4Package: false,
    packageRoot: null,
    budgetName: null,
    metadataPath: null,
    relativeDataFolderName: null,
    activeDataFolderPath: null,
    budgetDataPath: null,
    budgetDataFormat: null,
    topLevelKeys: [],
    counts: { ...EMPTY_COUNTS },
    warnings: [],
    progressSteps: DISCOVERY_PROGRESS_STEPS.map((step) => ({ ...step })),
    ...overrides,
  };
}

function findActiveBudgetDataEntry(entries: Ynab4PackageEntry[], activeDataFolderPath: string): Ynab4PackageEntry | undefined {
  const activePrefix = `${activeDataFolderPath}/`;
  const activeEntries = entries.filter((entry) => entry.path.startsWith(activePrefix));
  return (
    activeEntries.find((entry) => entry.path.endsWith("/Budget.yfull") || entry.path === `${activeDataFolderPath}/Budget.yfull`) ??
    activeEntries.find((entry) => entry.path.endsWith("/Budget.json") || entry.path === `${activeDataFolderPath}/Budget.json`)
  );
}

function inferBudgetDataFormat(path: string): "yfull" | "json" | null {
  if (path.endsWith("Budget.yfull")) {
    return "yfull";
  }
  if (path.endsWith("Budget.json")) {
    return "json";
  }
  return null;
}

function countYnab4BudgetData(data: Record<string, unknown>): Ynab4PackageCounts {
  const masterCategories = toArray(data.masterCategories);
  const categories = masterCategories.flatMap((categoryGroup) => {
    if (!isRecord(categoryGroup)) {
      return [];
    }
    return toArray(categoryGroup.subCategories);
  });

  return {
    accounts: toArray(data.accounts).length,
    masterCategories: masterCategories.length,
    categories: categories.length,
    payees: toArray(data.payees).length,
    monthlyBudgets: toArray(data.monthlyBudgets).length,
    transactions: toArray(data.transactions).length,
    scheduledTransactions: toArray(data.scheduledTransactions).length,
    categoryNotes: categories.filter(hasNoteLikeValue).length,
    categoryGroupNotes: masterCategories.filter(hasNoteLikeValue).length,
  };
}

function hasNoteLikeValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const note = value.note ?? value.notes;
  return typeof note === "string" && note.trim().length > 0;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
