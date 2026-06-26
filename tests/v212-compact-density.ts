import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const registerPage = read("apps/web/src/pages/AccountRegisterPage.tsx");
const budgetPage = read("apps/web/src/pages/BudgetPage.tsx");
const globalsCss = read("apps/web/src/styles/globals.css");
const registerCss = read("apps/web/src/styles/register.css");
const packageJson = read("package.json");

assert(packageJson.includes('"test:v212"'), "package.json should include test:v212");
assert(
  packageJson.includes('"test:v212:compact-density"'),
  "package.json should include test:v212:compact-density",
);

assert(
  registerPage.includes('template: "6.4rem"') && registerPage.includes('widthRem: 6.4'),
  "register date column should use a compact readable width",
);
assert(
  registerPage.includes('template: "minmax(9rem, 1.15fr)"'),
  "register payee column should have a compact flexible default",
);
assert(
  registerPage.includes('template: "minmax(8.5rem, 1fr)"'),
  "register category column should have a compact flexible default",
);
assert(
  registerPage.includes('template: "6.6rem"') && registerPage.includes('minimumWidthRem: 58'),
  "register money columns and minimum table width should be tuned for medium screens",
);

assert(
  budgetPage.includes('template: "minmax(15rem, 1fr)"') &&
    budgetPage.includes('minimumWidthRem: 30'),
  "budget table defaults should be compact without hiding core columns",
);
assert(
  budgetPage.includes('template: "7rem"'),
  "budget money columns should use compact widths",
);

assert(
  globalsCss.includes('margin-left: 14rem') && globalsCss.includes('width: 14rem'),
  "sidebar and content offset should use the compact sidebar width",
);
assert(
  globalsCss.includes('grid-template-columns: minmax(0, 1fr) 18rem'),
  "budget inspector should stay beside the table but use a narrower default width",
);
assert(
  globalsCss.includes('grid-template-columns: minmax(0, 1fr) 16rem'),
  "budget inspector should remain side-by-side at medium widths",
);
assert(
  !globalsCss.includes('grid-template-columns: 1fr;\n  }\n\n  .budget-month-panel {\n    position: static;'),
  "budget inspector should not be forced below the table at medium widths",
);

assert(
  registerCss.includes('min-width: 58rem') && registerCss.includes('gap: 0.45rem'),
  "register CSS should use compact table width and gaps",
);
assert(
  registerCss.includes('padding: 0.38rem 0.62rem'),
  "register rows should be denser without reducing font size too far",
);

console.log("v2.12 compact density regression checks passed");
