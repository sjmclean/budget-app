import { readFileSync } from "node:fs";
import { join } from "node:path";

const payeePage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/PayeeManagementPage.tsx"),
  "utf8",
);

function expectContains(source: string, value: string): void {
  if (!source.includes(value)) {
    throw new Error(`Missing expected text: ${value}`);
  }
}

if (payeePage.includes("<DndContext")) {
  throw new Error("Payee merge must not expose drag-and-drop interaction");
}
expectContains(payeePage, "Actions ▾");
expectContains(payeePage, "Merge with another payee");
expectContains(payeePage, ">Preview");
expectContains(payeePage, "Merge Preview");
expectContains(payeePage, 'type="checkbox"');

console.log("v2.37.1 explicit payee merge checks passed");
