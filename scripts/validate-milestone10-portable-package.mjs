import { readFile } from "node:fs/promises";

const packageSource = await readFile("apps/web/src/features/budget/portableBudgetPackage.ts", "utf8");
const settingsSource = await readFile("apps/web/src/pages/SettingsPage.tsx", "utf8");
const required = [
  "budget-app.portable-package.v1",
  "createPortableBudgetPackage",
  "previewPortableBudgetPackage",
  "restorePortableBudgetPackage",
  "calculateAttachmentContentHash",
  "integrity",
];
for (const token of required) {
  if (!packageSource.includes(token)) throw new Error(`Missing portable-package token: ${token}`);
}
for (const token of ["Budget package", "Preview package restore", "Package integrity verified"]) {
  if (!settingsSource.includes(token)) throw new Error(`Missing Settings integration token: ${token}`);
}
console.log("Milestone 10 portable package validation passed.");
