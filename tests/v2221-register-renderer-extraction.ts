import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const transactionRow = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);
const accountRegisterPage = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const packageJson = readFileSync("package.json", "utf8");

assert(
  transactionRow.includes('import type { RegisterLayoutMode } from "../registerLayoutMode"'),
  "TransactionRow should consume the shared register layout mode type",
);

assert(
  transactionRow.includes("interface TransactionRowRendererProps") &&
    transactionRow.includes("interface TransactionRowProps extends TransactionRowRendererProps"),
  "TransactionRow should separate renderer props from layout selection props",
);

assert(
  transactionRow.includes("const DesktopTransactionRow = memo(function DesktopTransactionRow") &&
    transactionRow.includes("function CompactTransactionRow") &&
    transactionRow.includes("function TabletTransactionRow") &&
    transactionRow.includes("function MobileTransactionRow"),
  "TransactionRow should expose renderer shells for desktop, compact, tablet, and mobile modes",
);

assert(
  transactionRow.includes('layoutMode === "compact"') &&
    transactionRow.includes('layoutMode === "tablet"') &&
    transactionRow.includes('layoutMode === "mobile"') &&
    transactionRow.includes("return <DesktopTransactionRow {...props} />"),
  "TransactionRow should route through the renderer selected by layout mode",
);

assert(
  accountRegisterPage.includes("layoutMode={registerLayoutMode}"),
  "AccountRegisterPage should pass the active register layout mode into TransactionRow",
);

assert(
  packageJson.includes('"test:v2221"') &&
    packageJson.includes("v2221-register-renderer-extraction.ts"),
  "package scripts should include the v2.22.1 renderer extraction test",
);

console.log("v2.22.1 register renderer extraction checks passed");
