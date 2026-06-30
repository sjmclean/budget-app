import { readFileSync } from "node:fs";
import { join } from "node:path";

const payeePage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/PayeeManagementPage.tsx"),
  "utf8",
);

const webPackageJson = readFileSync(
  join(process.cwd(), "apps/web/package.json"),
  "utf8",
);

function expectContains(source: string, value: string): void {
  if (!source.includes(value)) {
    throw new Error(`Missing expected text: ${value}`);
  }
}

expectContains(webPackageJson, "@dnd-kit/core");
expectContains(payeePage, "DndContext");
expectContains(payeePage, "useDraggable");
expectContains(payeePage, "useDroppable");

console.log("v2.37.1 payee dnd-kit merge checks passed");
