import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(
  join(process.cwd(), "apps/web/src/styles/globals.css"),
  "utf8",
);

function expectContains(value: string, message: string): void {
  if (!css.includes(value)) {
    throw new Error(`${message}\nMissing: ${value}`);
  }
}

expectContains(".budget-workspace-row-dragging", "Row dragging style should exist.");
expectContains(".budget-workspace-group-dragging", "Group dragging style should exist.");
expectContains("cursor: grabbing", "Dragged rows should use grabbing cursor.");
expectContains("transform: translateY(-1px) scale(1.012)", "Dragged rows should lift slightly.");
expectContains(".budget-workspace-row-drop-before", "Drop-before indicator should exist.");
expectContains(".budget-workspace-row-drop-after", "Drop-after indicator should exist.");
expectContains("transition:", "Budget drag polish should include transitions.");
expectContains("will-change: transform", "Drag animation should hint transform changes.");

console.log("v2.36.0 budget drag polish checks passed");
