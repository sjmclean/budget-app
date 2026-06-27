import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const registerPage = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const tableLayout = readFileSync("apps/web/src/features/tableLayout/tableLayout.ts", "utf8");
const registerCss = readFileSync("apps/web/src/styles/register.css", "utf8");
const packageJson = readFileSync("package.json", "utf8");

assert(packageJson.includes('"test:v2191"'), "package.json should include test:v2191");
assert(
  registerPage.includes('template: "minmax(6.5rem, 1.45fr)"') &&
    registerPage.includes('template: "minmax(6.5rem, 1.2fr)"') &&
    registerPage.includes('template: "minmax(5.5rem, 1.3fr)"'),
  "payee, category, and memo columns should compress before the register overflows",
);
assert(
  registerPage.includes('template: "minmax(5.6rem, 7.2rem)"') &&
    registerPage.includes('template: "minmax(6.2rem, 7.5rem)"'),
  "money and balance columns should remain compact but readable",
);
assert(
  tableLayout.includes("getMinimumColumnWidthRem(column)") &&
    tableLayout.includes("typeof columnWidths[column.id]"),
  "table minimum width should use column minimums unless the user has resized a column",
);
assert(
  registerCss.includes("text-overflow: ellipsis") &&
    registerCss.includes("white-space: nowrap"),
  "flexible register cells should use ellipsis instead of forcing early overflow",
);

console.log("v2.19.1 register responsive compression checks passed");
