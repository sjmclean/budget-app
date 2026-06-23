import type { Ynab4JsonImportProgressStep } from "./analyzeYnab4Json.js";

export type Ynab4PackageImportMode = "new-budget" | "replace-current-budget";

export type Ynab4PackagePreviewItem = {
  id: string | null;
  name: string;
  note: string | null;
};

export type Ynab4PackageCategoryGroupPreview = Ynab4PackagePreviewItem & {
  categories: Ynab4PackagePreviewItem[];
};

export type Ynab4PackageTransactionPreview = {
  id: string | null;
  date: string | null;
  payee: string | null;
  memo: string | null;
  amount: string | number | null;
  category: string | null;
};

export type Ynab4PackageDetailedPreview = {
  accounts: Ynab4PackagePreviewItem[];
  categoryGroups: Ynab4PackageCategoryGroupPreview[];
  payees: Ynab4PackagePreviewItem[];
  scheduledTransactions: Ynab4PackageTransactionPreview[];
  firstTransactions: Ynab4PackageTransactionPreview[];
  recentTransactions: Ynab4PackageTransactionPreview[];
  notes: {
    categoryNotes: Ynab4PackagePreviewItem[];
    categoryGroupNotes: Ynab4PackagePreviewItem[];
  };
};

export type Ynab4PackageMigrationPreview = {
  canContinue: boolean;
  mode: Ynab4PackageImportMode;
  destructive: boolean;
  budgetName: string | null;
  summaryItems: Array<{ label: string; value: number }>;
  warnings: string[];
  progressSteps: Ynab4JsonImportProgressStep[];
  details: Ynab4PackageDetailedPreview;
};

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
  details: Ynab4PackageDetailedPreview;
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

const EMPTY_DETAILS: Ynab4PackageDetailedPreview = {
  accounts: [],
  categoryGroups: [],
  payees: [],
  scheduledTransactions: [],
  firstTransactions: [],
  recentTransactions: [],
  notes: {
    categoryNotes: [],
    categoryGroupNotes: [],
  },
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
    detail:
      "Reading Budget.ymeta to locate the current Budget.yfull data file.",
  },
  {
    phase: "analyse-structure",
    label: "Analysing YNAB4 budget data",
    detail:
      "Counting accounts, categories, payees, transactions, schedules, and notes.",
  },
  {
    phase: "preview-migration",
    label: "Preparing migration preview",
    detail:
      "Preparing a summary before any budget data is created or replaced.",
  },
];

export function createYnab4PackageMigrationPreview(
  discovery: Ynab4PackageDiscoveryResult,
  mode: Ynab4PackageImportMode,
): Ynab4PackageMigrationPreview {
  const destructive = mode === "replace-current-budget";
  const progressSteps = getYnab4PackageMigrationProgressSteps(mode);
  return {
    canContinue: discovery.isYnab4Package && discovery.warnings.length === 0,
    mode,
    destructive,
    budgetName: discovery.budgetName,
    summaryItems: [
      { label: "Accounts", value: discovery.counts.accounts },
      { label: "Category groups", value: discovery.counts.masterCategories },
      { label: "Categories", value: discovery.counts.categories },
      { label: "Payees", value: discovery.counts.payees },
      { label: "Monthly budgets", value: discovery.counts.monthlyBudgets },
      { label: "Transactions", value: discovery.counts.transactions },
      {
        label: "Scheduled transactions",
        value: discovery.counts.scheduledTransactions,
      },
      { label: "Category notes", value: discovery.counts.categoryNotes },
      {
        label: "Category group notes",
        value: discovery.counts.categoryGroupNotes,
      },
    ],
    warnings: [...discovery.warnings],
    progressSteps,
    details: cloneDetails(discovery.details),
  };
}

export function getYnab4PackageMigrationProgressSteps(
  mode: Ynab4PackageImportMode = "new-budget",
): Ynab4JsonImportProgressStep[] {
  const targetBudgetDetail =
    mode === "replace-current-budget"
      ? "Replacing the current budget after a destructive confirmation from Settings/Reset."
      : "Creating a new imported budget from the launcher migration flow.";

  return [
    ...DISCOVERY_PROGRESS_STEPS.map((step) => ({ ...step })),
    {
      phase: "prepare-target-budget",
      label: "Preparing target budget",
      detail: targetBudgetDetail,
    },
    {
      phase: "import-accounts",
      label: "Importing accounts",
      detail: "Migrating on-budget and off-budget YNAB4 accounts.",
    },
    {
      phase: "import-categories",
      label: "Importing categories",
      detail:
        "Migrating category groups, categories, budget values, and notes.",
    },
    {
      phase: "import-payees",
      label: "Importing payees",
      detail: "Migrating payees and preserving transaction references.",
    },
    {
      phase: "import-transactions",
      label: "Importing transactions",
      detail:
        "Migrating transactions, splits, transfers, memos, flags, and cleared state.",
    },
    {
      phase: "import-scheduled-transactions",
      label: "Importing scheduled transactions",
      detail:
        "Migrating scheduled transactions after normal transactions are understood.",
    },
    {
      phase: "validate-result",
      label: "Validating imported budget",
      detail:
        "Checking imported counts and relationships before opening the budget.",
    },
    {
      phase: "complete",
      label: "Import complete",
      detail: "Opening the imported budget once migration succeeds.",
    },
  ];
}

export function discoverYnab4Package(
  entries: Ynab4PackageEntry[],
): Ynab4PackageDiscoveryResult {
  const warnings: string[] = [];
  const normalisedEntries = entries.map((entry) => ({
    path: normalisePath(entry.path),
    text: entry.text,
  }));

  const metadataEntry = normalisedEntries.find(
    (entry) =>
      entry.path.endsWith("/Budget.ymeta") || entry.path === "Budget.ymeta",
  );

  if (!metadataEntry) {
    return createResult({
      warnings: [
        "Budget.ymeta was not found. YNAB4 package import expects the real .ynab4 package structure, not a CSV export.",
      ],
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

  const relativeDataFolderName =
    typeof metadata.relativeDataFolderName === "string"
      ? metadata.relativeDataFolderName
      : null;

  if (!relativeDataFolderName) {
    return createResult({
      packageRoot,
      budgetName,
      metadataPath: metadataEntry.path,
      warnings: [
        "Budget.ymeta does not contain a relativeDataFolderName value.",
      ],
    });
  }

  const activeDataFolderPath = packageRoot
    ? `${packageRoot}/${relativeDataFolderName}`
    : relativeDataFolderName;
  const budgetDataEntry = findActiveBudgetDataEntry(
    normalisedEntries,
    activeDataFolderPath,
  );

  if (!budgetDataEntry) {
    return createResult({
      packageRoot,
      budgetName,
      metadataPath: metadataEntry.path,
      relativeDataFolderName,
      activeDataFolderPath,
      warnings: [
        `No Budget.yfull or Budget.json file was found under ${activeDataFolderPath}.`,
      ],
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
  const details = createDetailedPreview(budgetObject);
  const topLevelKeys = Object.keys(budgetObject).sort();

  if (counts.transactions === 0) {
    warnings.push(
      "No transactions were detected in the active YNAB4 budget data file.",
    );
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
    details,
    warnings,
  });
}

function createResult(
  overrides: Partial<Ynab4PackageDiscoveryResult> = {},
): Ynab4PackageDiscoveryResult {
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
    details: cloneDetails(EMPTY_DETAILS),
    ...overrides,
  };
}

function findActiveBudgetDataEntry(
  entries: Ynab4PackageEntry[],
  activeDataFolderPath: string,
): Ynab4PackageEntry | undefined {
  const activePrefix = `${activeDataFolderPath}/`;
  const activeEntries = entries.filter((entry) =>
    entry.path.startsWith(activePrefix),
  );
  return (
    activeEntries.find(
      (entry) =>
        entry.path.endsWith("/Budget.yfull") ||
        entry.path === `${activeDataFolderPath}/Budget.yfull`,
    ) ??
    activeEntries.find(
      (entry) =>
        entry.path.endsWith("/Budget.json") ||
        entry.path === `${activeDataFolderPath}/Budget.json`,
    )
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

function countYnab4BudgetData(
  data: Record<string, unknown>,
): Ynab4PackageCounts {
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

function createDetailedPreview(
  data: Record<string, unknown>,
): Ynab4PackageDetailedPreview {
  const accounts = toArray(data.accounts).map(toNamedPreviewItem).slice(0, 20);
  const categoryGroups = toArray(data.masterCategories)
    .map(toCategoryGroupPreview)
    .slice(0, 30);
  const payees = toArray(data.payees).map(toNamedPreviewItem).slice(0, 30);
  const scheduledTransactions = toArray(data.scheduledTransactions)
    .map(toTransactionPreviewItem)
    .slice(0, 15);
  const transactions = toArray(data.transactions).map(toTransactionPreviewItem);
  const firstTransactions = transactions.slice(0, 10);
  const recentTransactions = transactions.slice(-10).reverse();
  const categoryNotes = categoryGroups.flatMap((group) =>
    group.categories.filter((category) => category.note),
  );
  const categoryGroupNotes = categoryGroups.filter((group) => group.note);

  return {
    accounts,
    categoryGroups,
    payees,
    scheduledTransactions,
    firstTransactions,
    recentTransactions,
    notes: {
      categoryNotes: categoryNotes.slice(0, 20),
      categoryGroupNotes: categoryGroupNotes.slice(0, 20),
    },
  };
}

function toCategoryGroupPreview(
  value: unknown,
): Ynab4PackageCategoryGroupPreview {
  const record = isRecord(value) ? value : {};
  return {
    ...toNamedPreviewItem(record),
    categories: toArray(record.subCategories)
      .map(toNamedPreviewItem)
      .slice(0, 50),
  };
}

function toNamedPreviewItem(value: unknown): Ynab4PackagePreviewItem {
  const record = isRecord(value) ? value : {};
  const name =
    firstString(
      record.name,
      record.accountName,
      record.categoryName,
      record.masterCategoryName,
      record.payeeName,
      record.displayName,
    ) ?? "Unnamed item";

  return {
    id:
      firstString(
        record.id,
        record.entityId,
        record.accountId,
        record.categoryId,
        record.masterCategoryId,
        record.payeeId,
      ) ?? null,
    name,
    note: firstString(record.note, record.notes) ?? null,
  };
}

function toTransactionPreviewItem(
  value: unknown,
): Ynab4PackageTransactionPreview {
  const record = isRecord(value) ? value : {};
  return {
    id:
      firstString(
        record.id,
        record.entityId,
        record.transactionId,
        record.scheduledTransactionId,
      ) ?? null,
    date:
      firstString(
        record.date,
        record.dateString,
        record.acceptedDate,
        record.nextDueDate,
      ) ?? null,
    payee:
      firstString(record.payeeName, record.payee, record.transferAccountName) ??
      null,
    memo: firstString(record.memo, record.note, record.notes) ?? null,
    amount:
      firstString(record.amount, record.amountText) ??
      firstNumber(
        record.amount,
        record.amountMilliUnits,
        record.outflow,
        record.inflow,
      ),
    category:
      firstString(
        record.categoryName,
        record.subCategoryName,
        record.masterCategoryName,
      ) ?? null,
  };
}

function cloneDetails(
  details: Ynab4PackageDetailedPreview,
): Ynab4PackageDetailedPreview {
  return {
    accounts: details.accounts.map((item) => ({ ...item })),
    categoryGroups: details.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => ({ ...category })),
    })),
    payees: details.payees.map((item) => ({ ...item })),
    scheduledTransactions: details.scheduledTransactions.map((item) => ({
      ...item,
    })),
    firstTransactions: details.firstTransactions.map((item) => ({ ...item })),
    recentTransactions: details.recentTransactions.map((item) => ({ ...item })),
    notes: {
      categoryNotes: details.notes.categoryNotes.map((item) => ({ ...item })),
      categoryGroupNotes: details.notes.categoryGroupNotes.map((item) => ({
        ...item,
      })),
    },
  };
}

function hasNoteLikeValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const note = value.note ?? value.notes;
  return typeof note === "string" && note.trim().length > 0;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
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
