import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const registerPage = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const registerStyles = readFileSync(
  "apps/web/src/styles/register.css",
  "utf8",
);

assert(
  registerPage.includes('className="register-split-remove-button"'),
  "split editor should use a compact left-side remove button",
);

assert(
  !registerPage.includes(">\n            Remove\n          </button>"),
  "split editor should not render full-width Remove buttons on each split line",
);

assert(
  registerPage.includes('register-split-balance-label') &&
    registerPage.includes("Amount to assign"),
  "split footer should use the compact Amount to assign label",
);

assert(
  !registerPage.includes("Parent amount") &&
    !registerPage.includes("Split total") &&
    !registerPage.includes("Amount remaining to assign"),
  "split footer should remove the parent/split/remaining summary blocks",
);

assert(
  registerPage.includes("totalsFromSplitDrafts"),
  "split balance display should use draft split amounts, not only validated split lines",
);

assert(
  registerPage.includes("balanceStatus.isBalanced"),
  "split save workflow should still depend on split balance status",
);

assert(
  registerPage.includes("event.key === \"Tab\"") &&
    registerPage.includes("createSplitLineDraft()"),
  "tabbing from the final split amount should add another split row",
);

assert(
  registerPage.includes("visibleColumnIds={visibleColumnIds}") &&
    registerPage.includes("rowStyle={rowStyle}"),
  "split editor should receive the active register grid layout",
);

assert(
  registerPage.includes("renderSplitCell") &&
    registerPage.includes('columnId === "category"') &&
    registerPage.includes('columnId === "memo"') &&
    registerPage.includes('columnId === "outflow"') &&
    registerPage.includes('columnId === "inflow"'),
  "split editor should render split fields into the register Category/Memo/Outflow/Inflow columns",
);

assert(
  registerStyles.includes("register-split-grid-row") &&
    registerStyles.includes("register-split-cell-with-remove") &&
    registerStyles.includes("register-split-remove-button"),
  "split editor styles should align split rows to the register grid with a compact remove control",
);

assert(
  !registerStyles.includes("padding: 0.75rem 1rem 0.85rem 28.2rem"),
  "split editor should not rely on hard-coded left padding for alignment",
);

assert(
  registerStyles.includes("register-split-assign-outflow") &&
    registerStyles.includes("#dc2626") &&
    registerStyles.includes("register-split-assign-inflow") &&
    registerStyles.includes("#15803d"),
  "amount-to-assign styles should colour outflow red and inflow green",
);

console.log("v2.21.1 split editor polish checks passed");
