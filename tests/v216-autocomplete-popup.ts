import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const registerPage = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const registerCss = readFileSync("apps/web/src/styles/register.css", "utf8");
const packageJson = readFileSync("package.json", "utf8");

assert(packageJson.includes('"test:v216"'), "package.json should include test:v216");
assert(
  packageJson.includes('"test:v216:autocomplete-popup"'),
  "package.json should include test:v216:autocomplete-popup",
);

assert(
  registerPage.includes('type: "payee" | "transfer"'),
  "Payee autocomplete should distinguish payees from transfers",
);

assert(
  registerPage.includes('getPayeeSuggestionSection'),
  "Payee autocomplete should render grouped suggestion sections",
);

assert(
  registerPage.includes('getCategorySuggestionSection'),
  "Category autocomplete should render grouped suggestion sections",
);

assert(
  registerPage.includes('register-category-suggestions'),
  "Category autocomplete should use the shared popup presentation",
);

assert(
  registerCss.includes('.register-autocomplete-popup'),
  "Shared autocomplete popup CSS should exist",
);

assert(
  registerCss.includes('width: max-content'),
  "Autocomplete popup should not be locked to input width",
);

assert(
  registerCss.includes('min-width: min(24rem'),
  "Autocomplete popup should have a readable minimum width",
);

assert(
  registerCss.includes('.register-autocomplete-section-heading'),
  "Autocomplete popup should support section headings",
);

console.log("v2.16 autocomplete popup regression checks passed");
