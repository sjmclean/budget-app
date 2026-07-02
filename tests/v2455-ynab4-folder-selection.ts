import { readFileSync } from "node:fs";

const dialog = readFileSync("apps/web/src/pages/budgetSelector/BudgetImportDialog.tsx", "utf8");

if (!dialog.includes("function selectedFilesLookLikeYnab4Package")) {
  throw new Error("Expected Budget Import to classify directory-backed YNAB4 package selections before generic import detection");
}

if (!dialog.includes("selectedFilesLookLikeYnab4Package(selectedFiles)")) {
  throw new Error("Expected the generic file selection handler to route YNAB4-shaped selections into the YNAB4 pipeline");
}

if (!dialog.includes("FileList | File[] | null")) {
  throw new Error("Expected the YNAB4 package selection handler to accept both input FileList and directory picker File[] results");
}

if (!dialog.includes("await handleYnab4PackageSelection(files)")) {
  throw new Error("Expected showDirectoryPicker results to use the same YNAB4 package pipeline as the fallback folder input");
}

if (!dialog.includes("directoryPicker.call(window)")) {
  throw new Error("Expected showDirectoryPicker to be invoked with the window receiver to avoid illegal invocation failures");
}

if (!dialog.includes("isYnab4BudgetFile(file)")) {
  throw new Error("Expected direct Budget.ymeta/Budget.yfull/Budget.json selections to be recognised as YNAB4 package files");
}

if (dialog.includes("await handleYnab4PackageEntries(await readYnab4PackageEntriesFromFiles(files));")) {
  throw new Error("Expected manual directory browsing to avoid a second bespoke YNAB4 path");
}

console.log("v2.45.5 YNAB4 folder selection routing checks passed");
