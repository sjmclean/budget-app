import { readFileSync } from "node:fs";
import { join } from "node:path";

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);
const registerCss = readFileSync(
  join(process.cwd(), "apps/web/src/styles/register.css"),
  "utf8",
);

function expectContains(source: string, value: string): void {
  if (!source.includes(value)) {
    throw new Error(`Missing expected text: ${value}`);
  }
}

expectContains(registerPage, "RegisterSearchDropdown");
expectContains(registerPage, "buildRegisterSearchSuggestions");
expectContains(registerPage, "transactionMatchesSearch");
expectContains(registerPage, "committedRegisterSearch");
expectContains(registerPage, "Search payees, categories, memos or amounts");
expectContains(registerPage, "handleRegisterSearchShortcut");
expectContains(registerPage, "register-search-status");

expectContains(registerCss, ".register-search-shell");
expectContains(registerCss, ".register-search-dropdown");
expectContains(registerCss, ".register-search-suggestion-active");
expectContains(registerCss, ".register-search-status");

console.log("v2.38.0 register search 2.0 checks passed");
