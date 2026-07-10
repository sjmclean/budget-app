import { readFileSync, writeFileSync } from "node:fs";

const path = "apps/web/src/pages/budgetSelector/BudgetImportDialog.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(search, replacement, description) {
  if (!source.includes(search)) {
    throw new Error(`Unable to apply v288 import UX polish: missing ${description}`);
  }
  source = source.replace(search, replacement);
}

replaceOnce(
  `  BudgetImportProgressIndicator,\n  type BudgetImportProgressPhase,\n} from "./BudgetImportProgress";`,
  `  BudgetImportProgressIndicator,\n  type BudgetImportProgressCounts,\n  type BudgetImportProgressPhase,\n} from "./BudgetImportProgress";`,
  "progress imports",
);

replaceOnce(
  `const actualBudgetImportProviderService = new BudgetImportProviderApplicationService();`,
  `const actualBudgetImportProviderService = new BudgetImportProviderApplicationService();\n\nconst IMPORT_PHASE_DWELL_MS = 240;\n\nasync function showImportPhase(\n  setPhase: (phase: BudgetImportProgressPhase) => void,\n  phase: BudgetImportProgressPhase,\n): Promise<void> {\n  setPhase(phase);\n  await new Promise<void>((resolve) => {\n    window.setTimeout(resolve, IMPORT_PHASE_DWELL_MS);\n  });\n}`,
  "import phase helper",
);

replaceOnce(
  `  const [budgetImportResult, setBudgetImportResult] =\n    useState<BudgetImportResultSummary | null>(null);`,
  `  const [budgetImportResult, setBudgetImportResult] =\n    useState<BudgetImportResultSummary | null>(null);\n  const [budgetImportProgressCounts, setBudgetImportProgressCounts] =\n    useState<BudgetImportProgressCounts | null>(null);`,
  "progress counts state",
);

replaceOnce(
  `  }) {\n    setBudgetImportProgressPhase("importing-accounts");\n\n    try {\n      setBudgetImportProgressPhase("importing-transactions");\n      const result = await importYnab4Budget(input);\n      setBudgetImportProgressPhase("finalising");`,
  `  }) {\n    try {\n      await showImportPhase(setBudgetImportProgressPhase, "importing-accounts");\n      await showImportPhase(setBudgetImportProgressPhase, "importing-categories");\n      await showImportPhase(setBudgetImportProgressPhase, "importing-payees");\n      setBudgetImportProgressPhase("importing-transactions");\n      const result = await importYnab4Budget(input);\n      await showImportPhase(setBudgetImportProgressPhase, "finalising");`,
  "YNAB4 import phase sequence",
);

replaceOnce(
  `    setIsImportingActual(true);\n    setBudgetImportProgressPhase("importing-accounts");\n    setActualStatus(\`Importing \${preview.providerLabel}…\`);\n\n    try {\n      setBudgetImportProgressPhase("importing-categories");\n      setBudgetImportProgressPhase("importing-payees");\n      setBudgetImportProgressPhase("importing-transactions");\n      const result = await importActualBudget({`,
  `    setIsImportingActual(true);\n    setActualStatus(\`Importing \${preview.providerLabel}…\`);\n\n    try {\n      await showImportPhase(setBudgetImportProgressPhase, "importing-accounts");\n      await showImportPhase(setBudgetImportProgressPhase, "importing-categories");\n      await showImportPhase(setBudgetImportProgressPhase, "importing-payees");\n      setBudgetImportProgressPhase("importing-transactions");\n      const result = await importActualBudget({`,
  "Actual import phase sequence",
);

replaceOnce(
  `      setBudgetImportProgressPhase("finalising");\n      onImportedBudgetSelected(result.budget.id);`,
  `      await showImportPhase(setBudgetImportProgressPhase, "finalising");\n      onImportedBudgetSelected(result.budget.id);`,
  "Actual finalising phase",
);

replaceOnce(
  `      setBudgetImportProgressPhase("inspecting");\n\n      if (actualPreviewContainsCreditCards(preview)) {`,
  `      setBudgetImportProgressPhase("inspecting");\n      setBudgetImportProgressCounts({\n        accounts: preview.accounts.length,\n        categoryGroups: preview.categoryGroups.length,\n        categories: preview.categories.length,\n        payees: preview.payees.length,\n        transactions: preview.transactions.length,\n      });\n\n      if (actualPreviewContainsCreditCards(preview)) {`,
  "Actual preview counts",
);

replaceOnce(
  `    setBudgetImportResult(null);\n    setPendingCreditCardImport(null);`,
  `    setBudgetImportResult(null);\n    setBudgetImportProgressCounts(null);\n    setPendingCreditCardImport(null);`,
  "reset progress counts",
);

replaceOnce(
  `      const discovery = discoverYnab4Package(entries);\n      setBudgetImportProgressPhase("inspecting");`,
  `      const discovery = discoverYnab4Package(entries);\n      setBudgetImportProgressCounts({\n        accounts: discovery.counts.accounts,\n        categoryGroups: discovery.counts.masterCategories,\n        categories: discovery.counts.categories,\n        payees: discovery.counts.payees,\n        transactions: discovery.counts.transactions,\n        scheduledTransactions: discovery.counts.scheduledTransactions,\n      });\n      setBudgetImportProgressPhase("inspecting");`,
  "YNAB4 discovery counts",
);

replaceOnce(
  `      } catch (error) {\n        if (error instanceof DOMException && error.name === "AbortError") return;\n\n        setYnabError(\n          error instanceof Error\n            ? error.message\n            : "Unable to read the selected YNAB4 folder.",\n        );\n        setBudgetImportProgressPhase("failed");\n        return;\n      }\n    }\n\n    ynab4FolderInputRef.current?.click();`,
  `      } catch (error) {\n        if (error instanceof DOMException && error.name === "AbortError") return;\n\n        // Some browsers expose showDirectoryPicker but block it outside a secure\n        // context or after a permissions failure. Fall back to the widely\n        // supported webkitdirectory input instead of leaving folder browsing unusable.\n      }\n    }\n\n    ynab4FolderInputRef.current?.click();`,
  "directory picker fallback",
);

replaceOnce(
  `<BudgetImportProgressIndicator phase={budgetImportProgressPhase} />`,
  `<BudgetImportProgressIndicator\n            phase={budgetImportProgressPhase}\n            counts={budgetImportProgressCounts}\n          />`,
  "progress indicator counts",
);

writeFileSync(path, source);
console.log("Applied v288 budget import UX polish");
