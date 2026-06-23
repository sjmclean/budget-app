export type Ynab4JsonImportMode = "new-budget" | "replace-current-budget";

export type Ynab4JsonImportEntryPoint = "budget-launcher" | "settings-migration" | "reset-replace";

export type Ynab4JsonImportProgressPhase =
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

export type Ynab4JsonImportProgressStep = {
  phase: Ynab4JsonImportProgressPhase;
  label: string;
  detail: string;
};

export type Ynab4JsonImportPlan = {
  mode: Ynab4JsonImportMode;
  entryPoint: Ynab4JsonImportEntryPoint;
  destructive: boolean;
  createsBudget: boolean;
  requiresExistingBudget: boolean;
  progressSteps: Ynab4JsonImportProgressStep[];
};

export type Ynab4JsonAuditResult = {
  isJson: boolean;
  isPotentialYnab4Json: boolean;
  rootKind: "object" | "array" | "other";
  topLevelKeys: string[];
  detectedSections: string[];
  warnings: string[];
};

const YNAB4_JSON_SECTION_HINTS = [
  "accounts",
  "accountData",
  "masterCategories",
  "categoryGroups",
  "categories",
  "payees",
  "transactions",
  "scheduledTransactions",
  "monthlyBudgets",
  "budgetData",
  "fileMetaData",
  "entities",
];

const PROGRESS_STEPS: Ynab4JsonImportProgressStep[] = [
  {
    phase: "read-file",
    label: "Reading YNAB4 file",
    detail: "Loading the selected YNAB4 JSON data file.",
  },
  {
    phase: "validate-json",
    label: "Validating JSON",
    detail: "Checking that the file is valid JSON before any budget data is changed.",
  },
  {
    phase: "analyse-structure",
    label: "Analysing budget structure",
    detail: "Finding accounts, categories, payees, transactions, schedules, and notes.",
  },
  {
    phase: "preview-migration",
    label: "Preparing migration preview",
    detail: "Building a preview so the user can review what will be imported.",
  },
  {
    phase: "prepare-target-budget",
    label: "Preparing target budget",
    detail: "Creating a new budget or resetting the current budget depending on import mode.",
  },
  {
    phase: "import-accounts",
    label: "Importing accounts",
    detail: "Migrating on-budget and off-budget accounts.",
  },
  {
    phase: "import-categories",
    label: "Importing categories",
    detail: "Migrating category groups, categories, budget values, and notes.",
  },
  {
    phase: "import-payees",
    label: "Importing payees",
    detail: "Migrating payees and preserving payee references.",
  },
  {
    phase: "import-transactions",
    label: "Importing transactions",
    detail: "Migrating transactions, splits, transfers, memos, flags, and cleared state.",
  },
  {
    phase: "import-scheduled-transactions",
    label: "Importing scheduled transactions",
    detail: "Migrating recurring and future-dated scheduled transactions.",
  },
  {
    phase: "validate-result",
    label: "Validating imported budget",
    detail: "Checking imported counts and relationships before opening the budget.",
  },
  {
    phase: "complete",
    label: "Import complete",
    detail: "Opening the imported budget once migration succeeds.",
  },
];

export function createYnab4JsonImportPlan(
  mode: Ynab4JsonImportMode,
  entryPoint: Ynab4JsonImportEntryPoint,
): Ynab4JsonImportPlan {
  const replaceCurrentBudget = mode === "replace-current-budget";

  return {
    mode,
    entryPoint,
    destructive: replaceCurrentBudget,
    createsBudget: !replaceCurrentBudget,
    requiresExistingBudget: replaceCurrentBudget,
    progressSteps: PROGRESS_STEPS.map((step) => ({ ...step })),
  };
}

export function analyseYnab4JsonText(text: string): Ynab4JsonAuditResult {
  const warnings: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      isJson: false,
      isPotentialYnab4Json: false,
      rootKind: "other",
      topLevelKeys: [],
      detectedSections: [],
      warnings: ["File is not valid JSON. YNAB4 migration requires the JSON data file, not CSV export files."],
    };
  }

  const rootKind = Array.isArray(parsed) ? "array" : parsed !== null && typeof parsed === "object" ? "object" : "other";
  const topLevelKeys = rootKind === "object" ? Object.keys(parsed as Record<string, unknown>).sort() : [];
  const lowerKeyLookup = new Map(topLevelKeys.map((key) => [key.toLowerCase(), key]));
  const detectedSections = YNAB4_JSON_SECTION_HINTS.filter((hint) => lowerKeyLookup.has(hint.toLowerCase())).map(
    (hint) => lowerKeyLookup.get(hint.toLowerCase()) ?? hint,
  );

  if (rootKind !== "object") {
    warnings.push("YNAB4 JSON import expects an object at the file root.");
  }

  if (detectedSections.length === 0) {
    warnings.push("No known YNAB4 JSON section names were detected yet. A real/sanitised YNAB4 file is needed to finalise mapping.");
  }

  return {
    isJson: true,
    isPotentialYnab4Json: rootKind === "object" && detectedSections.length > 0,
    rootKind,
    topLevelKeys,
    detectedSections,
    warnings,
  };
}

export function isRegisterTransactionImportFileName(fileName: string): boolean {
  return /\.(csv|qif|ofx|qfx)$/i.test(fileName.trim());
}

export function isYnab4JsonImportFileName(fileName: string): boolean {
  return /\.(json|ynab4)$/i.test(fileName.trim());
}
