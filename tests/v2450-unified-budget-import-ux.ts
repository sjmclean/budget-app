import { readFileSync } from "node:fs";

const page = [
  readFileSync("apps/web/src/pages/BudgetSelectorPage.tsx", "utf8"),
  readFileSync("apps/web/src/pages/budgetSelector/BudgetImportDialog.tsx", "utf8"),
  readFileSync("apps/web/src/pages/budgetSelector/BudgetImportProgress.tsx", "utf8"),
].join("\n");
const styles = readFileSync("apps/web/src/styles/globals.css", "utf8");

if (!page.includes('budgetImport')) {
  throw new Error("Expected Budget Selector to expose a unified budget import launch mode");
}

if (!page.includes("<strong>Migrate Budget</strong>") && !page.includes("<strong>Import Budget</strong>")) {
  throw new Error("Expected launcher to show a single Budget Migration entry point");
}

if (page.includes("<strong>Import Actual Budget</strong>") || page.includes("<strong>Import YNAB4</strong>")) {
  throw new Error("Expected provider-specific budget import launcher buttons to be removed");
}

for (const provider of ["Actual Budget", "YNAB4", "Budget Backup", "YNAB Online"]) {
  if (!page.includes(provider)) throw new Error(`Expected compact budget import helper text to include ${provider}`);
}

if (!page.includes("Transaction imports stay separate") && !page.includes("Transaction import remains separate")) {
  throw new Error("Expected Budget Import UX to keep transaction imports conceptually separate");
}

for (const phase of ["Reading file", "Detecting format", "Inspecting budget", "Preparing import", "Importing transactions", "Finalising import"]) {
  if (!page.includes(phase)) throw new Error(`Expected import progress phase: ${phase}`);
}

if (!page.includes("BudgetImportProgressIndicator") || !styles.includes("budget-import-progress-bar")) {
  throw new Error("Expected Budget Import UX to render a progress indicator with a progress bar");
}

if (!page.includes("Drop your budget here or click to browse") || !page.includes("handleBudgetImportSelection")) {
  throw new Error("Expected Budget Import UX to support compact drag/drop direct import");
}

if (!page.includes("attachDirectoryPickerAttributes") || !page.includes('setAttribute("webkitdirectory"')) {
  throw new Error("Expected YNAB4 folder picker to explicitly enable directory selection");
}

if (!page.includes("handleYnab4PackageSelection(event.currentTarget.files)")) {
  throw new Error("Expected manual YNAB4 folder picker to use the YNAB4 package path instead of the generic file importer");
}

if (!page.includes("handleBudgetImportDrop") || !page.includes("readYnab4PackageEntriesFromDataTransfer") || !page.includes("webkitGetAsEntry")) {
  throw new Error("Expected YNAB4 folder drag/drop to read dropped directory entries instead of relying only on dataTransfer.files");
}

if (!styles.includes("pointer-events: auto")) {
  throw new Error("Expected YNAB4 folder picker input to remain clickable after compact drop-zone styling");
}

if (page.includes("Supported budget imports") || page.includes("Budget import providers")) {
  throw new Error("Expected compact Budget Import UX to remove the long provider list");
}

if (page.includes("Review the full-budget preview before continuing")) {
  throw new Error("Expected Budget Import UX to skip the preview-first workflow");
}

if (page.includes('launchMode === "actual"') || page.includes('launchMode === "ynab"')) {
  throw new Error("Expected obsolete provider-specific preview launch modes to be removed");
}

if (page.includes("Ynab4PreviewDetails") || page.includes("Ynab4PreviewLine")) {
  throw new Error("Expected obsolete preview-only helper components to be removed from BudgetSelectorPage");
}

if (!styles.includes("budget-import-drop-zone") || !styles.includes("budget-import-compact-card")) {
  throw new Error("Expected compact unified budget import drop-zone styles");
}

console.log("v2.45.0 unified budget import UX checks passed");
