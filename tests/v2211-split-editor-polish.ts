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
  registerPage.includes('balanceStatus.activeSide === "outflow"') &&
    registerPage.includes("-Math.abs(balanceStatus.remaining)"),
  "outflow amount-to-assign values should render as negative amounts",
);

assert(
  registerPage.includes('balanceStatus.activeSide === "inflow"') &&
    registerPage.includes("formatMoney(Math.abs(balanceStatus.remaining), currencyCode)"),
  "inflow amount-to-assign values should render as positive amounts",
);

assert(
  registerStyles.includes("grid-template-columns: 1.55rem") &&
    registerStyles.includes("register-split-remove-button"),
  "split editor styles should allocate a compact leading remove column",
);

assert(
  registerStyles.includes("padding: 0.75rem 1rem 0.85rem 28.2rem"),
  "split editor should shift right so split categories align closer to the Category column",
);

assert(
  registerStyles.includes("register-split-assign-outflow") &&
    registerStyles.includes("#dc2626") &&
    registerStyles.includes("register-split-assign-inflow") &&
    registerStyles.includes("#15803d"),
  "amount-to-assign styles should colour outflow red and inflow green",
);

console.log("v2.21.1 split editor polish checks passed");
