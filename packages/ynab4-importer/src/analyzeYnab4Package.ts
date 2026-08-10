import {
  findActiveBudgetDataEntry,
  prepareYnab4PackageEntriesForStreaming,
  readYnab4BudgetData,
  type Ynab4PackageEntry,
} from "./package/readBudget.js";
import { discoverYnab4PackageLocation } from "./package/discoverPackage.js";
import { createYnab4SourceReader } from "./source/createYnab4SourceReader.js";
import { decodeYnabAmount } from "./money/decodeYnabAmount.js";

export type Ynab4PackageProgressPhase =
  | "read-file"
  | "validate-json"
  | "analyse-structure"
  | "preview-migration"
  | "prepare-target-budget"
  | "import-accounts"
  | "import-categories"
  | "import-payees"
  | "import-transactions"
  | "import-scheduled-transactions"
  | "validate-result"
  | "complete";

export type Ynab4PackageProgressStep = {
  phase: Ynab4PackageProgressPhase;
  label: string;
  detail: string;
};

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

export type Ynab4PackagePreviewLimits = {
  accounts: number;
  categoryGroups: number;
  categoriesPerGroup: number;
  payees: number;
  scheduledTransactions: number;
  notes: number;
  transactionSamples: number;
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
  previewLimits: Ynab4PackagePreviewLimits;
};

export type Ynab4PackageMigrationPreview = {
  canContinue: boolean;
  mode: Ynab4PackageImportMode;
  destructive: boolean;
  budgetName: string | null;
  summaryItems: Array<{ label: string; value: number }>;
  warnings: string[];
  progressSteps: Ynab4PackageProgressStep[];
  details: Ynab4PackageDetailedPreview;
};

export {
  prepareYnab4PackageEntries,
  prepareYnab4PackageEntriesForStreaming,
} from "./package/readBudget.js";
export type { Ynab4PackageEntry } from "./package/readBudget.js";

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

export type Ynab4ExtractionAuditStatus =
  | "found"
  | "missing"
  | "needs-mapping"
  | "unknown";

export type Ynab4ExtractionAuditItem = {
  entity: string;
  label: string;
  status: Ynab4ExtractionAuditStatus;
  count: number;
  sampleFields: string[];
  notes: string[];
};

export type Ynab4ExtractionAuditResult = {
  isYnab4Package: boolean;
  budgetName: string | null;
  budgetDataPath: string | null;
  items: Ynab4ExtractionAuditItem[];
  warnings: string[];
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
  progressSteps: Ynab4PackageProgressStep[];
  details: Ynab4PackageDetailedPreview;
  containsCreditCards: boolean;
};

export interface DiscoverYnab4PackageStreamingOptions {
  signal?: AbortSignal;
  batchSize?: number;
  onProgress?: (recordsRead: number) => void;
}

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

export const YNAB4_PACKAGE_PREVIEW_LIMITS: Ynab4PackagePreviewLimits = {
  accounts: 20,
  categoryGroups: 20,
  categoriesPerGroup: 12,
  payees: 20,
  scheduledTransactions: 15,
  notes: 20,
  transactionSamples: 10,
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
  previewLimits: { ...YNAB4_PACKAGE_PREVIEW_LIMITS },
};

const DISCOVERY_PROGRESS_STEPS: Ynab4PackageProgressStep[] = [
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
): Ynab4PackageProgressStep[] {
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

export function auditYnab4PackageExtraction(
  entries: Ynab4PackageEntry[],
): Ynab4ExtractionAuditResult {
  const discovery = discoverYnab4Package(entries);
  const budgetData = readActiveYnab4BudgetData(entries);

  if (!budgetData.data) {
    return {
      isYnab4Package: discovery.isYnab4Package,
      budgetName: discovery.budgetName,
      budgetDataPath: discovery.budgetDataPath,
      items: [],
      warnings: [...discovery.warnings, ...budgetData.warnings],
    };
  }

  const data = budgetData.data;
  const accounts = toRecords(data.accounts);
  const masterCategories = toRecords(data.masterCategories);
  const categories = masterCategories.flatMap((group) =>
    toRecords(group.subCategories),
  );
  const payees = toRecords(data.payees);
  const transactions = toRecords(data.transactions);
  const scheduledTransactions = toRecords(data.scheduledTransactions);
  const monthlyBudgets = toRecords(data.monthlyBudgets);
  const payeesById = new Map(
    payees
      .map((payee) => [firstString(payee.entityId, payee.id), payee] as const)
      .filter((entry): entry is readonly [string, Record<string, unknown>] =>
        Boolean(entry[0]),
      ),
  );

  const transferTransactions = transactions.filter((transaction) =>
    isTransferLikeTransaction(transaction, payeesById),
  );
  const splitTransactions = transactions.filter(
    (transaction) => toArray(transaction.subTransactions).length > 0,
  );
  const tombstoneTransactions = transactions.filter(
    (transaction) => transaction.isTombstone === true,
  );
  const memoTransactions = transactions.filter(
    (transaction) => firstString(transaction.memo, transaction.note, transaction.notes),
  );
  const flaggedTransactions = transactions.filter((transaction) =>
    firstString(transaction.flag, transaction.flagColor, transaction.flagName),
  );
  const scheduledTransfers = scheduledTransactions.filter((transaction) =>
    isTransferLikeTransaction(transaction, payeesById),
  );
  const scheduledSplits = scheduledTransactions.filter(
    (transaction) => toArray(transaction.subTransactions).length > 0,
  );
  const categoryNotes = categories.filter(hasNoteLikeValue);
  const categoryGroupNotes = masterCategories.filter(hasNoteLikeValue);

  const items: Ynab4ExtractionAuditItem[] = [
    createAuditItem({
      entity: "accounts",
      label: "Accounts",
      count: accounts.length,
      records: accounts,
      notes: [
        `On-budget accounts: ${accounts.filter((account) => account.onBudget === true).length}`,
        `Off-budget accounts: ${accounts.filter((account) => account.onBudget === false).length}`,
        `Closed accounts (source hidden flag): ${accounts.filter((account) => account.hidden === true).length}`,
      ],
    }),
    createAuditItem({
      entity: "category-groups",
      label: "Category groups",
      count: masterCategories.length,
      records: masterCategories,
      notes: [
        `Groups with notes: ${categoryGroupNotes.length}`,
        "Category group notes are YNAB4 compatibility data and should be preserved even if the first app UI only prioritises category notes.",
      ],
    }),
    createAuditItem({
      entity: "categories",
      label: "Categories",
      count: categories.length,
      records: categories,
      notes: [`Categories with notes: ${categoryNotes.length}`],
    }),
    createAuditItem({
      entity: "payees",
      label: "Payees",
      count: payees.length,
      records: payees,
      notes: [
        `Transfer payees: ${payees.filter((payee) => firstString(payee.targetAccountId)).length}`,
        "Payee rename conditions and auto-fill fields need a future mapping decision.",
      ],
      statusOverride: payees.some(
        (payee) =>
          toArray(payee.renameConditions).length > 0 ||
          firstString(payee.autoFillCategoryId, payee.autoFillMemo) ||
          firstNumber(payee.autoFillAmount) !== null,
      )
        ? "needs-mapping"
        : undefined,
    }),
    createAuditItem({
      entity: "monthly-budgets",
      label: "Monthly budgets",
      count: monthlyBudgets.length,
      records: monthlyBudgets,
      notes: [
        "Monthly budget data drives historical budgeted values and must be mapped before full-fidelity import.",
      ],
      statusOverride: monthlyBudgets.length > 0 ? "needs-mapping" : undefined,
    }),
    createAuditItem({
      entity: "transactions",
      label: "Transactions",
      count: transactions.length,
      records: transactions,
      notes: [
        `Transfer-like transactions: ${transferTransactions.length}`,
        `Split transactions: ${splitTransactions.length}`,
        `Tombstone/deleted transactions: ${tombstoneTransactions.length}`,
        `Transactions with memos: ${memoTransactions.length}`,
        `Flagged transactions: ${flaggedTransactions.length}`,
      ],
      statusOverride:
        transferTransactions.length > 0 ||
        splitTransactions.length > 0 ||
        tombstoneTransactions.length > 0 ||
        flaggedTransactions.length > 0
          ? "needs-mapping"
          : undefined,
    }),
    createAuditItem({
      entity: "scheduled-transactions",
      label: "Scheduled transactions",
      count: scheduledTransactions.length,
      records: scheduledTransactions,
      notes: [
        `Scheduled transfers: ${scheduledTransfers.length}`,
        `Scheduled splits: ${scheduledSplits.length}`,
        "Scheduled transaction recurrence/frequency fields require dedicated mapping.",
      ],
      statusOverride:
        scheduledTransactions.length > 0 ? "needs-mapping" : undefined,
    }),
    createAuditItem({
      entity: "notes",
      label: "Notes and metadata",
      count: categoryNotes.length + categoryGroupNotes.length,
      records: [...categoryNotes, ...categoryGroupNotes],
      notes: [
        `Category notes: ${categoryNotes.length}`,
        `Category group notes: ${categoryGroupNotes.length}`,
        "Individual category notes are the MVP UI target; group notes remain a YNAB4 preservation requirement.",
      ],
      statusOverride:
        categoryNotes.length + categoryGroupNotes.length > 0
          ? "needs-mapping"
          : undefined,
    }),
  ];

  return {
    isYnab4Package: discovery.isYnab4Package,
    budgetName: discovery.budgetName,
    budgetDataPath: discovery.budgetDataPath,
    items,
    warnings: [...discovery.warnings, ...budgetData.warnings],
  };
}

export function discoverYnab4Package(
  entries: Ynab4PackageEntry[],
): Ynab4PackageDiscoveryResult {
  const warnings: string[] = [];
  const budgetRead = readYnab4BudgetData(entries);
  const packageRoot = budgetRead.packageRoot;
  const budgetName = inferBudgetName(packageRoot);

  if (!budgetRead.data) {
    return createResult({
      packageRoot,
      budgetName,
      metadataPath: budgetRead.metadataPath,
      relativeDataFolderName: budgetRead.relativeDataFolderName,
      activeDataFolderPath: budgetRead.activeDataFolderPath,
      budgetDataPath: budgetRead.budgetDataPath,
      budgetDataFormat: budgetRead.budgetDataFormat,
      warnings:
        budgetRead.warnings.length > 0
          ? budgetRead.warnings.map((warning) =>
              warning === "Budget.ymeta was not found."
                ? "Budget.ymeta was not found. YNAB4 package import expects the real .ynab4 package structure, not a CSV export."
                : warning,
            )
          : [],
    });
  }

  const budgetObject = budgetRead.data;
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
    metadataPath: budgetRead.metadataPath,
    relativeDataFolderName: budgetRead.relativeDataFolderName,
    activeDataFolderPath: budgetRead.activeDataFolderPath,
    budgetDataPath: budgetRead.budgetDataPath,
    budgetDataFormat: budgetRead.budgetDataFormat,
    topLevelKeys,
    counts,
    details,
    warnings: [...budgetRead.warnings, ...warnings],
  });
}

export async function discoverYnab4PackageStreaming(
  entries: Ynab4PackageEntry[],
  options: DiscoverYnab4PackageStreamingOptions = {},
): Promise<Ynab4PackageDiscoveryResult> {
  await prepareYnab4PackageEntriesForStreaming(entries);
  const location = discoverYnab4PackageLocation(entries);
  const selected = entries.find((entry) => entry.selectedBudgetData) ??
    (location.activeDataFolderPath
      ? findActiveBudgetDataEntry(entries, location.activeDataFolderPath)
      : undefined);
  if (!selected?.file) {
    return createResult({
      packageRoot: location.packageRoot,
      budgetName: inferBudgetName(location.packageRoot),
      metadataPath: location.metadataPath,
      relativeDataFolderName: location.relativeDataFolderName,
      activeDataFolderPath: location.activeDataFolderPath,
      warnings: ["The active YNAB4 budget data Blob was not available for streaming preview."],
    });
  }

  const reader = createYnab4SourceReader(selected.file, {
    sourceName: selected.path,
  });
  try {
    const metadata = await reader.inspect({ signal: options.signal });
    const references = await reader.readReferenceData({ signal: options.signal });
    const accounts = [...references.accounts];
    const masterCategories = [...references.masterCategories];
    const categories = masterCategories.flatMap((group) => toArray(group.subCategories));
    const payees = [...references.payees];
    const firstTransactions: Ynab4PackageTransactionPreview[] = [];
    const recentTransactions: Ynab4PackageTransactionPreview[] = [];
    let transactionCount = 0;
    for await (const batch of reader.streamRecords({
      batchSize: options.batchSize ?? 500,
      signal: options.signal,
    })) {
      for (const transaction of batch) {
        const preview = toTransactionPreviewItem(transaction);
        if (firstTransactions.length < YNAB4_PACKAGE_PREVIEW_LIMITS.transactionSamples) {
          firstTransactions.push(preview);
        }
        recentTransactions.push(preview);
        if (recentTransactions.length > YNAB4_PACKAGE_PREVIEW_LIMITS.transactionSamples) {
          recentTransactions.shift();
        }
        transactionCount += 1;
      }
      options.onProgress?.(transactionCount);
    }
    const scheduled: Record<string, unknown>[] = [];
    let scheduledCount = 0;
    for await (const batch of reader.streamScheduledTransactions({
      batchSize: options.batchSize ?? 500,
      signal: options.signal,
    })) {
      for (const record of batch) {
        scheduledCount += 1;
        if (scheduled.length < YNAB4_PACKAGE_PREVIEW_LIMITS.scheduledTransactions) {
          scheduled.push(record);
        }
      }
    }
    const categoryGroups = masterCategories
      .map(toCategoryGroupPreview)
      .slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.categoryGroups);
    const details: Ynab4PackageDetailedPreview = {
      accounts: accounts.map(toNamedPreviewItem).slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.accounts),
      categoryGroups,
      payees: payees.map(toNamedPreviewItem).slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.payees),
      scheduledTransactions: scheduled.map(toTransactionPreviewItem),
      firstTransactions,
      recentTransactions: recentTransactions.reverse(),
      notes: {
        categoryNotes: categories.filter(hasNoteLikeValue).map(toNamedPreviewItem).slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.notes),
        categoryGroupNotes: categoryGroups.filter((group) => Boolean(group.note)).slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.notes),
      },
      previewLimits: { ...YNAB4_PACKAGE_PREVIEW_LIMITS },
    };
    const warnings = transactionCount === 0
      ? ["No transactions were detected in the active YNAB4 budget data file."]
      : [];
    return createResult({
      isYnab4Package: true,
      packageRoot: location.packageRoot,
      budgetName: inferBudgetName(location.packageRoot),
      metadataPath: location.metadataPath,
      relativeDataFolderName: location.relativeDataFolderName,
      activeDataFolderPath: location.activeDataFolderPath,
      budgetDataPath: selected.path,
      budgetDataFormat: selected.path.endsWith(".yfull") ? "yfull" : "json",
      topLevelKeys: [...metadata.topLevelKeys].sort(),
      counts: {
        accounts: accounts.length,
        masterCategories: masterCategories.length,
        categories: categories.length,
        payees: payees.length,
        monthlyBudgets: references.monthlyBudgets.length,
        transactions: transactionCount,
        scheduledTransactions: scheduledCount,
        categoryNotes: categories.filter(hasNoteLikeValue).length,
        categoryGroupNotes: masterCategories.filter(hasNoteLikeValue).length,
      },
      details,
      containsCreditCards: accounts.some((account) =>
        firstString(account.accountType, account.type)?.toLowerCase().includes("credit") ?? false
      ),
      warnings: [...location.warnings, ...warnings],
    });
  } finally {
    await reader.close();
  }
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
    containsCreditCards: false,
    ...overrides,
  };
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
  const accounts = toArray(data.accounts)
    .map(toNamedPreviewItem)
    .slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.accounts);
  const categoryGroups = toArray(data.masterCategories)
    .map(toCategoryGroupPreview)
    .slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.categoryGroups);
  const payees = toArray(data.payees)
    .map(toNamedPreviewItem)
    .slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.payees);
  const scheduledTransactions = toArray(data.scheduledTransactions)
    .map(toTransactionPreviewItem)
    .slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.scheduledTransactions);
  const transactions = toArray(data.transactions).map(toTransactionPreviewItem);
  const firstTransactions = transactions.slice(
    0,
    YNAB4_PACKAGE_PREVIEW_LIMITS.transactionSamples,
  );
  const recentTransactions = transactions
    .slice(-YNAB4_PACKAGE_PREVIEW_LIMITS.transactionSamples)
    .reverse();
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
      categoryNotes: categoryNotes.slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.notes),
      categoryGroupNotes: categoryGroupNotes.slice(
        0,
        YNAB4_PACKAGE_PREVIEW_LIMITS.notes,
      ),
    },
    previewLimits: { ...YNAB4_PACKAGE_PREVIEW_LIMITS },
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
      .slice(0, YNAB4_PACKAGE_PREVIEW_LIMITS.categoriesPerGroup),
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
      decodeYnabAmount({
        amount: record.amount,
        amountMilliUnits: record.amountMilliUnits,
        inflow: record.inflow,
        outflow: record.outflow,
      }),
    category:
      firstString(
        record.categoryName,
        record.subCategoryName,
        record.masterCategoryName,
      ) ?? null,
  };
}

function readActiveYnab4BudgetData(entries: Ynab4PackageEntry[]): {
  data: Record<string, unknown> | null;
  warnings: string[];
} {
  const result = readYnab4BudgetData(entries);
  return { data: result.data, warnings: result.warnings };
}

function createAuditItem(input: {
  entity: string;
  label: string;
  count: number;
  records: Record<string, unknown>[];
  notes: string[];
  statusOverride?: Ynab4ExtractionAuditStatus;
}): Ynab4ExtractionAuditItem {
  return {
    entity: input.entity,
    label: input.label,
    status: input.statusOverride ?? (input.count > 0 ? "found" : "missing"),
    count: input.count,
    sampleFields: collectSampleFields(input.records),
    notes: input.notes,
  };
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

function isTransferLikeTransaction(
  transaction: Record<string, unknown>,
  payeesById: Map<string, Record<string, unknown>>,
): boolean {
  if (firstString(transaction.targetAccountId, transaction.transferAccountId)) {
    return true;
  }

  const payeeId = firstString(transaction.payeeId);
  if (!payeeId) {
    return false;
  }

  const payee = payeesById.get(payeeId);
  return Boolean(payee && firstString(payee.targetAccountId));
}

function toRecords(value: unknown): Record<string, unknown>[] {
  return toArray(value).filter(isRecord);
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
    previewLimits: { ...details.previewLimits },
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
