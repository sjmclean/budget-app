import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const row = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);
const styles = readFileSync("apps/web/src/styles/register.css", "utf8");

assert(
  row.includes('event.key === "ArrowDown"') &&
    row.includes('event.key === "ArrowUp"') &&
    row.includes("moveActiveOption"),
  "Tag picker must support arrow-key option navigation",
);
assert(
  row.includes('event.key === " "') && row.includes("activateOption(activeOptionIndex)"),
  "Space must toggle the active tag option",
);
assert(
  row.includes('(event.ctrlKey || event.metaKey) && event.key === "Enter"') &&
    row.includes("saveTags();"),
  "Ctrl/Cmd+Enter must save staged tag changes",
);
assert(
  row.includes('role="listbox"') &&
    row.includes('role="option"') &&
    row.includes("aria-activedescendant={activeOptionId}"),
  "Keyboard navigation must expose listbox active-option semantics",
);
assert(
  row.includes("onMouseEnter={() => setActiveOptionIndex(index)}") &&
    styles.includes(".transaction-tag-picker-option-active"),
  "Pointer and keyboard navigation must share the same visible active state",
);

console.log("v3.05.1 register tag keyboard navigation checks passed.");
